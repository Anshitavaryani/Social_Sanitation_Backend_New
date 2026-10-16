// Business rules live in src/config/rules.js: these tests pin their values and check that the
// callers apply them (password policy everywhere, one page size, one hashing cost, one OTP shape).
const { TEST_JWT_SECRET } = require("./helpers/env");
const jwt = require("jsonwebtoken");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models } = mockDatabase();
mockFirebase();
mockPackage("axios", {
  post: async (url, body) => {
    squareBodies.push(body);
    return { data: { payment_link: { id: "L", url: "U", order_id: "O" } } };
  },
});
const squareBodies = [];

const lookups = [];
mockModule("src/services/index.js", {
  countryService: { getAllCountry: async (body, query) => lookups.push(query) && [] },
});

const rules = loadFromRoot("src/config/rules.js");
const validatePassword = loadFromRoot("src/helpers/validatePassword.js");
const { generateTemporaryPassword } = loadFromRoot("src/utils/temporaryPassword.js");
const { hashPassword } = loadFromRoot("src/utils/password.js");
const { generateOtpCode } = loadFromRoot("src/utils/otpGuard.js");
const toBoolean = loadFromRoot("src/utils/toBoolean.js");
const { parsePagination } = loadFromRoot("src/utils/pagination.js");
const { distanceInKm, distanceInMiles } = loadFromRoot("src/utils/geo.js");

const POLICY_MESSAGE = "Password should have a minimum length of 8 characters and must have at least 2 digits and No Blank Space";

test("the rules keep the values the app used before they were gathered", () => {
  assert.deepEqual({ ...rules.PASSWORD, BLOCKED: [...rules.PASSWORD.BLOCKED] }, {
    MIN_LENGTH: 8,
    MAX_LENGTH: 100,
    MIN_DIGITS: 2,
    BLOCKED: ["Passw0rd", "Password123"],
    HASH_ROUNDS: 10,
  });
  assert.equal(rules.PASSWORD_POLICY_MESSAGE, POLICY_MESSAGE);
  assert.deepEqual({ ...rules.OTP_RULES }, {
    APP_CODE_DIGITS: 4,
    ADMIN_CODE_DIGITS: 6,
    APP_CODE_MINUTES: 5,
    ADMIN_CODE_MINUTES: 10,
    APP_RESET_TOKEN_MINUTES: 30,
    MAX_ATTEMPTS: 5,
    APP_ATTEMPT_WINDOW_MINUTES: 10,
  });
  assert.deepEqual({ ...rules.ATTENDANCE }, { LATE_AFTER_MINUTES: 60, ABSENT_AFTER_MINUTES: 120, CLOCK_OUT_MAX_DISTANCE_KM: 0.5 });
  assert.equal(rules.BOOKING.DEFAULT_DURATION_HOURS, 2);
  assert.equal(rules.INVOICE.DEFAULT_DEPOSIT_PERCENT, 25);
  assert.equal(rules.SQUARE_CHECKOUT.SALES_TAX_PERCENT, "7.5");
  assert.deepEqual([...rules.SQUARE_CHECKOUT.TIP_PERCENTAGES], [10, 15, 20]);
  assert.deepEqual({ ...rules.PAGINATION }, { DEFAULT_PAGE_SIZE: 10, ADMIN_BOOKINGS_PAGE_SIZE: 50 }, "10: the page size most lists used");
  assert.deepEqual({ ...rules.LIMITS }, { MAX_UPLOAD_FILE_MB: 25, MAX_REQUEST_BODY_MB: 25 });
});

test("one password policy, and temporary passwords always meet it", () => {
  for (const ok of ["abcdef12", "Clean#Pass12", "x".repeat(98) + "12"]) assert.equal(validatePassword(ok), true, ok);
  for (const bad of ["abc12", "abcdefg1", "abc def12", "Password123", "x".repeat(99) + "12"]) assert.equal(validatePassword(bad), false, bad);
  for (let i = 0; i < 2000; i++) {
    const password = generateTemporaryPassword();
    assert.equal(validatePassword(password), true, password);
  }
});

