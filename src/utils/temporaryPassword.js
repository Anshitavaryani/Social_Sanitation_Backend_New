// Temporary passwords emailed to new admins, new users and users whose credentials an admin resets.
//
// Built from crypto.randomInt (unpredictable and unbiased), unlike Math.random. Letters and
// digits only: the password is inserted into HTML emails as is, and people type it on phones.
// Characters that are easy to misread (0 O o 1 I l) are left out.
const { randomInt } = require("crypto");
const { PASSWORD } = require("../config/rules");

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;

const DEFAULT_LENGTH = 12; // about 69 bits of randomness

const pick = (chars) => chars[randomInt(chars.length)];

const generateTemporaryPassword = (length = DEFAULT_LENGTH) => {
  if (!Number.isInteger(length) || length < PASSWORD.MIN_LENGTH) {
    throw new RangeError(`A temporary password needs at least ${PASSWORD.MIN_LENGTH} characters`);
  }
  // an upper case and a lower case letter, and as many digits as the password policy asks for
  const chars = [pick(UPPER), pick(LOWER), ...Array.from({ length: PASSWORD.MIN_DIGITS }, () => pick(DIGITS))];
  while (chars.length < length) chars.push(pick(ALPHABET));

  // Fisher-Yates shuffle, so the guaranteed characters are not always first
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

module.exports = { generateTemporaryPassword, ALPHABET };
