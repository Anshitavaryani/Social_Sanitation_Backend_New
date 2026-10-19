// OTP expiry and attempt limits, and the rule that credentials never reach the logs.
require("./helpers/env");
const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { ROOT, ENTRY_FILES, mockModule, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models, sequelize } = mockDatabase();

const emails = [];
const realEmailService = loadFromRoot("src/services/Common/email.service.js");
mockModule("src/services/Common/email.service.js", {
  ...realEmailService,
  sendForgotPasswordOTP: async (to, otp) => emails.push({ to, otp }),
  sendEmailVerification: async (to, otp) => emails.push({ to, otp }),
});

const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
const authService = loadFromRoot("src/services/User/auth.service.js");
const { otpTypes } = loadFromRoot("src/config/types.js");

afterEach(() => mock.timers.reset());

// An admin row whose OTP fields behave like the Sequelize instance
const adminRow = (id) => {
  const row = {
    id,
    email: `admin${id}@example.com`,
    role_id: 1,
    otp: null,
    is_otp_valid: false,
    saves: 0,
    async save() {
      this.saves += 1;
    },
  };
  models.Admin.findOne = async () => row;
  models.Admin.update = async (values) => {
    Object.assign(row, values);
    return [1];
  };
  return row;
};

const issueAdminOtp = async (row) => {
  emails.length = 0;
  await adminAuthService.sendOTP(row.email);
  return emails[0].otp;
};

const rejectsWith = (status, message) => (err) => {
  assert.equal(err.statusCode, status, `${err.statusCode}: ${err.message}`);
  if (message) assert.equal(err.message, message);
  return true;
};

test("admin OTP: the right code works once within 10 minutes", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });
  const row = adminRow(101);
  const code = await issueAdminOtp(row);
  mock.timers.tick(9 * 60 * 1000);

  const result = await adminAuthService.verifyOTP(row.email, code, otpTypes.FORGOT_PASSWORD);
  assert.ok(result.token, "forgot-password verification returns a reset token");
  assert.equal(row.is_otp_valid, false, "the code is single-use");
  await assert.rejects(adminAuthService.verifyOTP(row.email, code), rejectsWith(404, "Invalid OTP Entered"));
});

test("admin OTP: a code from the JSON body as a number is accepted", async () => {
  const row = adminRow(102);
  let code = await issueAdminOtp(row);
  while (code.startsWith("0")) code = await issueAdminOtp(row); // numbers lose leading zeros
  assert.equal(await adminAuthService.verifyOTP(row.email, Number(code)), "");
});

test("admin OTP expires after 10 minutes", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });
  const row = adminRow(103);
  const code = await issueAdminOtp(row);
  mock.timers.tick(10 * 60 * 1000 + 1);

  await assert.rejects(
    adminAuthService.verifyOTP(row.email, code),
    rejectsWith(400, "OTP has expired. Please request a new one."),
  );
  assert.equal(row.is_otp_valid, false);
});

test("admin OTP locks after 5 wrong attempts, even if the 6th is right", async () => {
  const row = adminRow(104);
  const code = await issueAdminOtp(row);
  const wrong = code === "000000" ? "111111" : "000000";

  for (let i = 1; i <= 4; i++) {
    await assert.rejects(adminAuthService.verifyOTP(row.email, wrong), rejectsWith(404, "Invalid OTP Entered"));
  }
  await assert.rejects(
    adminAuthService.verifyOTP(row.email, wrong),
    rejectsWith(429, "Too many incorrect attempts. Please request a new OTP."),
  );
  assert.equal(row.is_otp_valid, false);
  await assert.rejects(adminAuthService.verifyOTP(row.email, code), rejectsWith(404));
});

test("a new admin OTP resets the attempt count", async () => {
  const row = adminRow(105);
  let code = await issueAdminOtp(row);
  const wrong = () => (code === "000000" ? "111111" : "000000");
  for (let i = 0; i < 4; i++) await assert.rejects(adminAuthService.verifyOTP(row.email, wrong()));

  code = await issueAdminOtp(row);
  for (let i = 0; i < 4; i++) await assert.rejects(adminAuthService.verifyOTP(row.email, wrong()), rejectsWith(404));
  assert.equal(await adminAuthService.verifyOTP(row.email, code), "");
});

test("an admin OTP issued before a restart (no tracked expiry) counts as expired", async () => {
  const row = adminRow(106);
  Object.assign(row, { otp: "123456", is_otp_valid: true }); // set directly, never issued by this process
  await assert.rejects(adminAuthService.verifyOTP(row.email, "123456"), rejectsWith(400, "OTP has expired. Please request a new one."));
});

