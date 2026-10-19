// Creating and updating invoices (src/services/Common/invoice/invoices.js): the rows written, the
// totals and deposit split, the recurring schedule, the Square link and the PDF, and the email
// send time. The clock is fixed at 10:00 New York time on 2026-10-16.
require("./helpers/env");
const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot } = require("./helpers/mocks");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });

const db = recordingDatabase();
recordingModule("src/services/Common/square.service.js", db.log, {
  generateInvoicePaymentLink: ({ amount }) => ({ paymentUrl: `https://square.test/pay/${amount}` }),
});
recordingModule("src/services/Common/pdf.service.js", db.log, { generateInvoicePDF: ({ invoice_ref_no }) => `/srv/uploads/docs/invoice-${invoice_ref_no}.pdf` });
recordingModule("src/services/Common/email.service.js", db.log, {});

const invoices = loadFromRoot("src/services/Common/invoice.service.js");

const items = [
  { description: "Janitorial", quantity: 2, unit_price: 100, calculation_type: "hour", hour: 3 },
  { description: "Floors", quantity: 1, unit_price: 0.5, calculation_type: "sqft", sqft: 1000 },
  { description: "Windows", quantity: "", unit_price: "40", calculation_type: "flat" },
];

beforeEach(() => {
  db.reset();
  db.respond("Invoice.findOne", () => ({ id: 1, ref_no: "RHK4" })); // latest ref of the type
  db.respond("User.findByPk", (id) => ({ id, email: "client@example.com" }));
});

const createdInvoice = () => db.calls("Invoice.create")[0][1];

test("a manual invoice saves its items, total, 9 AM send time, Square link and PDF", async () => {
  const result = await invoices.createInvoice({
    user_id: 7,
    items,
    billing_date: "2026-10-20",
    due_date: "2026-11-19",
    service_start: "2026-10-01",
    service_end: "2026-10-31",
    event_name: "  Fall clean  ",
    to_company_name: "Test Co",
  });
  assert.equal(result.success, true);
  const invoice = createdInvoice();
  assert.deepEqual(
    [invoice.ref_no, invoice.total_due, invoice.billing_date, invoice.due_date, invoice.date, invoice.service_dates, invoice.event_name, invoice.payment_stage, invoice.deposit_required],
    ["RHK5", 2 * 100 * 3 + 0.5 * 1000 + 40, "2026-10-20", "2026-11-19", "2026-10-16", "2026-10-01 - 2026-10-31", "Fall clean", "FULL", false],
  );
  assert.equal(invoice.scheduled_send_at, "2026-10-20T13:00:00.000Z", "9:00 AM New York");
  const saved = db.calls("InvoiceItem.bulkCreate")[0][1];
  assert.deepEqual(
    saved.map((i) => [i.description, i.quantity, i.hour, i.sqft, i.amount, i.sort_order]),
    [["Janitorial", 2, 3, null, 600, 1], ["Floors", 1, null, 1000, 500, 2], ["Windows", 1, null, null, 40, 3]],
  );
  const [, link] = db.calls("square.service.generateInvoicePaymentLink")[0] ?? db.log.find(([n]) => n === "square.service.generateInvoicePaymentLink");
  assert.deepEqual([link.amount, link.paymentPurpose, link.invoiceRefNo, link.customerEmail], [1140, "FULL", "RHK5", "client@example.com"]);
  const lastUpdate = db.log.filter(([n]) => n === "Invoice#update").at(-1);
  assert.deepEqual(lastUpdate[2], { pdf_url: "https://node.socialsanitation.com/api/v1/docs/invoice-RHK5.pdf", payment_url: "https://square.test/pay/1140" });
});

test("a deposit invoice splits the total, links the deposit and needs a later balance date", async () => {
  await invoices.createInvoice({ user_id: 7, items, billing_date: "2026-10-20", deposit_required: "true", deposit_percentage: 25, balance_date: "2026-11-01" });
  const invoice = createdInvoice();
  assert.deepEqual(
    [invoice.deposit_required, invoice.deposit_percentage, invoice.deposit_amount, invoice.balance_amount, invoice.payment_stage, invoice.balance_due_date],
    [true, 25, 285, 855, "DEPOSIT_PENDING", "2026-11-01"],
  );
  const link = db.log.find(([n]) => n === "square.service.generateInvoicePaymentLink")[1];
  assert.deepEqual([link.amount, link.paymentPurpose], [285, "DEPOSIT"]);

  for (const [body, message] of [
    [{ deposit_required: true, balance_date: null }, "Please select the date for the remaining balance."],
    [{ deposit_required: true, balance_date: "2026-10-20" }, "The balance date must be after the billing date."],
  ]) {
    db.reset();
    db.respond("Invoice.findOne", () => ({ id: 1, ref_no: "RHK4" }));
    await assert.rejects(invoices.createInvoice({ user_id: 7, items, billing_date: "2026-10-20", ...body }), (err) => err.statusCode === 400 && err.message === message);
    assert.equal(db.calls("Invoice.create").length, 0, "nothing saved");
  }
});

