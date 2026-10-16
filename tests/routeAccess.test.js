// Route authentication: every route declares an access level, and over HTTP every route
// answers anonymous, admin and app-user requests according to that level.
// Controllers are replaced by stubs, so only routing and the auth layer run (no DB, no network).
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");
const { routeInventory } = require("./helpers/routeInventory");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
const { models } = mockDatabase();
mockFirebase();

// Every controller method becomes a stub that reports who the request was authenticated as.
const stubHandler = (name) => (req, res) => {
  if (name === "findAdminById") {
    // a row as Sequelize would return it, including fields that must never leave the server
    return res.status(200).json({
      success: true,
      data: { id: 1, name: "Admin", password: "$2a$10$hash", remember_token: "reset-token", otp: "123456", admin_role: { password: "nested" } },
    });
  }
  res.status(200).json({ success: true, stub: name, user_type: req.body?.user_type ?? null });
};
const controllers = new Proxy(
  {},
  { get: (target, group) => (typeof group === "string" ? new Proxy({}, { get: (t, name) => stubHandler(String(name)) }) : undefined) },
);
mockModule("src/controllers/index.js", controllers);
// some route files import a group index directly
for (const group of ["Admin", "Common", "User"]) mockModule(`src/controllers/${group}/index.js`, controllers);

const ADMIN_ONLY = "This endpoint is for admin accounts only.";

const ADMIN_KEY = Buffer.from(TEST_JWT_SECRET, "hex");
const adminToken = (claims = {}, options = { expiresIn: "5m" }) =>
  jwt.sign({ id: 1, role_id: 1, department_id: 1, is_backlisted: false, ...claims }, ADMIN_KEY, { algorithm: "HS256", ...options });
const userToken = () => jwt.sign({ sub: 9, role_id: 6, type: "access" }, TEST_JWT_SECRET, { expiresIn: "5m" });

// The signed-in accounts the fake database knows about
let activeAdmins = new Map([[1, { id: 1, role_id: 1, is_active: true }]]);
let activeSessions = true;
models.Admin.findOne = async ({ where }) => activeAdmins.get(Number(where.id)) || null;
models.UserToken.findOne = async () => (activeSessions ? { id: 5, user_id: 9, role_id: 6 } : null);
models.User.findOne = async () => ({ id: 9, role_id: 6, user_profile: { name: "App User" } });
models.Role.findOne = async () => ({ id: 1, name: "Admin" });
models.Role.findByPk = async () => ({ id: 1, name: "Admin" });

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

const call = async (method, url, { token, body, headers = {} } = {}) => {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      "content-type": "application/json",
      role_id: "6",
      ...(token ? { "x-access-token": token } : {}),
      ...headers,
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  return { status: res.status, json };
};

const routes = routeInventory();
const concrete = (routePath) => routePath.replace(/:\w+/g, "1");
const isAuthError = (status) => status === 401 || status === 403;

test("every route declares its access level, and new levels come first", () => {
  assert.ok(routes.length >= 379, `found ${routes.length} routes`);
  const undeclared = routes.filter((r) => r.level === "NONE").map((r) => `${r.method} ${r.path} (${r.file})`);
  assert.deepEqual(undeclared, [], "routes without an access level");
  const newMarkersNotFirst = routes
    .filter((r) => r.markers.some((m) => ["publicRoute", "requireAuth", "requireAdmin", "requireAdminRole"].includes(m)) && !r.firstIsMarker)
    .map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(newMarkersNotFirst, []);
});

test("the access matrix has the expected shape", () => {
  const counts = routes.reduce((acc, r) => ({ ...acc, [r.level]: (acc[r.level] || 0) + 1 }), {});
  assert.deepEqual(counts, { PUBLIC: 41, AUTH: 34, ADMIN: 247, USER: 57 });
  const levelOf = (method, p) => routes.find((r) => r.method === method && r.path === p)?.level;
  // the routes the audit called out
  for (const [method, p] of [
    ["POST", "/api/v1/admin/user/deleteUser"],
    ["POST", "/api/v1/admin/user/adminEditUser/:id"],
    ["POST", "/api/v1/admin/user/change-employee-role/:id"],
    ["POST", "/api/v1/admin/auth/register"],
    ["GET", "/api/v1/invoice/getAllInvoices"],
    ["GET", "/api/v1/payment/count"],
    ["GET", "/api/v1/payment/sum"],
    ["POST", "/api/v1/firebase/sendPushNotification"],
    ["POST", "/api/v1/attendance/manualClockInOut"],
    ["POST", "/api/v1/role"],
  ]) {
    assert.equal(levelOf(method, p), "ADMIN", `${method} ${p}`);
  }
  for (const [method, p] of [
    ["POST", "/api/v1/admin/auth/login"],
    ["POST", "/api/v1/user/auth/login"],
    ["POST", "/api/v1/user/auth/register"],
    ["POST", "/api/v1/payment/square/webhooks"],
    ["GET", "/api/v1/service/getAllServices"],
  ]) {
    assert.equal(levelOf(method, p), "PUBLIC", `${method} ${p}`);
  }
});