// A user OTP row as stored in the otps table
const userOtpRow = (id, code, expiresInMs = 5 * 60 * 1000) => {
  const row = {
    id,
    code,
    is_active: true,
    is_verified: false,
    otp_expiration_time: new Date(Date.now() + expiresInMs),
    saves: 0,
    async save() {
      this.saves += 1;
    },
  };
  models.OTP.findOne = async () => (row.is_active ? row : null);
  models.User.update = async () => [1];
  return row;
};

test("user OTP (4 digits) locks after 5 wrong attempts", async () => {
  const row = userOtpRow(201, "4821");
  for (let i = 1; i <= 4; i++) {
    await assert.rejects(
      authService.verifyOTP("u@example.com", "0000", otpTypes.EMAIL_VERIFICATION, 6),
      rejectsWith(400, "Invalid OTP Entered"),
    );
  }
  await assert.rejects(
    authService.verifyOTP("u@example.com", "0000", otpTypes.EMAIL_VERIFICATION, 6),
    rejectsWith(429, "Too many incorrect attempts. Please request a new OTP."),
  );
  assert.equal(row.is_active, false, "the locked code is deactivated");
  await assert.rejects(
    authService.verifyOTP("u@example.com", "4821", otpTypes.EMAIL_VERIFICATION, 6),
    rejectsWith(400, "Invalid Email or Type"),
  );
});

test("user OTP: the right code after a few mistakes still works, also as a number", async () => {
  const row = userOtpRow(202, "4821");
  for (let i = 0; i < 3; i++) {
    await assert.rejects(authService.verifyOTP("u@example.com", "1111", otpTypes.EMAIL_VERIFICATION, 6));
  }
  await authService.verifyOTP("u@example.com", 4821, otpTypes.EMAIL_VERIFICATION, 6);
  assert.equal(row.is_verified, true);
});

test("user OTP still expires after 5 minutes", async () => {
  userOtpRow(203, "4821", -1000);
  await assert.rejects(
    authService.verifyOTP("u@example.com", "4821", otpTypes.EMAIL_VERIFICATION, 6),
    rejectsWith(400, "OTP has been Expired"),
  );
});

// Captures everything written through console.* while fn runs
const captureConsole = async (fn) => {
  const lines = [];
  const original = {};
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    original[level] = console[level];
    console[level] = (...args) => lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  }
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.join("\n");
};

test("logging in never writes the password or the session token to the logs", async () => {
  const password = "Sup3r-Secret-Pass!";
  models.User.findOne = async () => ({
    id: 9,
    role_id: 6,
    email: "a@b.c",
    password: await bcrypt.hash(password, 4),
    user_profile: { name: "Ana" },
  });
  models.Timezone.findOne = async () => ({ id: 4 });
  sequelize.query = async () => [1, 1];

  let result;
  const output = await captureConsole(async () => {
    result = await authService.login(
      { email: "a@b.c", password, fcm_token: "device-token-123" },
      { role_id: "6", timezone: "America/New_York" },
    );
  });
  assert.doesNotMatch(output, /Sup3r-Secret-Pass!/);
  assert.doesNotMatch(output, new RegExp(result.tokens.access.token.split(".")[2]));
  assert.doesNotMatch(output, /device-token-123/);
});

test("no source file passes request bodies, headers or credentials to console.*", () => {
  const espree = require(require.resolve("espree", { paths: [ROOT] }));
  const sensitive = new Set([
    "reqBody", "body", "headers", "password", "confirm_password", "new_password", "old_password",
    "token", "tokenDoc", "accessToken", "otp", "generatedOTP", "otpDoc", "registrationTokens",
    "fcm_token", "receiverUniqueFCMTokensArray", "userDoc", "user", "adminDoc", "admin",
    "paymentObj", "sourceId", "customer", "secret", "privateKey", "credentials",
  ]);
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js")) files.push(full);
    }
  })(path.join(ROOT, "src"));
  files.push(...ENTRY_FILES);

  const offenders = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const ast = espree.parse(source, { ecmaVersion: 2023, loc: true });
    (function visit(node) {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.object.name === "console") {
        for (const arg of node.arguments) {
          const isSensitiveName = arg.type === "Identifier" && sensitive.has(arg.name);
          const isRequestPart =
            arg.type === "MemberExpression" && !arg.computed && arg.object.name === "req" && ["body", "headers"].includes(arg.property.name);
          const isSecretField =
            arg.type === "MemberExpression" && !arg.computed && ["password", "token", "otp", "code", "fcm_token"].includes(arg.property.name);
          if (isSensitiveName || isRequestPart || isSecretField) {
            offenders.push(`${path.relative(ROOT, file)}:${node.loc.start.line}`);
          }
        }
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value.type === "string") visit(value);
      }
    })(ast);
  }
  assert.deepEqual(offenders, []);
});