test("a recurring invoice caps occurrences at 10 and the end date at 6 months", async () => {
  await invoices.createInvoice({ user_id: 7, items, billing_date: "2026-10-20", is_recurring: true, recurring_frequency: "WEEKLY", recurring_max_occurrences: 40, recurring_end_date: "2027-12-31" });
  const recurring = db.calls("InvoiceRecurring.create")[0][1];
  assert.deepEqual(
    [recurring.frequency, recurring.start_date, recurring.next_billing_date, recurring.max_occurrences, recurring.end_date, recurring.occurrences_generated, recurring.status],
    ["WEEKLY", "2026-10-20", "2026-10-27", 10, "2027-04-20", 1, "ACTIVE"],
  );
  db.reset();
  db.respond("Invoice.findOne", () => ({ id: 1, ref_no: "RHK4" }));
  await assert.rejects(invoices.createInvoice({ user_id: 7, items, billing_date: "2026-10-20", is_recurring: true }), (err) => err.statusCode === 400 && /recurring_end_date or recurring_max_occurrences/.test(err.message));
});

test("an invoice from a quote copies the quote, once", async () => {
  db.respond("ServiceQuote.findByPk", (id) => ({ id, user_id: 8, ref_type: "Q", total_due: "321.50", service_dates: "2026-10-01 - 2026-10-02", due_date: "2026-10-30", to_company_name: "Quote Co", invoice_created: false }));
  db.respond("QuoteItem.findAll", () => [{ id: 1, description: "Deep clean", quantity: 1, unit_price: "321.50", amount: "321.50", calculation_type: "flat" }]);
  await invoices.createInvoice({ quote_id: 3, billing_date: "2026-10-20", items: [{ unit_price: 999 }] });
  const invoice = createdInvoice();
  assert.deepEqual([invoice.user_id, invoice.quote_id, invoice.ref_type, invoice.total_due, invoice.to_company_name, invoice.due_date], [8, 3, "Q", 321.5, "Quote Co", "2026-10-30"]);
  assert.deepEqual(db.calls("InvoiceItem.bulkCreate")[0][1].map((i) => [i.description, i.amount]), [["Deep clean", 321.5]], "the quote's items, not the request's");
  assert.deepEqual(db.log.find(([n]) => n === "ServiceQuote#update")[2], { invoice_created: true, invoice_id: invoice.id ?? db.log.find(([n]) => n === "ServiceQuote#update")[2].invoice_id });

  db.respond("ServiceQuote.findByPk", (id) => ({ id, invoice_created: true }));
  await assert.rejects(invoices.createInvoice({ quote_id: 3 }), (err) => err.statusCode === 400 && err.message === "Invoice already exists for this quote.");
  db.respond("ServiceQuote.findByPk", () => null);
  await assert.rejects(invoices.createInvoice({ quote_id: 3 }), (err) => err.statusCode === 404);
});

// ----- updates

const existing = (overrides = {}) => ({
  id: 50,
  user_id: 7,
  ref_no: "RHK9",
  billing_date: "2026-10-25",
  due_date: "2026-11-24",
  date: "2026-10-10",
  service_dates: "2026-10-01 - 2026-10-31",
  to_company_name: "Test Co",
  total_due: 700,
  deposit_required: false,
  deposit_percentage: 30,
  payment_stage: "FULL",
  payment_url: "https://square.test/old",
  service_invoice_item: [
    { id: 1, description: "Janitorial", frequency: null, quantity: 2, unit_price: 100, amount: 600, calculation_type: "hour", hour: 3, sqft: null },
    { id: 2, description: "Windows", frequency: null, quantity: 1, unit_price: 100, amount: 100, calculation_type: "flat", hour: null, sqft: null },
  ],
  ...overrides,
});

const withInvoice = (overrides) => {
  const rows = new Map();
  db.respond("Invoice.findByPk", (id) => {
    if (!rows.has(id)) rows.set(id, db.row("Invoice", { ...existing(overrides), id }));
    const invoice = rows.get(id);
    invoice.service_invoice_item = invoice.service_invoice_item.map((item) => (item.__row ? item : db.row("InvoiceItem", item)));
    return invoice;
  });
};

const updates = () => db.log.filter(([n]) => n === "Invoice#update").map((e) => e[2]);

