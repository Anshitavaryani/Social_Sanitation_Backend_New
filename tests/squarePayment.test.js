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

const controller = loadFromRoot("src/controllers/Common/squarePayment.controller.js");

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

beforeEach(() => {
  calls.length = 0;
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