test("without a token: public routes answer, every other route returns 401", async () => {
  const failures = [];
  for (const r of routes) {
    const { status, json } = await call(r.method, concrete(r.path));
    if (r.level === "PUBLIC") {
      if (isAuthError(status)) failures.push(`${r.method} ${r.path} public but got ${status}`);
    } else if (r.firstIsMarker) {
      if (status !== 401 || json?.success !== false) failures.push(`${r.method} ${r.path} expected 401, got ${status}`);
    } else if (status !== 401 && status !== 400) {
      // older routes that validate the body before checking the token answer 400 first
      failures.push(`${r.method} ${r.path} expected 401/400, got ${status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("with an admin token: admin, shared and public routes pass the auth layer; app-only routes do not", async () => {
  const token = adminToken();
  const failures = [];
  for (const r of routes) {
    const { status } = await call(r.method, concrete(r.path), { token });
    if (r.level === "USER") {
      if (!isAuthError(status) && status !== 400) failures.push(`${r.method} ${r.path} app-only but admin got ${status}`);
    } else if (isAuthError(status)) {
      failures.push(`${r.method} ${r.path} (${r.level}) rejected an admin with ${status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("with an app-user token: admin routes return 403, shared and app routes pass", async () => {
  const token = userToken();
  const failures = [];
  for (const r of routes) {
    const { status, json } = await call(r.method, concrete(r.path), { token });
    if (r.level === "ADMIN") {
      const expected = r.firstIsMarker ? [403] : [403, 400];
      if (!expected.includes(status) || (status === 403 && json?.message !== ADMIN_ONLY)) failures.push(`${r.method} ${r.path} admin-only but app user got ${status} ${json?.message}`);
    } else if (status === 401 || (status === 403 && json?.message === ADMIN_ONLY)) {
      failures.push(`${r.method} ${r.path} (${r.level}) rejected an app user with ${status} ${json?.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("admin endpoints identify the caller as ADMIN and shared endpoints as either account type", async () => {
  const asAdmin = await call("POST", "/api/v1/admin/booking/getAllBookings", { token: adminToken() });
  assert.equal(asAdmin.json.user_type, "ADMIN");
  const sharedAsUser = await call("GET", "/api/v1/booking/getBookingById/1", { token: userToken() });
  assert.equal(sharedAsUser.json.user_type, "USER");
  const sharedAsAdmin = await call("GET", "/api/v1/booking/getBookingById/1", { token: adminToken() });
  assert.equal(sharedAsAdmin.json.user_type, "ADMIN");
});

test("auth failures explain themselves with a JSON 401/403", async () => {
  const expired = await call("POST", "/api/v1/admin/booking/getAllBookings", {
    token: adminToken({}, { expiresIn: -10 }),
  });
  assert.deepEqual([expired.status, expired.json.message], [401, "Your session has expired. Please log in again."]);

  const garbage = await call("POST", "/api/v1/admin/booking/getAllBookings", { token: "not-a-jwt" });
  assert.deepEqual([garbage.status, garbage.json.message], [401, "Invalid access token. Please log in again."]);

  const wrongKind = await call("POST", "/api/v1/admin/booking/getAllBookings", { token: userToken() });
  assert.deepEqual([wrongKind.status, wrongKind.json.message], [403, "This endpoint is for admin accounts only."]);

  activeAdmins = new Map();
  const deactivated = await call("POST", "/api/v1/admin/booking/getAllBookings", { token: adminToken() });
  activeAdmins = new Map([[1, { id: 1, role_id: 1, is_active: true }]]);
  assert.deepEqual([deactivated.status, deactivated.json.success], [401, false]);
  assert.match(deactivated.json.message, /not active/);

  activeSessions = false;
  const loggedOut = await call("GET", "/api/v1/booking/getBookingById/1", { token: userToken() });
  activeSessions = true;
  assert.deepEqual([loggedOut.status, loggedOut.json.message], [401, "Your session has ended. Please log in again."]);

  const blacklisted = await call("POST", "/api/v1/admin/booking/getAllBookings", { token: adminToken({ is_backlisted: true }) });
  assert.equal(blacklisted.status, 401);
});

test("an expired app token on an app-only route is a 401, not a 500", async () => {
  const expired = jwt.sign({ sub: 9, role_id: 6, type: "access" }, TEST_JWT_SECRET, { expiresIn: -10 });
  const res = await call("GET", "/api/v1/user/profile", { token: expired });
  assert.deepEqual([res.status, res.json.message], [401, "Your session has expired. Please log in again."]);
});

test("only super admins and admins can create admin accounts, and only super admins can create super admins", async () => {
  activeAdmins = new Map([
    [1, { id: 1, role_id: 1, is_active: true }],
    [2, { id: 2, role_id: 2, is_active: true }],
    [3, { id: 3, role_id: 3, is_active: true }],
  ]);
  try {
    const register = (adminId, roleId, newRole) =>
      call("POST", "/api/v1/admin/auth/register", { token: adminToken({ id: adminId, role_id: roleId }), body: { role_id: newRole } });
    assert.equal((await register(3, 3, 3)).status, 403, "sales executive cannot create admins");
    assert.equal((await register(2, 2, 1)).status, 403, "admin cannot create a super admin");
    assert.equal((await register(2, 2, 3)).status, 200, "admin can create a sales executive");
    assert.equal((await register(1, 1, 1)).status, 200, "super admin can create a super admin");
  } finally {
    activeAdmins = new Map([[1, { id: 1, role_id: 1, is_active: true }]]);
  }
});

test("password hashes, OTPs and reset tokens never appear in JSON responses", async () => {
  const res = await call("GET", "/api/v1/admin/auth/findAdminById?id=1", { token: adminToken() });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data, { id: 1, name: "Admin", admin_role: {} });
});

test("the log routes are admin-only", async () => {
  assert.equal((await call("GET", "/api/v1/logs")).status, 401);
  assert.equal((await call("DELETE", "/api/v1/logs", { token: userToken() })).status, 403);
  assert.equal((await call("GET", "/api/v1/logs", { token: adminToken() })).status, 200);
});

test("every admin role can read the admin content lists (they used to let through only the role names Admin and Admin Level One)", async () => {
  const { ROLE_NAMES } = loadFromRoot("src/config/roles.js");
  const adminRoles = [1, 2, 3, 5];
  activeAdmins = new Map(adminRoles.map((id) => [id, { id, role_id: id, is_active: true }]));
  const { findOne, findByPk } = models.Role;
  models.Role.findByPk = models.Role.findOne = async (id) => ({ id, name: ROLE_NAMES[typeof id === "object" ? id.where.id : id] });
  try {
    for (const roleId of adminRoles) {
      for (const path of [
        "/api/v1/content/getAllAboutUsByAdmin",
        "/api/v1/content/getAllTermsAndConditonsByAdmin",
        "/api/v1/content/getAllBannerImgaeByAdmin",
        "/api/v1/contactUs/getAllContactUs",
      ]) {
        const res = await call("GET", path, { token: adminToken({ id: roleId, role_id: roleId }) });
        assert.equal(res.status, 200, `role ${roleId}: ${path}`);
      }
    }
  } finally {
    Object.assign(models.Role, { findOne, findByPk });
    activeAdmins = new Map([[1, { id: 1, role_id: 1, is_active: true }]]);
  }
});

test("guest login is gone: it handed anyone an app token, with the role taken from a request header", async () => {
  const res = await call("POST", "/api/v1/user/auth/guestLogin", { headers: { role_id: "7" } });
  assert.equal(res.status, 404);
});

test("the logo emails link to is served by the API", async () => {
  const res = await fetch(`${baseUrl}/api/v1/assets/logo.jpg`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
});
