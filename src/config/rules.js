// Business rules and limits, each written once. Every caller reads them from here, so changing a
// rule here changes it everywhere (tests/rules.test.js pins today's values).

// Passwords: every new password (sign-up, change, reset; app and admin) and every temporary one
const PASSWORD = Object.freeze({
  MIN_LENGTH: 8,
  MAX_LENGTH: 100,
  MIN_DIGITS: 2,
  BLOCKED: Object.freeze(["Passw0rd", "Password123"]),
  HASH_ROUNDS: 10, // bcrypt cost
});

const PASSWORD_POLICY_MESSAGE =
  `Password should have a minimum length of ${PASSWORD.MIN_LENGTH} characters and must have at least ` +
  `${PASSWORD.MIN_DIGITS} digits and No Blank Space`;

// One-time codes (app: email verification and forgot password; admin: forgot password)
const OTP_RULES = Object.freeze({
  APP_CODE_DIGITS: 4,
  ADMIN_CODE_DIGITS: 6,
  APP_CODE_MINUTES: 5,
  ADMIN_CODE_MINUTES: 10,
  APP_RESET_TOKEN_MINUTES: 30, // after the app code is verified, to set the new password
  MAX_ATTEMPTS: 5, // wrong codes before the code stops working
  APP_ATTEMPT_WINDOW_MINUTES: 10, // how long wrong app codes are counted
});

// Attendance, counted from the booking's start time
const ATTENDANCE = Object.freeze({
  LATE_AFTER_MINUTES: 60, // no clock-in by then, or a clock-in after it: LATE
  ABSENT_AFTER_MINUTES: 120, // still no clock-in by then: ABSENT (a clock-in is never ABSENT)
  CLOCK_OUT_MAX_DISTANCE_KM: 0.5, // farther from the service address alerts the admin
});

const BOOKING = Object.freeze({
  DEFAULT_DURATION_HOURS: 2, // when no end time was set
});

const INVOICE = Object.freeze({
  DEFAULT_DEPOSIT_PERCENT: 25, // when a deposit is asked for without a percentage
});

// Square payment links
const SQUARE_CHECKOUT = Object.freeze({
  SALES_TAX_PERCENT: "7.5",
  TIP_PERCENTAGES: Object.freeze([10, 15, 20]),
});

const PAGINATION = Object.freeze({
  DEFAULT_PAGE_SIZE: 10, // when a list request sends no limit
  ADMIN_BOOKINGS_PAGE_SIZE: 50, // admin booking list: the admin panel does not always send a limit yet
});

const LIMITS = Object.freeze({
  MAX_UPLOAD_FILE_MB: 25, // per uploaded file
  MAX_REQUEST_BODY_MB: 25, // JSON and form bodies
});

module.exports = {
  PASSWORD,
  PASSWORD_POLICY_MESSAGE,
  OTP_RULES,
  ATTENDANCE,
  BOOKING,
  INVOICE,
  SQUARE_CHECKOUT,
  PAGINATION,
  LIMITS,
};
