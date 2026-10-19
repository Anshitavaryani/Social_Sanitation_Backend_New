// Ownership checks (audit row 2): over HTTP with the real routes and guards, an app user reaches
// their own records and the bookings they work on, and gets 403 for anyone else's; supervisors and
// quality inspectors read employees' records; admins reach everything; OWNERSHIP_CHECKS=report
// only logs. Controllers are stubs that answer 200 "reached".
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");
const { routeInventory } = require("./helpers/routeInventory");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
const { models } = mockDatabase();
mockFirebase();
const warnings = [];
mockModule("src/config/logger.js", { warn: (message) => warnings.push(message), error: () => {}, info: () => {}, debug: () => {} });

const reached = (req, res) => res.status(200).json({ success: true, reached: true });
const controllers = new Proxy({}, { get: (t, group) => (typeof group === "string" ? new Proxy({}, { get: () => reached }) : undefined) });
mockModule("src/controllers/index.js", controllers);
for (const group of ["Admin", "Common", "User"]) mockModule(`src/controllers/${group}/index.js`, controllers);

// The people: two clients, a cleaner, a supervisor, and an admin
const USERS = {
  9: { id: 9, role_id: 6 }, // client
  10: { id: 10, role_id: 6 }, // another client
  20: { id: 20, role_id: 9 }, // cleaner, assigned to booking 100
  30: { id: 30, role_id: 7 }, // supervisor
};
models.UserToken.findOne = async ({ where }) => ({ id: 1, user_id: where.user_id });
models.User.findOne = async ({ where }) => USERS[where.id] || null;
models.Admin.findOne = async () => ({ id: 1, role_id: 1, is_active: true });

// The records: booking 100 of client 9 at address 50, with the cleaner assigned
models.Booking.findByPk = async (id) => (Number(id) === 100 ? { id: 100, user_id: 9 } : null);
models.Booking.findAll = async ({ where }) => (Number(where.address_id) === 50 || Number(where.user_id) === 9 ? [{ id: 100 }] : []);
models.BookingAssignment.count = async ({ where }) => (where.booking_id.includes(100) && Number(where.employee_id) === 20 ? 1 : 0);
models.Invoice.findByPk = async (id) => (Number(id) === 7 ? { id: 7, user_id: 9 } : null);
models.UserAddress.findByPk = async (id) => (Number(id) === 50 ? { id: 50, user_id: 9 } : null);
models.Inspection.findByPk = async (id) => (Number(id) === 3 ? { id: 3, employee_id: 20, user_id: 9 } : null);
models.ServiceReview.findByPk = async (id) => (Number(id) === 4 ? { id: 4, user_id: 10 } : null);

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

