// The business analytics report (POST /invoice/getBusinessAnalytics) and the client scope sync
// (GET /admin/auth/user-scope/:userId): totals by payment and day, overdue invoices, top clients,
// and which master sections a client's Initial Client Chart puts in their scope.
require("./helpers/env");
const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot } = require("./helpers/mocks");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });

const db = recordingDatabase();
recordingModule("src/config/logger.js", db.log, {});
recordingModule("src/services/Common/email.service.js", db.log, {});
const { getBusinessAnalytics } = loadFromRoot("src/services/Common/invoice.service.js");
const { getUserScope } = loadFromRoot("src/services/Admin/serviceEstimate.service.js");

beforeEach(() => db.reset());

const client = (name) => ({ email: `${name.toLowerCase()}@example.com`, user_profile: { name } });

test("analytics add up invoices and quotes by payment, day and client", async () => {
  db.respond("Invoice.findAll", () => [
    { id: 1, user_id: 7, total_due: "100", payment_status: "PAID", billing_date: "2026-10-05", due_date: "2026-10-10", created_at: "2026-10-05T12:00:00Z", invoices_user: client("Ann") },
    { id: 2, user_id: 7, total_due: 50, payment_status: "CHECK_PAID", billing_date: "2026-10-05", created_at: "2026-10-06T12:00:00Z", invoices_user: client("Ann") },
    { id: 3, user_id: 8, total_due: 30, payment_status: "NOT_PAID", billing_date: "2026-10-20", due_date: "2026-10-01", created_at: "2026-10-07T12:00:00Z", invoices_user: client("Bo") },
  ]);
  db.respond("ServiceQuote.findAll", () => [{ id: 9, user_id: 8, total_due: 200, payment_status: "CASH_PAID", created_at: "2026-10-03T02:00:00Z", payment_user: client("Bo") }]);
  const { data } = await getBusinessAnalytics({ month: "2026-10" });
  const o = data.overview;
  assert.deepEqual(
    [o.total_revenue, o.invoice_revenue, o.quote_revenue, o.paid_revenue, o.unpaid_revenue, o.overdue_revenue, o.overdue_invoices, o.paid_count, o.unpaid_count],
    [380, 180, 200, 350, 30, 30, 1, 3, 1],
  );
  assert.deepEqual(data.payment_breakdown, { online: 100, cash: 200, check: 50 });
  assert.deepEqual(data.daily_breakdown.map((d) => [d.date, d.revenue, d.paid]), [["2026-10-05", 150, 150], ["2026-10-20", 30, 0], ["2026-10-02", 200, 200]], "a quote counts on its New York creation day");
  assert.deepEqual(data.top_clients.map((c) => [c.name, c.total_spent]), [["Bo", 230], ["Ann", 150]]);
  assert.deepEqual(data.monthly_activity.map((a) => [a.type, a.id, a.is_overdue]), [["INVOICE", 3, true], ["INVOICE", 2, false], ["INVOICE", 1, false], ["QUOTE", 9, false]]);
});

const chartFor = ({ client_type = "commercial", details, masters, existing = [] }) => {
  db.respond("User.findByPk", () => ({ id: 7, client_type }));
  db.respond("ClientChecklist.findOne", () => ({ id: 30 }));
  db.respond("ClientChecklistDetail.findAll", () => details);
  db.respond("ScopeSection.findAll", () => masters);
  db.respond("UserScopeSection.findAll", () => existing.map((s) => ({ ...s })));
};

const office = { id: 100, title: "GENERAL OFFICE AND COMMON AREAS", order: 1, is_red: false, items: [{ id: 1001, description: "Dust desks", is_daily: true, order: 1 }] };
const restrooms = { id: 101, title: "BATHROOMS AND RESTROOM AREAS", order: 2, is_red: true, items: [{ id: 1011, description: "Sinks", is_daily: true, order: 1 }] };
const salon = { id: 102, title: "SALON", order: 3, is_red: false, items: [] };

test("the chart's areas pick master sections, and areas without one get their own section", async () => {
  chartFor({
    details: [
      { service_area: "Office Areas", num_desks_trash_cans: 4 },
      { service_area: "Restrooms", restrooms: 0 }, // nothing to clean: not in scope
      { service_area: "salon", sinks: 1 },
      { service_area: "Gym", stalls: 2 },
    ],
    masters: [office, restrooms, salon],
    existing: [{ id: 500, master_section_id: null, title: "general office and common areas" }],
  });
  db.respond("UserScopeSection.findOne", (q) => (q.order ? { id: 9, order: 6 } : null));
  await getUserScope(7);
  assert.deepEqual(db.log.find(([n]) => n === "UserScopeSection#update").slice(1, 3), [500, { master_section_id: 100, title: "GENERAL OFFICE AND COMMON AREAS", order: 1, is_red: false }], "old unlinked copy linked");
  const sections = db.calls("UserScopeSection.create").map(([, v]) => [v.title, v.master_section_id ?? null, v.order]);
  assert.deepEqual(sections, [["SALON", 102, 3], ["GYM", null, 7]]);
  const items = db.calls("UserScopeItem.create").map(([, v]) => v.description);
  assert.deepEqual(items, ["Dust desks", "Dust desks"], "the office copy gets its item, and the Gym section starts from the office template");
});

test("copies of master sections the chart no longer matches are deactivated", async () => {
  chartFor({
    details: [{ service_area: "Office Areas", stalls: 1 }],
    masters: [office, restrooms],
    existing: [
      { id: 500, master_section_id: 100, title: "GENERAL OFFICE AND COMMON AREAS" },
      { id: 501, master_section_id: 101, title: "BATHROOMS AND RESTROOM AREAS" },
      { id: 502, master_section_id: null, title: "MY OWN SECTION" },
    ],
  });
  await getUserScope(7);
  assert.deepEqual(db.calls("UserScopeSection.update").map(([, v, o]) => [v, o.where.id]), [[{ is_active: false }, 501]]);
});

test("the scope needs a known client type and a filled-in chart", async () => {
  for (const [setup, status, message] of [
    [() => db.respond("User.findByPk", () => null), 404, "Client not found"],
    [() => chartFor({ client_type: "industrial", details: [], masters: [] }), 400, "Invalid client type"],
    [() => chartFor({ details: [{ service_area: "Office Areas" }], masters: [] }), 400, "Please fill in the Initial Client Chart before generating the Scope of Work."],
    [() => { chartFor({ details: [], masters: [] }); db.respond("ClientChecklist.findOne", () => null); }, 400, "Please complete the Initial Client Chart before generating the Scope of Work."],
  ]) {
    db.reset();
    setup();
    await assert.rejects(getUserScope(7), (err) => err.statusCode === status && err.message === message);
  }
});
