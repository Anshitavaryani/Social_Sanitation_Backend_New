// The daily recurring-invoice job (generateRecurringInvoicesCron): the next invoice copies its
// template with shifted dates and a fresh payment lifecycle, the schedule moves on or completes,
// and schedules that can't produce an invoice are skipped. The clock is 2026-10-16, New York.
require("./helpers/env");
const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot } = require("./helpers/mocks");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });

const db = recordingDatabase();
recordingModule("src/services/Common/square.service.js", db.log, {});
recordingModule("src/services/Common/pdf.service.js", db.log, {});
recordingModule("src/services/Common/email.service.js", db.log, {});
recordingModule("src/config/logger.js", db.log, {});
const { generateRecurringInvoicesCron } = loadFromRoot("src/services/Common/invoice.service.js");

const template = (overrides = {}) => ({
  id: 50,
  user_id: 7,
  quote_id: null,
  ref_type: "RHK",
  status: "ACTIVE",
  is_active: true,
  billing_date: "2026-09-16",
  due_date: "2026-10-16",
  service_dates: "2026-09-01 - 2026-09-30",
  to_company_name: "Test Co",
  total_due: "700.00",
  deposit_required: false,
  deposit_percentage: 30,
  service_invoice_item: [{ id: 1, description: "Janitorial", quantity: 2, unit_price: 100, amount: 600, sort_order: 1 }],
  ...overrides,
});

const runWith = async (schedule, invoice) => {
  db.respond("InvoiceRecurring.findAll", () => [{ id: 3, invoice_id: 50, status: "ACTIVE", next_billing_date: "2026-10-16", frequency: "MONTHLY", occurrences_generated: 1, ...schedule }]);
  db.respond("Invoice.findByPk", () => invoice);
  db.respond("Invoice.findOne", (q) => (q.order ? { id: 1, ref_no: "RHK41" } : null));
  await generateRecurringInvoicesCron();
};
const lines = (level) => db.log.filter(([n]) => n === `logger.${level}`).map((e) => e[1]);

beforeEach(() => db.reset());

test("the next invoice copies the template with its dates moved to the new billing date", async () => {
  await runWith({ max_occurrences: 5 }, template());
  const created = db.calls("Invoice.create")[0][1];
  assert.deepEqual(
    [created.ref_no, created.billing_date, created.date, created.due_date, created.service_dates, created.total_due, created.payment_stage, created.custom_ref_no],
    ["RHK42", "2026-10-16", "2026-10-16", "2026-11-15", "2026-10-16 - 2026-11-14", 700, "FULL", null],
  );
  assert.equal(created.scheduled_send_at, "2026-10-16T13:00:00.000Z", "9:00 AM New York");
  assert.deepEqual(db.calls("InvoiceItem.bulkCreate")[0][1].map((i) => [i.description, i.amount, i.sort_order]), [["Janitorial", 600, 1]]);
  assert.deepEqual(db.log.find(([n]) => n === "InvoiceRecurring#update")[2], { occurrences_generated: 2, next_billing_date: "2026-11-16" });
});

test("a deposit template keeps its terms and its balance date gap", async () => {
  await runWith({ frequency: "WEEKLY" }, template({ deposit_required: 1, deposit_percentage: "25", balance_due_date: "2026-09-30" }));
  const created = db.calls("Invoice.create")[0][1];
  assert.deepEqual(
    [created.deposit_required, created.deposit_percentage, created.deposit_amount, created.balance_amount, created.balance_due_date, created.payment_stage],
    [true, 25, 175, 525, "2026-10-30", "DEPOSIT_PENDING"],
  );
  assert.equal(db.log.find(([n]) => n === "InvoiceRecurring#update")[2].next_billing_date, "2026-10-23");
});

test("the schedule completes at its maximum or after its end date", async () => {
  await runWith({ max_occurrences: 2, occurrences_generated: 1 }, template());
  assert.equal(db.log.find(([n]) => n === "InvoiceRecurring#update")[2].status, "COMPLETED", "this was the last one");

  db.reset();
  await runWith({ max_occurrences: 2, occurrences_generated: 2 }, template());
  assert.equal(db.calls("Invoice.create").length, 0);
  assert.deepEqual(db.log.find(([n]) => n === "InvoiceRecurring#update")[2], { status: "COMPLETED" });

  db.reset();
  await runWith({ end_date: "2026-10-01" }, template());
  assert.equal(db.calls("Invoice.create").length, 0);
  assert.deepEqual(lines("info").at(-1), "Recurring schedule 3 completed.");
});

test("schedules that can't produce an invoice are skipped, each with its reason", async () => {
  for (const [schedule, invoice, level, message] of [
    [{}, null, "warn", "Invoice not found for recurring schedule 3."],
    [{}, template({ is_active: false }), "info", "Recurring schedule 3: template invoice 50 is inactive."],
    [{}, template({ total_due: "abc" }), "error", "Invalid total_due on recurring template invoice 50."],
    [{}, template({ deposit_required: true, balance_due_date: null }), "error", "Cannot generate deposit invoice from template 50: balance_due_date is missing or invalid."],
  ]) {
    db.reset();
    await runWith(schedule, invoice);
    assert.equal(db.calls("Invoice.create").length, 0, message);
    assert.equal(lines(level).at(-1), message);
  }
  db.reset();
  db.respond("Invoice.findOne", (q) => (q.order ? { id: 1, ref_no: "RHK41" } : { id: 77 }));
  db.respond("InvoiceRecurring.findAll", () => [{ id: 3, invoice_id: 50, status: "ACTIVE", next_billing_date: "2026-10-16", frequency: "MONTHLY" }]);
  db.respond("Invoice.findByPk", () => template());
  await generateRecurringInvoicesCron();
  assert.equal(lines("info").at(-1), "Invoice already exists for billing date 2026-10-16.");
});