test("admin password changes and resets follow the app password policy (they had no policy)", async () => {
  const adminAuthMiddleware = loadFromRoot("src/middlewares/adminAuth.middleware.js");
  const change = (newPassword) =>
    runHandler(adminAuthMiddleware.validateResetPassordBody, {
      body: { old_password: "Old#Pass12", new_password: newPassword, confirm_password: newPassword },
    });
  const weak = await change("weakpass1");
  assert.equal(weak.res.statusCode, 400);
  assert.equal(weak.res.body.message, POLICY_MESSAGE);
  const strong = await change("Strong#Pass12");
  assert.equal(strong.res.body, undefined, "a valid new password goes on to the handler");

  const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
  models.Admin.findOne = async () => ({ id: 4 });
  const resetToken = jwt.sign({ id: 4, type: "reset_password" }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256", expiresIn: "1d" });
  const updates = [];
  models.Admin.update = async (values) => updates.push(values) && [1];
  await assert.rejects(
    adminAuthService.forgotAdminPassword({ email: "a@example.com", token: resetToken, password: "weakpass1", confirm_password: "weakpass1" }),
    (err) => err.statusCode === 400 && err.message === POLICY_MESSAGE,
  );
  assert.equal(updates.length, 0);
  await adminAuthService.forgotAdminPassword({ email: "a@example.com", token: resetToken, password: "Strong#Pass12", confirm_password: "Strong#Pass12" });
  assert.equal(updates.length, 1);
  assert.ok(bcrypt.compareSync("Strong#Pass12", updates[0].password));
});

test("passwords are hashed with the configured cost", () => {
  const hash = hashPassword("Clean#Pass12");
  assert.match(hash, /^\$2[ab]\$10\$/);
  assert.ok(bcrypt.compareSync("Clean#Pass12", hash));
});

test("one-time codes have the configured number of digits, leading zeros kept", () => {
  for (let i = 0; i < 500; i++) {
    assert.match(generateOtpCode(rules.OTP_RULES.APP_CODE_DIGITS), /^\d{4}$/);
    assert.match(generateOtpCode(rules.OTP_RULES.ADMIN_CODE_DIGITS), /^\d{6}$/);
  }
});

test("yes/no values from forms, JSON and the database read the same everywhere", () => {
  for (const yes of [true, 1, "1", "true", "TRUE", " True "]) assert.equal(toBoolean(yes), true, JSON.stringify(yes));
  for (const no of [false, 0, "0", "false", "", null, undefined, "yes", 2]) assert.equal(toBoolean(no), false, JSON.stringify(no));
});

test("lists use one default page size; bad page values fall back instead of reaching the database", async () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10, offset: 0 });
  assert.deepEqual(parsePagination({ page: "3", limit: "25" }), { page: 3, limit: 25, offset: 50 });
  assert.deepEqual(parsePagination({ page: "abc", limit: "-5" }), { page: 1, limit: 10, offset: 0 });
  assert.deepEqual(parsePagination({ page: "0", limit: "2.5" }), { page: 1, limit: 10, offset: 0 });

  // country, state and city lists used DEFAULT_API_DATA_LIMIT (15 in production); now the shared default
  const countryController = loadFromRoot("src/controllers/Common/country.controller.js");
  await runHandler(countryController.getAllCountry, { body: {}, query: {}, params: {} });
  assert.deepEqual(lookups[0], { sortBy: "ASC", page: 1, limit: 10, offset: 0 });
});

test("the admin booking list keeps its larger default page size, and bad values fall back the same way", async () => {
  assert.deepEqual(parsePagination({}, rules.PAGINATION.ADMIN_BOOKINGS_PAGE_SIZE), { page: 1, limit: 50, offset: 0 });
  const adminBookingService = loadFromRoot("src/services/Admin/booking.service.js");
  const queries = [];
  models.Booking.findAndCountAll = async (query) => queries.push(query) && { count: 0, rows: [] };
  for (const paging of [{}, { page: "2" }, { page: "2", limit: "2.5" }, { page: "3", limit: "20" }]) {
    await adminBookingService.getAllBookings({ booking_status: "UPCOMING", period: "all", ...paging });
  }
  // a limit of 2.5 used to reach the database as LIMIT 2.5
  assert.deepEqual(queries.map((q) => [q.limit, q.offset]), [[50, 0], [50, 50], [50, 50], [20, 40]]);
});

test("distances match the formulas they replaced", () => {
  // New York to Los Angeles
  assert.equal(Math.round(distanceInKm(40.7128, -74.006, 34.0522, -118.2437)), 3936);
  assert.equal(distanceInMiles(40.7128, -74.006, 34.0522, -118.2437), 2445.59);
});

test("every Square payment link uses the configured sales tax, tip options and currency", async () => {
  const square = loadFromRoot("src/services/Common/square.service.js");
  models.Payment.create = async (row) => row;
  models.Payment.findOne = async () => null;
  squareBodies.length = 0;
  const { log } = console;
  console.log = () => {};
  try {
    await square.generateSquarePaymentLink({ amount: 10, refNo: "Q", customerEmail: "c@example.com", user_id: 1 });
    await square.generateContractPaymentLink({ amount: 10, clientName: "Acme", customerEmail: "c@example.com", user_id: 1 });
    await square.generateInvoicePaymentLink({ amount: 10, clientName: "Acme", customerEmail: "c@example.com", user_id: 1, invoice_id: 2, invoiceRefNo: "I-2" });
  } finally {
    console.log = log;
  }
  assert.equal(squareBodies.length, 3);
  for (const body of squareBodies) {
    assert.deepEqual(body.order.taxes, [{ name: "Sales Tax (7.5%)", percentage: "7.5", scope: "ORDER" }]);
    assert.deepEqual(body.checkout_options.tip_settings.tip_percentages, [10, 15, 20]);
    assert.equal(body.order.line_items[0].base_price_money.currency, "USD");
  }
  assert.equal(squareBodies[2].checkout_options.tip_settings.show_custom_tip_amount, true, "invoice links keep their extra tip field");
  assert.equal(squareBodies[0].checkout_options.tip_settings.show_custom_tip_amount, undefined);
});
