// OTPs (randomatic -> crypto.randomInt) and token-service error handling.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models, sequelize } = mockDatabase();

const emails = [];
const realEmailService = loadFromRoot("src/services/Common/email.service.js");
mockModule("src/services/Common/email.service.js", {
  ...realEmailService,
  sendEmailVerification: async (to, otp) => emails.push({ kind: "verification", to, otp }),
  sendForgotPasswordOTP: async (to, otp) => emails.push({ kind: "forgot", to, otp }),
});

const authService = loadFromRoot("src/services/User/auth.service.js");
const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
const tokenService = loadFromRoot("src/services/Common/token.service.js");
const ApiError = loadFromRoot("src/utils/ApiError.js");
const { otpTypes } = loadFromRoot("src/config/types.js");

test("user OTPs are 4-digit strings (leading zeros kept) stored and emailed with the same code", async () => {
  const stored = [];
  models.OTP.findOne = async () => null;
  models.OTP.create = async (row) => {
    stored.push(row);
    return row;
  };
  emails.length = 0;

  const codes = new Set();
  for (let i = 0; i < 300; i++) {
    await authService.sendOTP({ email: "user@example.com", type: otpTypes.EMAIL_VERIFICATION }, { role_id: "6" });
  }
  for (const [i, row] of stored.entries()) {
    assert.match(row.code, /^\d{4}$/);
    assert.equal(emails[i].otp, row.code);
    codes.add(row.code);
  }
  assert.ok(codes.size > 250, `expected varied codes, got ${codes.size} distinct of 300`);
});

test("forgot-password OTP goes to the forgot-password email", async () => {
  models.OTP.create = async (row) => row;
  emails.length = 0;
  await authService.sendOTP({ email: "user@example.com", type: otpTypes.FORGOT_PASSWORD }, { role_id: "6" });
  assert.equal(emails[0].kind, "forgot");
  assert.match(emails[0].otp, /^\d{4}$/);
});

test("admin OTPs are 6-digit strings saved on the admin and emailed", async () => {
  const updates = [];
  models.Admin.findOne = async () => ({ email: "admin@example.com" });
  models.Admin.update = async (values) => {
    updates.push(values);
    return [1];
  };
  emails.length = 0;

  for (let i = 0; i < 50; i++) {
    await adminAuthService.sendOTP("admin@example.com");
  }
  for (const [i, values] of updates.entries()) {
    assert.match(values.otp, /^\d{6}$/);
    assert.equal(values.is_otp_valid, true);
    assert.equal(emails[i].otp, values.otp);
  }
});

test("admin OTP for an unknown email is a 404, not a crash", async () => {
  models.Admin.findOne = async () => null;
  await assert.rejects(adminAuthService.sendOTP("missing@example.com"), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.statusCode, 404);
    return true;
  });
});

test("generateAuthTokens rejects a missing user with ApiError 500 (httpStatus is imported)", async () => {
  await assert.rejects(tokenService.generateAuthTokens(null, "fcm"), (err) => {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${err.constructor.name}: ${err.message}`);
    assert.equal(err.statusCode, 500);
    return true;
  });
});

test("token insert binds every value, so a malicious fcm_token cannot inject SQL", async () => {
  const queries = [];
  sequelize.query = async (sql, options) => {
    queries.push({ sql, options });
    return [123, 1];
  };
  const attack = "x'); DROP TABLE users; -- ";

  const tokens = await tokenService.generateAuthTokens({ id: 9, role_id: 6 }, attack);

  assert.equal(tokens.access.id, 123);
  assert.equal(tokens.access.token.split(".").length, 3);
  const { sql, options } = queries[0];
  assert.doesNotMatch(sql, /DROP TABLE/, "raw values must not be concatenated into the SQL");
  assert.equal(options.replacements.fcm_token, attack);

  // Render exactly as Sequelize would for MySQL: the payload must stay inside one string literal
  const { injectReplacements } = require(require.resolve("sequelize/lib/utils/sql", { paths: [require("./helpers/mocks").ROOT] }));
  const rendered = injectReplacements(sql, sequelize.dialect, options.replacements);
  assert.match(rendered, /'x\\'\); DROP TABLE users; -- '\)$/);
});

test("a login without an fcm_token stores NULL instead of the string 'undefined'", async () => {
  const queries = [];
  sequelize.query = async (sql, options) => {
    queries.push(options);
    return [1, 1];
  };
  await tokenService.generateAuthTokens({ id: 9, role_id: 6 }, undefined);
  assert.equal(queries[0].replacements.fcm_token, null);
});

test("admin forgot-password takes only a live reset token from verify-otp", async () => {
  const { TEST_JWT_SECRET } = require("./helpers/env");
  const jwt = require("jsonwebtoken");
  const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
  const key = Buffer.from(TEST_JWT_SECRET, "hex");
  const updates = [];
  models.Admin.findOne = async ({ where }) => (where.id === 4 ? { id: 4 } : null);
  models.Admin.update = async (values) => updates.push(values) && [1];
  const reset = (token) =>
    adminAuthService.forgotAdminPassword({ email: "a@example.com", token, password: "Strong#Pass12", confirm_password: "Strong#Pass12" });
  const expiredMessage = "Your password reset session has expired. Please request a new OTP.";
  const signIn = jwt.sign({ id: 4, role_id: 1, department_id: 1, is_backlisted: false }, key, { algorithm: "HS256", expiresIn: "1d" });
  await assert.rejects(reset(signIn), (err) => err.statusCode === 400 && err.message === expiredMessage, "a sign-in token");
  const expired = jwt.sign({ id: 4, type: "reset_password" }, key, { algorithm: "HS256", expiresIn: -10 });
  await assert.rejects(reset(expired), (err) => err.statusCode === 400 && err.message === expiredMessage, "an expired reset token");
  assert.equal(updates.length, 0);
  await reset(jwt.sign({ id: 4, type: "reset_password" }, key, { algorithm: "HS256", expiresIn: "1d" }));
  assert.equal(updates.length, 1);
});