test("updating items edits, adds and removes rows, recalculates the total and keeps the transaction", async () => {
  withInvoice();
  await invoices.updateInvoice(50, { items: [{ id: 1, quantity: 1, unit_price: 100, calculation_type: "hour", hour: 2 }, { description: "New", quantity: 3, unit_price: 10 }] });
  assert.deepEqual(db.log.find(([n]) => n === "InvoiceItem#update").slice(1, 3), [1, { description: undefined, frequency: undefined, quantity: 1, calculation_type: "hour", sqft: null, hour: 2, unit_price: 100, amount: 200 }]);
  assert.equal(db.calls("InvoiceItem.create")[0][1].amount, 30);
  assert.deepEqual(db.log.filter(([n]) => n === "InvoiceItem#destroy").map((e) => e[1]), [2]);
  assert.equal(updates()[1].total_due, 230);
  assert.deepEqual(db.log.map(([n]) => n).filter((n) => n.startsWith("transaction")), ["transaction.start", "transaction.commit"]);
  assert.equal(db.log.find(([n]) => n === "square.service.generateInvoicePaymentLink")[1].amount, 230);
  // the total changed, so the 9 AM email is rescheduled for the (future) billing date
  assert.deepEqual([updates().at(-1).scheduled_send_at, updates().at(-1).last_sent_at], ["2026-10-25T13:00:00.000Z", null]);
});

test("leaving items out keeps them; changing only the balance date does not reschedule the email", async () => {
  withInvoice({ deposit_required: true, deposit_percentage: 30, payment_stage: "DEPOSIT_PENDING", balance_due_date: "2026-11-01" });
  await invoices.updateInvoice(50, { balance_date: "2026-11-05" });
  assert.equal(db.calls("InvoiceItem.create").length + db.log.filter(([n]) => n === "InvoiceItem#destroy").length, 0);
  assert.equal(updates()[1].total_due, 700);
  assert.equal(updates()[1].balance_due_date, "2026-11-05");
  assert.equal("scheduled_send_at" in updates().at(-1), false);
});

test("deposit rules and locked payment terms answer 400 and roll back", async () => {
  for (const [overrides, body, message] of [
    [{}, { deposit_required: true }, "Please select the date for the remaining balance."],
    [{}, { deposit_required: true, balance_date: "11/05/2026" }, "Please provide a valid balance due date in YYYY-MM-DD format."],
    [{}, { deposit_required: true, balance_date: "2026-10-25" }, "The balance date must be after the billing date."],
    [{ payment_stage: "DEPOSIT_PAID", deposit_required: true, balance_due_date: "2026-11-01" }, { items: [{ quantity: 1, unit_price: 5 }] }, /already received a payment/],
  ]) {
    db.reset();
    withInvoice(overrides);
    await assert.rejects(invoices.updateInvoice(50, body), (err) => err.statusCode === 400 && (message instanceof RegExp ? message.test(err.message) : err.message === message));
    assert.equal(db.log.at(-1)[0], "transaction.rollback");
  }
  db.reset();
  db.respond("Invoice.findByPk", () => null);
  await assert.rejects(invoices.updateInvoice(99, {}), (err) => err.statusCode === 404);
});

test("recurring settings are created, updated or cancelled", async () => {
  withInvoice();
  await invoices.updateInvoice(50, { is_recurring: true, recurring_frequency: "QUARTERLY", recurring_max_occurrences: 4 });
  const created = db.calls("InvoiceRecurring.create")[0][1];
  assert.deepEqual([created.frequency, created.start_date, created.next_billing_date, created.max_occurrences], ["QUARTERLY", "2026-10-25", "2027-01-25", 4]);

  db.reset();
  withInvoice();
  db.respond("InvoiceRecurring.findOne", () => ({ id: 3, status: "ACTIVE", frequency: "MONTHLY", max_occurrences: 5 }));
  await invoices.updateInvoice(50, { recurring_end_date: "2027-12-01" });
  assert.deepEqual(db.log.find(([n]) => n === "InvoiceRecurring#update")[2].end_date, "2027-04-25", "capped at 6 months after billing");

  db.reset();
  withInvoice();
  db.respond("InvoiceRecurring.findOne", () => ({ id: 3, status: "ACTIVE" }));
  await invoices.updateInvoice(50, { is_recurring: false });
  assert.deepEqual(db.log.find(([n]) => n === "InvoiceRecurring#update")[2], { status: "CANCELLED" });

  db.reset();
  withInvoice({ billing_date: null });
  await assert.rejects(invoices.updateInvoice(50, { is_recurring: true, recurring_max_occurrences: 2 }), (err) => err.message === "A billing date is required for a recurring invoice.");
});

test("a billing date of today or earlier sends at 9 AM if that is still ahead, otherwise in 30 minutes", async () => {
  withInvoice();
  await invoices.updateInvoice(50, { billing_date: "2026-10-16" }); // today, 10:00 New York: 9 AM has passed
  assert.equal(updates().at(-1).scheduled_send_at, "2026-10-16T14:30:00.000Z");
  db.reset();
  withInvoice();
  await invoices.updateInvoice(50, { billing_date: "" }); // no billing date: not scheduled
  assert.deepEqual([updates().at(-1).scheduled_send_at, updates().at(-1).last_sent_at], [null, null]);
});
