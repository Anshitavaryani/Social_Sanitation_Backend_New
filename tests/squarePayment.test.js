// Square SDK v46 migration: the controller must send the same Square API calls as before.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mockDatabase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models } = mockDatabase();

const calls = [];
let squareResponses = {};

// Square's SDK uses the global fetch; answer each endpoint from squareResponses.
global.fetch = async (url, init = {}) => {
  const { pathname } = new URL(String(url));
  calls.push({ method: init.method || "GET", path: pathname, body: init.body ? JSON.parse(init.body) : undefined });
  const key = `${init.method || "GET"} ${pathname}`;
  return new Response(JSON.stringify(squareResponses[key] || {}), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

const crypto = require("crypto");
const controller = loadFromRoot("src/controllers/Common/squarePayment.controller.js");
const config = loadFromRoot("src/config/config.js");

const makeUser = (overrides = {}) => ({
  id: 7,
  role_id: 6,
  email: "client@example.com",
  square_customer_id: "",
  user_profile: { name: "Client Name", mobile: "+15555550100" },
  saved: false,
  async save() {
    this.saved = true;
  },
  ...overrides,
});

// Booking 55 belongs to user 7, booking 56 to someone else
const bookings = { 1: { id: 1, user_id: 7 }, 55: { id: 55, user_id: 7 }, 56: { id: 56, user_id: 8 } };

beforeEach(() => {
  calls.length = 0;
  models.Booking.findOne = async ({ where }) => bookings[where.id] || null;
  models.Payment.findOne = async () => null;
  squareResponses = {
    "POST /v2/customers": { customer: { id: "CUST_NEW" } },
    "GET /v2/customers/CUST_OLD": { customer: { id: "CUST_OLD" } },
    "POST /v2/payments": {
      payment: {
        id: "PAY_1",
        status: "COMPLETED",
        receipt_url: "https://squareup.com/receipt/PAY_1",
        amount_money: { amount: 1999, currency: "USD" },
      },
    },
  };
});

test("createPayment creates a Square customer, charges the right amount and records the payment", async () => {
  const recorded = [];
  models.Payment.create = async (row) => {
    recorded.push(row);
    return row;
  };
  const user = makeUser();

  const { res, err } = await runHandler(controller.createPayment, {
    body: { user, booking_id: 55, sourceId: "cnon:card-nonce", amount: 19.99 },
  });

  assert.equal(err, undefined);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ["POST /v2/customers", "POST /v2/payments"],
  );
  assert.equal(calls[0].body.email_address, "client@example.com");
  assert.equal(calls[0].body.given_name, "Client Name");
  // 19.99 * 100 is 1998.9999... in floating point; it must be sent as 1999 cents
  assert.equal(calls[1].body.amount_money.amount, 1999);
  assert.equal(calls[1].body.customer_id, "CUST_NEW");
  assert.equal(calls[1].body.source_id, "cnon:card-nonce");

  assert.equal(user.square_customer_id, "CUST_NEW");
  assert.equal(user.saved, true);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].transaction_id, "PAY_1");
  assert.equal(recorded[0].currency, "USD");
  assert.deepEqual(res.body.data, {
    paymentId: "PAY_1",
    customer: "CUST_NEW",
    status: "COMPLETED",
    receiptUrl: "https://squareup.com/receipt/PAY_1",
  });
});

test("createPayment reuses an existing Square customer", async () => {
  models.Payment.create = async (row) => row;
  const { err } = await runHandler(controller.createPayment, {
    body: { user: makeUser({ square_customer_id: "CUST_OLD" }), booking_id: 1, sourceId: "nonce", amount: 40 },
  });
  assert.equal(err, undefined);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    ["GET /v2/customers/CUST_OLD", "POST /v2/payments"],
  );
  assert.equal(calls[1].body.amount_money.amount, 4000);
});

// Runs createPayment for user 7 and returns the status and message it answered with
const pay = async (body) => {
  const error = console.error;
  console.error = () => {};
  try {
    const { res, err } = await runHandler(controller.createPayment, { body: { user: makeUser(), sourceId: "nonce", ...body } });
    return err ? { status: err.statusCode, message: err.message } : { status: res.statusCode, body: res.body };
  } finally {
    console.error = error;
  }
};

test("createPayment refuses a booking that is missing or belongs to someone else, before calling Square", async () => {
  assert.deepEqual(await pay({ booking_id: 56, amount: 10 }), { status: 403, message: "This booking does not belong to you." });
  assert.deepEqual(await pay({ booking_id: 999, amount: 10 }), { status: 404, message: "Booking not found." });
  assert.deepEqual(await pay({ amount: 10 }), { status: 400, message: "booking_id is required." });
  assert.equal(calls.length, 0);
});

test("createPayment refuses amounts that are not a positive dollar amount with 2 decimals", async () => {
  for (const amount of [undefined, null, "", "abc", 0, -5, "-5", 10.001, "1e-3", Infinity, [10], { value: 10 }]) {
    const result = await pay({ booking_id: 55, amount });
    assert.equal(result.status, 400, `amount ${JSON.stringify(amount)}`);
    assert.equal(result.message, "amount must be a positive dollar amount with at most 2 decimal places.");
  }
  assert.deepEqual(await pay({ booking_id: 55, amount: 10, sourceId: "" }), { status: 400, message: "sourceId is required." });
  assert.equal(calls.length, 0);
});

test("createPayment accepts an amount sent as a string", async () => {
  const recorded = [];
  models.Payment.create = async (row) => recorded.push(row);
  const result = await pay({ booking_id: 55, amount: " 125.50 " });
  assert.equal(result.status, 200);
  assert.equal(calls.find((c) => c.path === "/v2/payments").body.amount_money.amount, 12550);
  assert.equal(recorded[0].amount, 125.5);
});

