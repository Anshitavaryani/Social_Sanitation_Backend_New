require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadFromRoot, fakeResponse } = require("./helpers/mocks");

const errorHandler = loadFromRoot("src/utils/errorHandler.js");
const ApiError = loadFromRoot("src/utils/ApiError.js");

const run = (err, res = fakeResponse()) => {
  let forwarded;
  errorHandler(err, {}, res, (e) => {
    forwarded = e;
  });
  return { res, forwarded };
};

test("ApiError keeps its status code and message", () => {
  const { res } = run(new ApiError(404, "Booking not found"));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { success: false, status: 404, message: "Booking not found", data: "" });
});

test("ApiError without a valid status code becomes a JSON 500 instead of crashing", () => {
  for (const code of [undefined, "ECONNREFUSED", 200, 99.5]) {
    const { res } = run(new ApiError(code, "upstream failed"));
    assert.equal(res.statusCode, 500, `status for ${code}`);
    assert.equal(res.body.status, 500);
    assert.equal(res.body.message, "upstream failed", "message must not be replaced by the stack");
  }
});

test("unexpected errors return a generic 500 message", () => {
  const { res } = run(new TypeError("cannot read x of undefined"));
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.message, "An internal server error occurred.");
});

test("errors after the response has started are forwarded to Express", () => {
  const res = fakeResponse();
  res.headersSent = true;
  const err = new Error("late");
  const { forwarded } = run(err, res);
  assert.equal(forwarded, err);
});
