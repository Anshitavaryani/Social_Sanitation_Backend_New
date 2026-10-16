// End to end with the real controllers: tokens issued by the real admin and app login
// endpoints are accepted by the access layer, and logging out ends an app session.
require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
const { models, sequelize } = mockDatabase();
mockFirebase();

let server;
let baseUrl;
let adminRow;
let userRow;
let session = null; // the user_tokens row created at login

before(async () => {
  adminRow = {
    id: 7,
    email: "admin@example.com",
    name: "Admin",
    role_id: 1,
    department_id: 1,
    is_active: true,
    password: await bcrypt.hash("Admin#Pass1", 4),
  };
  userRow = {
    id: 9,
    email: "client@example.com",
    role_id: 6,
    is_active: true,
    password: await bcrypt.hash("Client#Pass1", 4),
    user_profile: { name: "Client" },
  };
  models.Admin.findOne = async ({ where }) =>
    (where.email === adminRow.email || Number(where.id) === adminRow.id) && adminRow.is_active ? adminRow : null;
  models.User.findOne = async ({ where }) => (where.email === userRow.email || Number(where.id) === userRow.id ? userRow : null);
  models.UserOAuth.findOne = async () => null;
  models.Timezone.findOne = async () => ({ id: 4 });
  // login stores the access token in user_tokens through a raw insert
  sequelize.query = async (sql, { replacements }) => {
    session = { id: 55, user_id: replacements.userId, role_id: replacements.role_id, token: replacements.token, is_active: true, destroy: async () => (session = null) || 1 };
    return [55, 1];
  };
  models.UserToken.findOne = async ({ where }) => (session && where.token === session.token ? session : null);
  models.User.count = async () => 3;

  const { log, info } = console;
  console.log = console.info = () => {};
  const app = loadFromRoot("app.js");
  Object.assign(console, { log, info });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const call = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-access-token": token } : {}), ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return { status: res.status, json: await res.json().catch(() => undefined) };
};

const quiet = async (fn) => {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

test("admin: the token from the real login works on admin endpoints", async () => {
  const login = await quiet(() =>
    call("POST", "/api/v1/admin/auth/login", { body: { email: adminRow.email, password: "Admin#Pass1" } }),
  );
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.data.token;
  assert.ok(token);
  assert.equal(login.json.data.password, undefined, "the login response carries no password hash");
  const { iat, exp } = jwt.decode(token);
  assert.equal(exp - iat, 5 * 24 * 60 * 60, "admin tokens last JWT_ADMIN_ACCESS_EXPIRATION_DAYS (default 5)");

  const count = await call("GET", "/api/v1/admin/user/getUserCount", { token });
  assert.equal(count.status, 200, JSON.stringify(count.json));
  assert.equal(count.json.data, 3);

  // the same admin token is accepted on shared endpoints and refused on app-only ones
  assert.notEqual((await quiet(() => call("GET", "/api/v1/booking/getBookingById/1", { token }))).status, 401);
  assert.equal((await call("GET", "/api/v1/user/profile", { token, headers: { role_id: "6" } })).status, 401);
});

test("admin: a deactivated admin's token stops working immediately", async () => {
  const login = await quiet(() =>
    call("POST", "/api/v1/admin/auth/login", { body: { email: adminRow.email, password: "Admin#Pass1" } }),
  );
  const token = login.json.data.token;
  adminRow.is_active = false;
  try {
    const res = await call("GET", "/api/v1/admin/user/getUserCount", { token });
    assert.equal(res.status, 401);
  } finally {
    adminRow.is_active = true;
  }
});

test("app user: the token from the real login works on shared endpoints, not on admin ones, and ends at logout", async () => {
  const login = await quiet(() =>
    call("POST", "/api/v1/user/auth/login", {
      body: { email: userRow.email, password: "Client#Pass1" },
      headers: { role_id: "6", timezone: "America/New_York" },
    }),
  );
  assert.equal(login.status, 200, JSON.stringify(login.json));
  const token = login.json.data.tokens.access.token;
  const { iat, exp } = jwt.decode(token);
  assert.ok(Math.abs(exp - iat - 30 * 24 * 60 * 60) <= 1, "app tokens last JWT_ACCESS_EXPIRATION_DAYS (30 in tests)");

  const shared = await quiet(() => call("GET", "/api/v1/user/getUserAddressByUserId/9", { token }));
  assert.notEqual(shared.status, 401, JSON.stringify(shared.json));
  assert.notEqual(shared.status, 403);

  const adminOnly = await call("GET", "/api/v1/admin/user/getUserCount", { token });
  assert.equal(adminOnly.status, 403);

  const logout = await quiet(() => call("GET", "/api/v1/user/auth/logout", { token, headers: { role_id: "6" } }));
  assert.equal(logout.status, 200, JSON.stringify(logout.json));
  const afterLogout = await call("GET", "/api/v1/user/getUserAddressByUserId/9", { token });
  assert.equal(afterLogout.status, 401);
});

test("public endpoints still work without a token", async () => {
  models.Service.findAll = async () => [];
  models.Country.findAll = async () => [];
  for (const path of ["/api/v1/service/getAllServices", "/api/v1/country", "/api/v1/faq"]) {
    const res = await quiet(() => call("GET", path));
    assert.notEqual(res.status, 401, path);
    assert.notEqual(res.status, 403, path);
  }
});
