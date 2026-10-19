// Request schemas on admin endpoints (src/validations/admin.validation.js): input their handlers
// failed on (most as a 500) gets a 400 naming the field, and the requests the panel sends today
// still reach the handler: numbers as text, nulls, "N/A" hours, ISO dates, extra fields.
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
const { models } = mockDatabase();
mockFirebase();

// Handlers are stubs: a request that passes validation answers 200 "reached"
const reached = (req, res) => res.status(200).json({ success: true, reached: true });
const controllers = new Proxy({}, { get: (t, group) => (typeof group === "string" ? new Proxy({}, { get: () => reached }) : undefined) });
mockModule("src/controllers/index.js", controllers);
for (const group of ["Admin", "Common", "User"]) mockModule(`src/controllers/${group}/index.js`, controllers);

models.Admin.findOne = async () => ({ id: 1, role_id: 1, is_active: true });
const token = jwt.sign({ id: 1, role_id: 1 }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256", expiresIn: "5m" });

let server;
let baseUrl;
before(async () => {
  const app = loadFromRoot("app.js");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const call = async (method, url, body) => {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { "content-type": "application/json", "x-access-token": token },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

const items = [
  { description: "Janitorial", unit_price: "150.50", quantity: 2, calculation_type: "hour", hour: "N/A" },
  { description: "Windows", unit_price: 80, quantity: "", calculation_type: "sqft", sqft: "1200", frequency: "Weekly" },
];

// [method, url, a request the panel sends today, [bad request, message]...]
const CASES = [
  ["POST", "/api/v1/checklist/createServiceChecklist", { heading: "Lobby", role_id: 9, tasks: ["Mop floor", "Empty bins"] },
    [{ heading: "Lobby", tasks: "Mop floor" }, "tasks must be a list of task names"],
    [{ tasks: ["Mop"] }, "heading is required"]],
  ["POST", "/api/v1/checklist/createDailyChecklist", { heading: "Night", role_id: null, tasks: [] },
    [{ heading: "Night", tasks: [5] }, "tasks[0] must be text"]],
  ["POST", "/api/v1/admin/user/createUser", { name: "Jo", email: " jo@example.com ", role_id: "6", client_type: "commercial", checklist: { details: [] } },
    [{ name: "Jo", role_id: 6 }, "email is required"],
    [{ email: 12, role_id: 6 }, "email must be text"],
    [{ email: "jo@example.com", role_id: "six" }, "role_id must be a positive whole number"]],
  ["POST", "/api/v1/admin/user/resetUserCredentials", { user_id: 4, new_email: "" },
    [{ user_id: 4, new_email: "not-an-email" }, "new_email must be a valid email"]],
  ["POST", "/api/v1/admin/user/addNewUserAddress", { user_id: "4", address: "1 Main St", country_id: 1, address_lat: 27.9 },
    [{ address: "1 Main St" }, "user_id is required"]],
  ["POST", "/api/v1/admin/user/submitServiceQuote", { user_id: 4, items, cc_email: null, ref_type: "Q" },
    [{ user_id: 4, items: "two cleanings" }, "items must be a list"],
    [{ user_id: 4, items: [{ unit_price: "a lot" }] }, "items[0].unit_price must be a number of 0 or more"],
    [{ user_id: 4, items, cc_email: 5 }, "cc_email must be text"]],
  ["POST", "/api/v1/admin/user/saveDraftQuote", { user_id: 4, quote_id: null, items },
    [{ user_id: 4, items: [null] }, "each item must be an object"]],
  ["PUT", "/api/v1/admin/user/editServiceQuote", { quote_id: "8", user_id: 4, items },
    [{ user_id: 4, items }, "quote_id is required"]],
  ["POST", "/api/v1/admin/user/submitServiceRequest", { user_id: 4, items: [{ unit_price: 10, quantity: 1 }] },
    [{ user_id: 4, items: {} }, "items must be a list"]],
  ["PUT", "/api/v1/admin/user/editServiceRequest", { request_id: 3, user_id: 4, items: [] },
    [{ user_id: 4, items: [] }, "request_id is required"]],
  ["POST", "/api/v1/admin/booking/adminCreateBooking", { user_id: 4, service_id: 2, address_id: "", date: "2026-10-20T00:00:00.000Z", time: "09:00", type: "Recurring Booking", is_recurring: true, repeat_on_days: ["Mon", "Wed"] },
    [{ user_id: 4, service_id: 2, date: "10/20/2026" }, "date must be a date as YYYY-MM-DD"],
    [{ user_id: 4, service_id: 2, date: "2026-10-20", repeat_on_days: "Mon" }, "repeat_on_days must be a list of days"],
    [{ user_id: 4, service_id: 2, date: "2026-10-20", repeat_on_days: ["Monday"] }, "repeat_on_days must use Sun, Mon, Tue, Wed, Thu, Fri, Sat"]],
  ["POST", "/api/v1/admin/booking/adminCreateBookingForGuest", { client_name: "Guest", service_id: 2, date: "2026-10-20", time: "10:30:00" },
    [{ client_name: "Guest", date: "2026-10-20" }, "service_id is required"]],
  ["POST", "/api/v1/admin/booking/send-two-week-schedule", { employee_id: 12 },
    [{}, "employee_id is required"]],
  ["POST", "/api/v1/attendance/manualClockInOut", { employee_id: 12, role_id: 9, date: "2026-10-16", clock_in: "09:00", clock_out: "17:30:00" },
    [{ employee_id: 12, date: "2026-10-16", clock_in: "nine" }, "clock_in must be a time as HH:mm"],
    [{ employee_id: 12, date: "2026-02-31" }, "date must be a date as YYYY-MM-DD"]],
  ["POST", "/api/v1/admin/auth/generate-estimate-pdf", { user_id: 4, client_company_name: "Test Co", city: "Tampa" },
    [{ user_id: 4, client_company_name: 42 }, "client_company_name must be text"],
    [{ client_company_name: "Test Co" }, "user_id is required"]],
  ["PUT", "/api/v1/admin/auth/update-service-estimate", { estimate_id: 3, user_id: 4, client_company_name: "Test Co" },
    [{ estimate_id: 3, user_id: 4 }, "client_company_name is required"]],
  ["POST", "/api/v1/invoice/createInvoice", { user_id: 4, items, billing_date: "2026-10-16", due_date: "2026-11-15T00:00:00.000Z", event_name: null, is_recurring: true, recurring_frequency: "MONTHLY", recurring_max_occurrences: "3", deposit_percentage: "" },
    [{ items }, "user_id or quote_id is required"],
    [{ user_id: 4, billing_date: "soon" }, "billing_date must be a date as YYYY-MM-DD"],
    [{ user_id: 4, event_name: 7 }, "event_name must be text"],
    [{ user_id: 4, recurring_frequency: "DAILY" }, "recurring_frequency must be one of WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY, YEARLY"]],
  ["PUT", "/api/v1/invoice/12", { due_date: "2026-11-30", items: [] },
    [{ items: [{ quantity: -1 }] }, "items[0].quantity must be a number of 0 or more"]],
  ["PUT", "/api/v1/quote/editQuestion/3", { question: "How many floors?", type: "text" },
    [{ question: 5 }, "question must be text"]],
  ["POST", "/api/v1/firebase/sendPushNotification", { notificationObj: { title: "Hi", body: "There" }, registrationTokens: ["tok-1"] },
    [{ notificationObj: { title: "Hi" }, registrationTokens: [] }, "registrationTokens must not be empty"],
    [{ registrationTokens: ["tok-1"] }, "notificationObj is required"]],
  ["PUT", "/api/v1/admin/auth/updateAdmin", { admin_id: 3, name: "Ann", mobile: 8135550100, email: "", role_id: "" },
    [{ name: "Ann" }, "admin_id is required"],
    [{ admin_id: 3, email: "nope" }, "email must be a valid email"]],
  ["DELETE", "/api/v1/admin/auth/deleteAdmin", { admin_id: 3 },
    [{}, "admin_id is required"]],
];

test("requests the panel sends today still reach the handler", async () => {
  for (const [method, url, valid] of CASES) {
    const { status, json } = await call(method, url, valid);
    assert.equal(status, 200, `${method} ${url}: ${json.message}`);
    assert.equal(json.reached, true);
  }
});

test("input the handlers failed on gets a 400 naming the field", async () => {
  for (const [method, url, , ...bad] of CASES) {
    for (const [body, message] of bad) {
      const { status, json } = await call(method, url, body);
      assert.equal(status, 400, `${method} ${url} ${JSON.stringify(body)}`);
      assert.equal(json.message, message, `${method} ${url}`);
      assert.equal(json.success, false);
    }
  }
});

test("validation leaves the values as they were sent", async () => {
  // a handler that echoes the body it received
  const echo = (req, res) => res.status(200).json({ body: req.body });
  mockModule("src/controllers/index.js", new Proxy({}, { get: () => new Proxy({}, { get: () => echo }) }));
  const { validate } = loadFromRoot("src/middlewares/validate.middleware.js");
  const { submitServiceQuote } = loadFromRoot("src/validations/admin.validation.js");
  const req = { body: { user_id: "4", items: [{ unit_price: "150.50", hour: "N/A" }], extra: true }, params: {}, query: {} };
  await new Promise((resolve, reject) => validate(submitServiceQuote)(req, {}, (err) => (err ? reject(err) : resolve())));
  assert.deepEqual(req.body, { user_id: "4", items: [{ unit_price: "150.50", hour: "N/A" }], extra: true });
});
