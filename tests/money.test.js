// Money is rounded, converted to cents, split into deposits and shown by src/utils/money.js only.
// Invoices, Square payment links, the bid calculator, estimates and PDFs all use it.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockPackage, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();

const squareBodies = [];
mockPackage("axios", {
  post: async (url, body) => {
    squareBodies.push(body);
    return { data: { payment_link: { id: "L", url: "U", order_id: "O" } } };
  },
});

const money = loadFromRoot("src/utils/money.js");
const { INVOICE } = loadFromRoot("src/config/rules.js");
const { paymentPurposeTypes } = loadFromRoot("src/config/types.js");
const square = loadFromRoot("src/services/Common/square.service.js"); // the real one, for its own tests

// createInvoice runs as in production up to the Square link and the PDF, which are recorded
const invoiceLinks = [];
mockModule("src/services/Common/square.service.js", {
  generateInvoicePaymentLink: async (args) => invoiceLinks.push(args) && { paymentUrl: "U", paymentLinkId: "L" },
  deleteSquarePaymentLink: async () => {},
});
mockModule("src/config/puppeteer.js", { generateInvoicePDF: async () => "/tmp/RHK1.pdf" });
const invoiceService = loadFromRoot("src/services/Common/invoice.service.js");

const DEPOSIT_MESSAGE = "Deposit percentage must be greater than 0 and less than 100.";

const quietly = async (fn) => {
  const { log, info, warn, error } = console;
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info, warn, error });
  }
};

test("amounts round to cents, and to whole cents for Square", () => {
  assert.equal(money.roundMoney(10.004), 10);
  assert.equal(money.roundMoney("19.999"), 20);
  assert.equal(money.roundMoney(0.1 + 0.2), 0.3);
  assert.equal(money.toCents(19.99), 1999, "19.99 * 100 is 1998.9999...");
  assert.equal(money.toCents(0.29), 29);
  assert.equal(money.toCents("100.10"), 10010);
});

test("an amount sent by the app must be positive with at most two decimals", () => {
  assert.equal(money.parseAmountToCents("12.50"), 1250);
  assert.equal(money.parseAmountToCents(" 7 "), 700);
  assert.equal(money.parseAmountToCents(0.29), 29);
  for (const bad of [0, -5, "12.345", "", " ", "abc", null, undefined, true, [10], Infinity]) {
    assert.equal(money.parseAmountToCents(bad), null, String(bad));
  }
});

test("a deposit splits the total into deposit and balance, each in cents", () => {
  assert.deepEqual(money.splitDeposit(1000, INVOICE.DEFAULT_DEPOSIT_PERCENT), { deposit: 250, balance: 750 });
  assert.deepEqual(money.splitDeposit("100.01", 25), { deposit: 25, balance: 75.01 });
  assert.deepEqual(money.splitDeposit(99.99, 33.33), { deposit: 33.33, balance: 66.66 });
});

test("deposit percentages must be more than 0 and less than 100", () => {
  for (const bad of [0, 100, -10, 150, NaN]) {
    assert.throws(() => money.assertDepositPercent(bad), (err) => err.statusCode === 400 && err.message === DEPOSIT_MESSAGE, String(bad));
  }
  money.assertDepositPercent(25);
  money.assertDepositPercent(99.5);
});

test("PDF and estimate amounts keep their formats", () => {
  assert.equal(money.formatAmount(12.5), "12.5");
  assert.equal(money.formatAmount("12.50"), "12.5");
  assert.equal(money.formatAmount(0.035), "0.035");
  assert.equal(money.formatAmount(100), "100");
  for (const missing of [null, undefined, "", "abc", NaN, 0]) assert.equal(money.formatAmount(missing), "0");
  assert.equal(money.formatUsd(60), "$60.00");
  assert.equal(money.formatUsd(0.1 * 3), "$0.30");
});

