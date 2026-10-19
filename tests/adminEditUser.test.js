// Editing a user as an admin (POST /admin/user/adminEditUser/:id), in one transaction: email and
// profile, employee type and role, an employee's hiring form and the address taken from it.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot } = require("./helpers/mocks");

const db = recordingDatabase();
recordingModule("src/config/logger.js", db.log, {});
recordingModule("src/services/Common/email.service.js", db.log, {});
const { adminEditUser } = loadFromRoot("src/services/Admin/user.service.js");

const personalInfo = { section_name: "personalInfo", data: JSON.stringify({ streetAddress: "5 Oak Ave", aptSuite: "Apt 2B" }) };
const location = { address_lat: "27.95", address_long: -82.46, country_id: 1, state_id: "10", city_id: 100 };

const setup = ({ user, form, taken = false, emailTaken = false }) => {
  db.respond("User.findByPk", () => user);
  db.respond("User.findOne", (q) => (q.where.email ? (emailTaken ? { id: 2 } : null) : taken ? { id: 3 } : null));
  db.respond("Profile.findOne", () => ({ id: 70, user_id: user?.id, name: "Old" }));
  db.respond("FormSubmission.findOne", () => form);
  let created;
  db.respond("UserAddress.create", (values) => (created = { id: 900, ...values }));
  db.respond("UserAddress.findOne", (q) => (q.order ? { id: 899, user_id: user.id, address: "on file" } : created));
};

beforeEach(() => db.reset());

const ended = () => db.log.filter(([n]) => n.startsWith("transaction.")).map(([n]) => n);

test("a client's email is saved lowercased on the user and the profile", async () => {
  setup({ user: { id: 40, role_id: 6, email: "client@example.com" } });
  await adminEditUser({ name: "New Name", email: "  New@Example.COM ", cc_email: "", client_type: "residential" }, 40);
  assert.deepEqual(db.log.find(([n]) => n === "User#update")[2], { email: "new@example.com", cc_email: null, client_type: "residential" });
  assert.deepEqual(db.log.find(([n]) => n === "Profile#update")[2], { name: "New Name", email: "new@example.com" });
  assert.deepEqual(ended(), ["transaction.start", "transaction.commit"]);
});

test("invalid edits are 400s and nothing is saved", async () => {
  for (const [user, body, options, message] of [
    [{ id: 40, role_id: 6, email: "a@example.com" }, { email: "b@example.com" }, { emailTaken: true }, "Email already exists"],
    [{ id: 40, role_id: 6, email: "a@example.com" }, { employee_type: "contractor" }, {}, "Invalid employee type"],
    [{ id: 40, role_id: 6, email: "a@example.com" }, { role_id: 9 }, {}, "Role can only be changed between employee roles"],
    [{ id: 41, role_id: 9, email: "e@example.com" }, {}, {}, "Hiring form submission is required for employees"],
    [{ id: 41, role_id: 9, email: "e@example.com" }, { hiring_form_submission_id: 5, ...location }, { form: { id: 5, applicant_email: "other@example.com" } }, "Selected hiring form does not belong to this employee email"],
    [{ id: 41, role_id: 9, email: "e@example.com" }, { hiring_form_submission_id: 5, ...location }, { form: { id: 5, applicant_email: "e@example.com" }, taken: true }, "This hiring form has already been assigned to another employee"],
    [{ id: 41, role_id: 9, email: "e@example.com" }, { hiring_form_submission_id: 5, ...location, city_id: 0 }, { form: { id: 5, applicant_email: "e@example.com" } }, "Valid city ID is required"],
  ]) {
    db.reset();
    setup({ user, ...options });
    await assert.rejects(adminEditUser(body, user.id), (err) => err.statusCode === 400 && err.message === message);
    assert.equal(db.log.filter(([n]) => n.endsWith("#update") || n.endsWith(".create")).length, 0, message);
    assert.deepEqual(ended(), ["transaction.start", "transaction.rollback"]);
  }
});

test("an employee's new hiring form gives them a new address from the form", async () => {
  setup({ user: { id: 41, role_id: 9, email: "e@example.com", hiring_form_submission_id: 4 }, form: { id: 5, applicant_email: "E@example.com", details_form_submission: [personalInfo] } });
  const result = await adminEditUser({ hiring_form_submission_id: "5", employee_type: "1099", ...location }, 41);
  assert.deepEqual(db.log.find(([n]) => n === "User#update")[2], { email: "e@example.com", employee_type: "1099", hiring_form_submission_id: 5 });
  const address = db.calls("UserAddress.create")[0][1];
  assert.deepEqual(
    [address.address, address.role_id, address.country_id, address.state_id, address.city_id, address.address_lat, address.address_long],
    ["5 Oak Ave, Apt 2B", 9, 1, 10, 100, 27.95, -82.46],
  );
  assert.equal(result.user_address.id, 900);
});

test("re-saving the same hiring form keeps the address on file", async () => {
  setup({ user: { id: 41, role_id: 9, email: "e@example.com", hiring_form_submission_id: 5 }, form: { id: 5, applicant_email: "e@example.com", details_form_submission: [personalInfo] } });
  const result = await adminEditUser({ hiring_form_submission_id: 5, ...location }, 41);
  assert.equal(db.calls("UserAddress.create").length, 0);
  assert.equal(result.user_address.address, "on file");
});

test("a hiring form without an address is a 400", async () => {
  setup({ user: { id: 41, role_id: 9, email: "e@example.com" }, form: { id: 5, applicant_email: "e@example.com", details_form_submission: [{ section_name: "personalInfo", data: { streetAddress: " " } }] } });
  await assert.rejects(adminEditUser({ hiring_form_submission_id: 5, ...location }, 41), (err) => err.statusCode === 400 && err.message === "Address not found in selected hiring form");
});
