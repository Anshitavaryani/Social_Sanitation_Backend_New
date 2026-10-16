// App forgot-password flow: a verified code becomes a reset token that is valid for 30 minutes,
// and saving an OTP row no longer pushes its expiry 5 minutes ahead.
require("./helpers/env");
const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { mockDatabase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models } = mockDatabase();

const OTPModel = loadFromRoot("src/models/otp.model.js");
const authService = loadFromRoot("src/services/User/auth.service.js");
const userAuthMiddleware = loadFromRoot("src/middlewares/userAuth.middleware.js");
const { otpTypes } = loadFromRoot("src/config/types.js");

const NOW = new Date("2026-10-16T15:00:00Z");
const MINUTE = 60 * 1000;

afterEach(() => mock.timers.reset());

// Runs the model's beforeValidate hooks without touching a database
const runValidateHooks = (otp) => OTPModel.runHooks("beforeValidate", otp, {});

test("a new OTP row is valid for 5 minutes", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const otp = OTPModel.build({ email: "u@example.com", code: "4821", type: otpTypes.FORGOT_PASSWORD, role_id: 6 });
  await runValidateHooks(otp);
  assert.equal(otp.otp_expiration_time.getTime(), NOW.getTime() + 5 * MINUTE);
});

test("saving an existing OTP row keeps its expiry (it used to move 5 minutes ahead on every save)", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const expiry = new Date(NOW.getTime() - MINUTE);
  const otp = OTPModel.build(
    { id: 4, email: "u@example.com", code: "token", type: otpTypes.FORGOT_PASSWORD, otp_expiration_time: expiry },
    { isNewRecord: false },
  );
  await runValidateHooks(otp);
  assert.equal(otp.otp_expiration_time.getTime(), expiry.getTime());
});

const otpRow = (overrides = {}) => ({
  id: 301,
  code: "4821",
  is_active: true,
  is_verified: false,
  otp_expiration_time: new Date(NOW.getTime() + 4 * MINUTE),
  async save() {},
  ...overrides,
});

test("verifying a forgot-password code returns a reset token valid for 30 minutes", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const row = otpRow();
  models.OTP.findOne = async () => row;

  const { token } = await authService.verifyOTP("u@example.com", "4821", otpTypes.FORGOT_PASSWORD, 6);

  assert.equal(token.length, 50);
  assert.equal(row.code, token);
  assert.equal(row.is_verified, true);
  assert.equal(row.otp_expiration_time.getTime(), NOW.getTime() + 30 * MINUTE);
});

test("verifying an email-verification code does not extend it", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const row = otpRow();
  const expiry = row.otp_expiration_time;
  models.OTP.findOne = async () => row;
  models.User.update = async () => [1];

  await authService.verifyOTP("u@example.com", "4821", otpTypes.EMAIL_VERIFICATION, 6);
  assert.equal(row.otp_expiration_time, expiry);
});

const resetRequest = () => ({
  headers: { role_id: "6" },
  body: { email: "u@example.com", password: "New#Pass1", confirm_password: "New#Pass1", token: "reset-token" },
});

test("the reset token is accepted within its 30 minutes", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  const user = { id: 9, email: "u@example.com" };
  const row = otpRow({ code: "reset-token", is_verified: true, otp_expiration_time: new Date(NOW.getTime() + MINUTE) });
  models.User.findOne = async () => user;
  models.OTP.findOne = async () => row;

  const req = resetRequest();
  const { res, err } = await runHandler(userAuthMiddleware.validateForgetPassordToken, req);
  assert.equal(err, undefined);
  assert.equal(res.body, undefined, "the request goes on to the reset handler");
  assert.equal(req.body.user, user);
  assert.equal(req.body.otpDoc, row);
});

test("an expired reset token is refused with 400", async () => {
  mock.timers.enable({ apis: ["Date"], now: NOW });
  models.User.findOne = async () => ({ id: 9 });
  for (const expiry of [new Date(NOW.getTime() - MINUTE), null]) {
    models.OTP.findOne = async () => otpRow({ code: "reset-token", is_verified: true, otp_expiration_time: expiry });
    const { err } = await runHandler(userAuthMiddleware.validateForgetPassordToken, resetRequest());
    assert.equal(err.statusCode, 400);
    assert.equal(err.message, "Your password reset session has expired. Please request a new OTP.");
  }
});