const newInvoice = (overrides = {}) => ({
  user_id: 9,
  invoice_date: "2026-10-16",
  billing_date: "2026-10-20",
  due_date: "2026-11-19",
  to_company_name: "Acme",
  items: [{ description: "Janitorial", quantity: 1, unit_price: "99.99" }],
  ...overrides,
});

const createInvoice = async (body) => {
  const created = [];
  models.Invoice.create = async (values) => created.push(values) && { id: 31, ...values, update: async () => {} };
  invoiceLinks.length = 0;
  await quietly(() => invoiceService.createInvoice(body));
  return { row: created[0], link: invoiceLinks[0] };
};

test("a new invoice stores its deposit and balance, and the first link charges the deposit", async () => {
  const { row, link } = await createInvoice(newInvoice({ deposit_required: "true", deposit_percentage: 33.33, balance_date: "2026-11-01" }));
  assert.equal(row.total_due, 99.99);
  assert.deepEqual([row.deposit_percentage, row.deposit_amount, row.balance_amount], [33.33, 33.33, 66.66]);
  assert.equal(link.amount, 33.33);
  assert.equal(link.paymentPurpose, paymentPurposeTypes.DEPOSIT);
});

test("a deposit without a percentage uses the default 25%; no deposit stores no split", async () => {
  const deposit = await createInvoice(newInvoice({ deposit_required: true, balance_date: "2026-11-01" }));
  assert.deepEqual([deposit.row.deposit_percentage, deposit.row.deposit_amount, deposit.row.balance_amount], [25, 25, 74.99]);

  const full = await createInvoice(newInvoice());
  assert.deepEqual([full.row.deposit_percentage, full.row.deposit_amount, full.row.balance_amount], [25, null, null]);
  assert.equal(full.link.amount, 99.99);
});

test("an invoice deposit that is not more than 0% and less than 100% is refused", async () => {
  for (const deposit_percentage of [100, 0, "abc"]) {
    await assert.rejects(
      createInvoice(newInvoice({ deposit_required: true, deposit_percentage, balance_date: "2026-11-01" })),
      (err) => err.statusCode === 400 && err.message === DEPOSIT_MESSAGE,
      String(deposit_percentage),
    );
  }
});

test("the invoice table's default deposit percentage is the same rule", () => {
  const Invoice = loadFromRoot("src/models/invoice.model.js");
  assert.equal(Invoice.rawAttributes.deposit_percentage.defaultValue, INVOICE.DEFAULT_DEPOSIT_PERCENT);
});

test("Square payment links charge the amount in cents", async () => {
  const payments = [];
  models.Payment.create = async (row) => payments.push(row) && row;
  models.Payment.findOne = async () => null;
  squareBodies.length = 0;
  await quietly(async () => {
    await square.generateSquarePaymentLink({ amount: 19.99, refNo: "Q-1", customerEmail: "c@example.com", user_id: 9 });
    await square.generateContractPaymentLink({ amount: 250.5, clientName: "Acme", customerEmail: "c@example.com", user_id: 9 });
    await square.generateInvoicePaymentLink({ amount: 0.29, clientName: "Acme", customerEmail: "c@example.com", user_id: 9, invoice_id: 3, invoiceRefNo: "RHK3" });
  });
  assert.deepEqual(squareBodies.map((body) => body.order.line_items[0].base_price_money.amount), [1999, 25050, 29]);
  assert.equal(payments.find((p) => p.description === "Contract Payment - Acme").amount, 250.5);
});

test("a contract price sent as text is recorded (the payment row used to fail after Square made the link)", async () => {
  const payments = [];
  models.Payment.create = async (row) => payments.push(row) && row;
  squareBodies.length = 0;
  const { paymentUrl } = await quietly(() =>
    square.generateContractPaymentLink({ amount: "1200.50", clientName: "Acme", customerEmail: "c@example.com", user_id: 9 }),
  );
  assert.equal(paymentUrl, "U");
  assert.equal(squareBodies[0].order.line_items[0].base_price_money.amount, 120050);
  assert.equal(payments[0].amount, 1200.5);
});
