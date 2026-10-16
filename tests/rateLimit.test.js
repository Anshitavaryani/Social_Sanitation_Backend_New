// In production, repeated failed sign-in / OTP / reset attempts are limited per IP
// (20 failures per 15 minutes); other endpoints are not affected.
require("./helpers/env");
process.env.NODE_ENV = "production";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
mockDatabase();
mockFirebase();
const stub = new Proxy({}, { get: () => new Proxy({}, { get: () => (req, res) => res.status(200).json({ ok: true }) }) });
for (const file of ["src/controllers/index.js", "src/controllers/Admin/index.js", "src/controllers/Common/index.js", "src/controllers/User/index.js"]) {
  mockModule(file, stub);
}

let server;
let baseUrl;
before(async () => {
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

const post = (path, body = {}) =>
  fetch(baseUrl + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("the 21st failed admin sign-in from one IP is refused with 429", async () => {
  for (let i = 1; i <= 20; i++) {
    const res = await post("/api/v1/admin/auth/login"); // empty body: 400, counts as a failure
    assert.equal(res.status, 400, `attempt ${i}`);
  }
  const blocked = await post("/api/v1/admin/auth/login");
  assert.equal(blocked.status, 429);
});

test("other admin endpoints are not rate limited", async () => {
  for (let i = 0; i < 25; i++) {
    const res = await post("/api/v1/admin/booking/getAllBookings");
    assert.equal(res.status, 401); // no token, but never 429
  }
});
