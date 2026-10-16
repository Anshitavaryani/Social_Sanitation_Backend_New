// Temporary passwords (new admins, admin-created users, admin credential resets) come from
// crypto.randomInt instead of Math.random, and the emailed password is the one that is stored.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { mockModule, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();

const sentEmails = [];
const realEmailService = loadFromRoot("src/services/Common/email.service.js");
const recordEmail = (kind) => async (to, password) => {
  sentEmails.push({ kind, to, password });
  return true;
};
mockModule("src/services/Common/email.service.js", {
  ...realEmailService,
  sendAdminCredentials: recordEmail("admin"),
  sendUserCredentials: recordEmail("user"),
  sendUpdatedUserCredentials: recordEmail("reset"),
});

const { generateTemporaryPassword, ALPHABET } = loadFromRoot("src/utils/temporaryPassword.js");
const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
const userService = loadFromRoot("src/services/Admin/user.service.js");

const VALID = new RegExp(`^[${ALPHABET}]{12}$`);

// Fails the test if anything in `fn` reaches for Math.random
const withoutMathRandom = async (fn) => {
  const original = Math.random;
  Math.random = () => {
    throw new Error("Math.random was used");
  };
  try {
    return await fn();
  } finally {
    Math.random = original;
  }
};

beforeEach(() => {
  sentEmails.length = 0;
});

test("a temporary password is 12 letters and digits with an upper case letter, a lower case letter and a digit", async () => {
  await withoutMathRandom(() => {
    for (let i = 0; i < 2000; i++) {
      const password = generateTemporaryPassword();
      assert.match(password, VALID);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[a-z]/);
      assert.match(password, /[0-9]/);
      assert.doesNotMatch(password, /[0O1Ilo]/, "no easily misread characters");
    }
  });
});

test("temporary passwords do not repeat and use the whole alphabet evenly", () => {
  const seen = new Set();
  const counts = Object.fromEntries([...ALPHABET].map((c) => [c, 0]));
  const firstChars = new Set();
  for (let i = 0; i < 20000; i++) {
    const password = generateTemporaryPassword();
    seen.add(password);
    firstChars.add(password[0]);
    for (const c of password) counts[c]++;
  }
  assert.equal(seen.size, 20000);
  // Each password has one guaranteed character of each kind plus 9 drawn from the whole alphabet,
  // so a digit (8 of them) is expected 20000 * (1/8 + 9/56) times and a letter (24 per case)
  // 20000 * (1/24 + 9/56) times. A biased generator lands far outside 10% of that.
  for (const [c, n] of Object.entries(counts)) {
    const kindSize = /[0-9]/.test(c) ? 8 : 24;
    const expected = 20000 * (1 / kindSize + 9 / ALPHABET.length);
    assert.ok(Math.abs(n - expected) < expected * 0.1, `${c} appeared ${n} times (expected about ${Math.round(expected)})`);
  }
  // the guaranteed upper/lower/digit characters are shuffled, not always at the front
  assert.equal(firstChars.size, ALPHABET.length);
});

test("a temporary password can be longer, never shorter than 8", () => {
  assert.equal(generateTemporaryPassword(16).length, 16);
  assert.throws(() => generateTemporaryPassword(6), RangeError);
});

test("creating an admin emails a secure temporary password that matches the stored hash", async () => {
  let stored;
  models.Admin.create = async (values) => {
    stored = values;
    return { id: 3, ...values };
  };

  await withoutMathRandom(() =>
    adminAuthService.createAdminUser({ name: "New Admin", role_id: 2, email: "new.admin@example.com", mobile: "+15555550100" }),
  );

  assert.equal(sentEmails.length, 1);
  const { kind, to, password } = sentEmails[0];
  assert.deepEqual([kind, to], ["admin", "new.admin@example.com"]);
  assert.match(password, VALID);
  assert.ok(await bcrypt.compare(password, stored.password));
});

test("adding a user from the admin panel emails a secure temporary password that matches the stored hash", async () => {
  let stored;
  models.User.findOne = async () => null;
  models.User.create = async (values) => {
    stored = values;
    return { id: 700, ...values };
  };
  models.Profile.create = async (values) => ({ id: 1, ...values });

  await withoutMathRandom(() => userService.adminAddUser({ name: "Office Admin", email: "office@example.com", role_id: 2 }));

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].kind, "user");
  assert.match(sentEmails[0].password, VALID);
  assert.ok(await bcrypt.compare(sentEmails[0].password, stored.password));
});

test("resetting a user's credentials emails a new secure password that matches the stored hash", async () => {
  const updates = [];
  models.User.findByPk = async () => ({
    id: 9,
    email: "client@example.com",
    user_profile: null,
    async update(values) {
      updates.push(values);
    },
  });

  const result = await withoutMathRandom(() => userService.resetUserCredentials({ user_id: 9 }));

  assert.equal(result.message, "New credentials sent to client@example.com");
  assert.equal(sentEmails.length, 1);
  assert.deepEqual([sentEmails[0].kind, sentEmails[0].to], ["reset", "client@example.com"]);
  assert.match(sentEmails[0].password, VALID);
  assert.equal(updates.length, 1);
  assert.ok(await bcrypt.compare(sentEmails[0].password, updates[0].password));
});

test("each new account gets a different password", async () => {
  models.Admin.create = async (values) => ({ id: 4, ...values });
  for (let i = 0; i < 5; i++) {
    await adminAuthService.createAdminUser({ name: "A", role_id: 2, email: `a${i}@example.com` });
  }
  assert.equal(new Set(sentEmails.map((e) => e.password)).size, 5);
});