const appToken = (id) => jwt.sign({ sub: id, role_id: USERS[id].role_id, type: "access" }, TEST_JWT_SECRET, { expiresIn: "5m" });
const adminToken = () => jwt.sign({ id: 1, role_id: 1 }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256", expiresIn: "5m" });

const call = async (as, method, url, body) => {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { "content-type": "application/json", "x-access-token": as === "admin" ? adminToken() : appToken(as), ...(as === "admin" ? {} : { role_id: String(USERS[as].role_id) }) },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return res.status;
};

// [method, url, body, who gets in, who gets 403]
const CASES = [
  ["GET", "/api/v1/booking/getBookingById/100", null, [9, 20, 30, "admin"], [10]],
  ["GET", "/api/v1/booking/getAllServiceCheckListByBookingId/100", null, [9, 20, 30], [10]],
  ["GET", "/api/v1/booking/getAllServiceCheckListByUserForBookingId/100", null, [9, 20, 30], [10]],
  ["GET", "/api/v1/booking/getAllServiceCheckList/100", null, [9, 20, 30], [10]],
  ["POST", "/api/v1/report/reportBooking/100", {}, [9, 20], [10]],
  ["POST", "/api/v1/booking/updateBookingStatusByEmployee", { booking_id: 100 }, [20, 30], [9, 10]],
  ["POST", "/api/v1/booking/markChecklistItemAsCompleted/5", { booking_id: 100 }, [20, 30], [9, 10]],
  ["GET", "/api/v1/invoice/7", null, [9, "admin"], [10, 20, 30]],
  ["GET", "/api/v1/invoice/user/9", null, [9, "admin"], [10, 20, 30]],
  ["PUT", "/api/v1/user/editAddress", { user_address_id: 50 }, [9, "admin"], [10, 20, 30]],
  ["GET", "/api/v1/user/getUserAddressById/50", null, [9, 20, 30, "admin"], [10]],
  ["GET", "/api/v1/user/getUserAddressByUserId/9", null, [9, 20, 30], [10]],
  ["POST", "/api/v1/attendance/getAttendanceByUserId/20", {}, [20, 30, "admin"], [9, 10]],
  ["GET", "/api/v1/eqipment/employee/20/equipment", null, [20, 30], [9]],
  ["GET", "/api/v1/inspection/employee/20", null, [20, 30], [9]],
  ["GET", "/api/v1/inspection/getInspectionById/3", null, [20, 9, 30], [10]],
  ["POST", "/api/v1/checklist/getWeeklyChecklistWithStatus", { user_id: 20 }, [20, 30], [9]],
  ["DELETE", "/api/v1/rating/deleteReviewAndRating/4", null, [10], [9]],
];

test("app users reach their own records and the bookings they work on; others get 403", async () => {
  for (const [method, url, body, allowed, refused] of CASES) {
    for (const who of allowed) assert.equal(await call(who, method, url, body), 200, `${who} ${method} ${url}`);
    for (const who of refused) assert.equal(await call(who, method, url, body), 403, `${who} ${method} ${url}`);
  }
});

test("a missing id or record is left to the handler", async () => {
  assert.equal(await call(10, "GET", "/api/v1/booking/getBookingById/999"), 200);
  assert.equal(await call(10, "POST", "/api/v1/booking/updateBookingStatusByEmployee", {}), 200);
  assert.equal(await call(10, "GET", "/api/v1/invoice/999"), 200);
});

test("with OWNERSHIP_CHECKS=report a refusal is only logged", async () => {
  const config = loadFromRoot("src/config/config.js");
  warnings.length = 0;
  config.ownershipChecks = "report";
  try {
    assert.equal(await call(10, "GET", "/api/v1/invoice/7"), 200);
  } finally {
    config.ownershipChecks = "enforce";
  }
  assert.match(warnings[0], /^Ownership: app user 10 \(role 6\) refused GET \/api\/v1\/invoice\/7 \(invoice 7\)$/);
});

test("every app-reachable route with an id in its path is checked, or checks in its service", () => {
  // routes whose service already limits the record to the caller, or that serve shared lists
  const CHECKED_IN_SERVICE = new Set([
    "GET /api/v1/checklist/findDailyChecklistById/:id", // checklist templates, the same for everyone
    "GET /api/v1/checklist/findServiceChecklistById/:id",
    "GET /api/v1/product/getProductById/:id", // the product catalog
    "GET /api/v1/eqipment/my-equipment/:assignmentId/signatures", // employee_id = caller
    "POST /api/v1/eqipment/my-equipment/sign/:assignmentId",
    "PUT /api/v1/inspection/updateInspectionItem/:itemId", // inspection.employee_id = caller
    "POST /api/v1/inspection/item/:itemId/image",
    "POST /api/v1/inspection/submitInspection/:inspectionId",
    "DELETE /api/v1/inspection/item/image/:imageId",
    "POST /api/v1/user/deleteAddress/:id", // user_id = caller
    "POST /api/v1/checklist/markDailyChecklistItemAsCompleted/:id", // the caller's own checklist row
    "GET /api/v1/firebase/getLastMessage/:receiverUserId", // the caller's own conversation
    "POST /api/v1/firebase/markAdminMessagesAsRead/:receiverUserId",
    "GET /api/v1/firebase/groupMessages/:id", // group membership (groupChat.service)
    "GET /api/v1/firebase/getGroupParticipants/:id",
    "DELETE /api/v1/firebase/deleteGroup/:id",
  ]);
  const fs = require("fs");
  const path = require("path");
  const unchecked = routeInventory()
    .filter((r) => (r.level === "USER" || r.level === "AUTH") && r.path.includes(":"))
    .filter((r) => {
      const [file, line] = r.file.split(":");
      const source = fs.readFileSync(path.join(__dirname, "../src/routes/v1", file), "utf8").split("\n").slice(line - 1, line + 3).join(" ");
      return !/ownership\.\w+\(/.test(source) && !CHECKED_IN_SERVICE.has(`${r.method} ${r.path}`);
    })
    .map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(unchecked, []);
});