test("createPayment: a retry with the same idempotency_key reuses the Square key and records the payment once", async () => {
  const recorded = [];
  models.Payment.create = async (row) => recorded.push(row);
  models.Payment.findOne = async ({ where }) => recorded.find((r) => r.transaction_id === where.transaction_id) || null;

  await pay({ booking_id: 55, amount: 40, idempotency_key: "attempt-1" });
  await pay({ booking_id: 55, amount: 40, idempotency_key: "attempt-1" });
  await pay({ booking_id: 55, amount: 40, idempotency_key: "attempt-2" });

  const keys = calls.filter((c) => c.path === "/v2/payments").map((c) => c.body.idempotency_key);
  assert.equal(keys[0], keys[1], "the retry sends the same key, so Square returns the first charge");
  assert.notEqual(keys[0], keys[2]);
  assert.ok(keys.every((k) => k.length <= 45), "Square allows at most 45 characters");
  assert.equal(recorded.length, 1, "the fake Square answers PAY_1 every time: one payment row");
});

test("createPayment without an idempotency_key uses a new key per request", async () => {
  models.Payment.create = async (row) => row;
  await pay({ booking_id: 55, amount: 40 });
  await pay({ booking_id: 55, amount: 40 });
  const keys = calls.filter((c) => c.path === "/v2/payments").map((c) => c.body.idempotency_key);
  assert.notEqual(keys[0], keys[1]);
  assert.deepEqual(await pay({ booking_id: 55, amount: 40, idempotency_key: 12 }), {
    status: 400,
    message: "idempotency_key must be a string of up to 100 characters.",
  });
});

test("webhook looks up the order through the Square payments API when the event lacks it", async () => {
  squareResponses["GET /v2/payments/PAY_9"] = { payment: { id: "PAY_9", order_id: "ORDER_9" } };
  const lookups = [];
  models.Payment.findOne = async ({ where }) => {
    lookups.push(where);
    return null;
  };

  const { res } = await runHandler(controller.handlePaymentWebhook, {
    body: { type: "payment.updated", data: { object: { payment: { id: "PAY_9", status: "COMPLETED" } } } },
  });

  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), ["GET /v2/payments/PAY_9"]);
  assert.deepEqual(lookups[0], { square_order_id: "ORDER_9" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, "Payment record not found");
});

test("webhook ignores unrelated event types without calling Square", async () => {
  const { res } = await runHandler(controller.handlePaymentWebhook, { body: { type: "refund.created" } });
  assert.equal(res.body.message, "Event ignored");
  assert.equal(calls.length, 0);
});

// Square signs webhooks with base64(HMAC-SHA256(signature key, notification URL + raw body))
const signedWebhook = (body, { key = "test-signature-key", url = "https://api.example.com/api/v1/payment/square/webhooks", tamper = false } = {}) => {
  const rawBody = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", key).update(url + rawBody).digest("base64");
  const headers = { "x-square-hmacsha256-signature": tamper ? signature.replace(/^./, (c) => (c === "A" ? "B" : "A")) : signature };
  return {
    body,
    rawBody,
    originalUrl: "/api/v1/payment/square/webhooks",
    protocol: "https",
    get: (name) => headers[name.toLowerCase()] ?? (name.toLowerCase() === "host" ? "api.example.com" : undefined),
  };
};

test("webhook with a valid Square signature is processed", async () => {
  config.square.webhookSignatureKey = "test-signature-key";
  config.square.webhookUrl = "https://api.example.com/api/v1/payment/square/webhooks";
  try {
    const { res } = await runHandler(controller.handlePaymentWebhook, signedWebhook({ type: "refund.created" }));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.message, "Event ignored");
  } finally {
    config.square.webhookSignatureKey = undefined;
    config.square.webhookUrl = undefined;
  }
});

test("webhook with a forged or missing signature is rejected with 401 before anything is touched", async () => {
  config.square.webhookSignatureKey = "test-signature-key";
  config.square.webhookUrl = "https://api.example.com/api/v1/payment/square/webhooks";
  let lookedUp = false;
  models.Payment.findOne = async () => {
    lookedUp = true;
    return null;
  };
  try {
    const forgedPayment = { type: "payment.updated", data: { object: { payment: { id: "PAY_X", status: "COMPLETED", order_id: "O1" } } } };
    for (const req of [
      signedWebhook(forgedPayment, { tamper: true }),
      signedWebhook(forgedPayment, { key: "attacker-key" }),
      { ...signedWebhook(forgedPayment), get: () => undefined },
    ]) {
      const { res } = await runHandler(controller.handlePaymentWebhook, req);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body.message, "Invalid webhook signature");
    }
    assert.equal(lookedUp, false, "no payment record was read or updated");
  } finally {
    config.square.webhookSignatureKey = undefined;
    config.square.webhookUrl = undefined;
  }
});

test("without a configured signature key the webhook keeps working (and warns)", async () => {
  const warnings = [];
  const logger = loadFromRoot("src/config/logger.js");
  const warn = logger.warn;
  logger.warn = (...args) => warnings.push(args.join(" "));
  try {
    const { res } = await runHandler(controller.handlePaymentWebhook, { body: { type: "refund.created" }, get: () => undefined });
    assert.equal(res.body.message, "Event ignored");
  } finally {
    logger.warn = warn;
  }
  assert.ok(warnings.some((w) => String(w).includes("SQUARE_WEBHOOK_SIGNATURE_KEY")));
});
