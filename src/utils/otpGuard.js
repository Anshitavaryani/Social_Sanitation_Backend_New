// Expiry and wrong-attempt limits for one-time codes.
//
// State lives in this process's memory: pm2 runs a single instance (ecosystem.config.json),
// so every request sees the same counters. A restart forgets them, which only means a
// pending code has to be requested again. Running several instances would need a shared
// store (database or Redis) instead.
const { randomInt } = require("crypto");
const { OTP_RULES } = require("../config/rules");

const MAX_ATTEMPTS = OTP_RULES.MAX_ATTEMPTS;
const ADMIN_OTP_TTL_MS = OTP_RULES.ADMIN_CODE_MINUTES * 60 * 1000;
const APP_ATTEMPT_WINDOW_MS = OTP_RULES.APP_ATTEMPT_WINDOW_MINUTES * 60 * 1000;

// A random numeric code of the given length, leading zeros kept ("0042")
const generateOtpCode = (digits) => String(randomInt(0, 10 ** digits)).padStart(digits, "0");

const entries = new Map(); // key -> { expiresAt, attempts }

const prune = (now) => {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
};

// Starts tracking a freshly issued code (resets its attempt count).
const issue = (key, ttlMs) => {
  const now = Date.now();
  prune(now);
  entries.set(key, { expiresAt: now + ttlMs, attempts: 0 });
};

// True while the code issued for `key` is within its lifetime.
const isActive = (key) => {
  const entry = entries.get(key);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return false;
  }
  return true;
};

// Counts a wrong code. Returns true once MAX_ATTEMPTS is reached: the caller must then
// invalidate the code so a new one has to be requested.
const recordFailure = (key, ttlMs) => {
  const now = Date.now();
  const entry = entries.get(key) || { expiresAt: now + ttlMs, attempts: 0 };
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entries.delete(key);
    return true;
  }
  entries.set(key, entry);
  return false;
};

const clear = (key) => entries.delete(key);

// Request bodies may carry the code as a number; codes are compared as trimmed strings.
const sameCode = (submitted, expected) =>
  submitted !== undefined && submitted !== null && expected !== undefined && expected !== null &&
  String(submitted).trim() === String(expected).trim();

module.exports = {
  MAX_ATTEMPTS,
  ADMIN_OTP_TTL_MS,
  APP_ATTEMPT_WINDOW_MS,
  generateOtpCode,
  issue,
  isActive,
  recordFailure,
  clear,
  sameCode,
};
