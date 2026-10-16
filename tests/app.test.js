// Boots the real app.js over HTTP with the database mocked. The cron scheduler is mocked too, to
// show the API schedules no jobs (worker.js runs them; tests/jobs.test.js).
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const scheduled = [];
mockPackage("node-cron", {
  schedule: (expression, task, options) => {
    scheduled.push({ expression, task, options });
    return { stop() {} };
  },
});
const { models } = mockDatabase();
mockFirebase();

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

const request = async (method, url, { body, headers } = {}) => {
  const res = await fetch(baseUrl + url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, text, json };
};

const adminToken = () =>
  jwt.sign({ id: 1, role_id: 1 }, Buffer.from(TEST_JWT_SECRET, "hex"), {
    algorithm: "HS256",
    expiresIn: "5m",
  });

test("health check and test routes respond", async () => {
  assert.deepEqual((await request("GET", "/api/healthcheck")).json, { response: "ok" });
  assert.equal((await request("GET", "/test")).text, "Hello World !!");
});

test("unknown routes return the JSON 404 shape", async () => {
  const { status, json } = await request("GET", "/api/v1/does-not-exist");
  assert.equal(status, 404);
  assert.deepEqual(json, { success: false, status: 404, message: "Not found", data: "" });
});

test("removed Google Calendar and Stripe routes are gone", async () => {
  for (const url of ["/api/v1/calendar/listEvents", "/api/v1/calendar/authorize", "/api/v1/payment/stripe/stripe-key"]) {
    assert.equal((await request("GET", url)).status, 404, url);
  }
});

test("log routes require an admin token", async () => {
  for (const method of ["GET", "DELETE"]) {
    const { status, json } = await request(method, "/api/v1/logs");
    assert.equal(status, 401, method);
    assert.equal(json.success, false);
    assert.equal(json.message, "Authentication required. Send the access token in the x-access-token header.");
  }
});

test("GET /api/v1/logs works for an admin (req.body is writable on GET under Express 5)", async () => {
  models.Admin.findOne = async () => ({ id: 1, role_id: 1, is_active: true });
  const { status, json } = await request("GET", "/api/v1/logs", { headers: { "x-access-token": adminToken() } });
  assert.equal(status, 200);
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data));
});

test("service errors reach the client as JSON with the right status", async () => {
  models.User.findOne = async () => null;
  const { status, json } = await request("POST", "/api/v1/user/auth/login", {
    body: { email: "nobody@example.com", password: "Wrong#123" },
  });
  assert.ok(status >= 400 && status < 500, `expected 4xx, got ${status}`);
  assert.equal(json.success, false);
  assert.equal(json.status, status);
});

test("the API process schedules no jobs", () => {
  assert.equal(scheduled.length, 0);
});
