// Admin endpoints answer with the status their own checks intend: 400 for bad input, 404 for a
// missing record, an empty list when there is nothing to list, and 403 when an admin may not
// change another admin. Each of these was a 500 before (found by calling every route with empty
// and wrongly typed input).
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
mockFirebase();
mockModule("src/services/Common/email.service.js", new Proxy({}, { get: () => async () => true }));

const userService = loadFromRoot("src/services/Admin/user.service.js");
const bookingService = loadFromRoot("src/services/Admin/booking.service.js");
const adminAuthService = loadFromRoot("src/services/Admin/adminAuth.service.js");
const formService = loadFromRoot("src/services/Common/form.service.js");
const faqService = loadFromRoot("src/services/Common/faq.service.js");
const chatService = loadFromRoot("src/services/Common/chat.service.js");
const groupChatService = loadFromRoot("src/services/Common/groupChat.service.js");
const dailyChecklistService = loadFromRoot("src/services/Common/dailyChecklist.service.js");

const rejectsWith = (promise, status, message) =>
  assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, status, err.message);
    if (message) assert.equal(err.message, message);
    return true;
  });

test("an endpoint's own 400s and 404s are no longer turned into 500s", async () => {
  models.User.findOne = async () => ({ id: 3, email: "taken@example.com" });
  await rejectsWith(userService.adminAddUser({ name: "New", email: "taken@example.com", role_id: 6 }), 400, "Email already exists");

  models.User.findByPk = async () => null;
  await rejectsWith(userService.resetUserCredentials({ user_id: 77 }), 404, "User not found");
  await rejectsWith(userService.addNewUserAddress({ user_id: 77, address: "1 Main St" }), 404, "User not found");
});

test("a missing record is a 404 with the same message", async () => {
  models.FormSubmission.findOne = async () => null;
  await rejectsWith(formService.getFormById(9), 404, "Data Not Found.");
  models.Booking.findOne = async () => null;
  await rejectsWith(bookingService.getBookingById(9), 404, "No bookings found");
  models.Faq.findOne = async () => null;
  await rejectsWith(faqService.deleteFaq(9), 404, "Invalid Id");
  models.User.findOne = async () => null;
  await rejectsWith(userService.getUserById(9), 404, "Failed to Get This User");
  await rejectsWith(chatService.getUserMessages({ user: { id: 1 }, userId: 9 }), 404, "User not found");
});

test("an empty list is an empty list, not a 500", async () => {
  models.User.findAll = async () => [];
  assert.deepEqual(await userService.getAllSupervisorByAdmin(1), []);
  assert.deepEqual(await userService.getAllQualityInspectorByAdmin(1), []);
  assert.deepEqual(await userService.getAllCleanerByAdmin(1), []);
  assert.deepEqual(await userService.getAllUserNameByAdmin(), []);
  models.Payment.findAll = async () => [];
  assert.deepEqual(await userService.getAllTransactions(), []);
});

test("missing or wrongly typed input is a 400", async () => {
  await rejectsWith(bookingService.sendEmployeeTwoWeekSchedule(undefined), 400, "employee_id is required");
  const user = { id: 1, role_id: 1 };
  await rejectsWith(groupChatService.sendGroupMessage({ user, groupId: "-Nabc", message: 5 }), 400, "A message or at least one attachment is required.");
  await rejectsWith(groupChatService.updateGroupName({ user, groupId: "-Nabc", newName: { a: 1 } }), 400, "A valid group name of up to 100 characters is required.");
  await rejectsWith(groupChatService.createTeam({ user, name: 5 }), 400, "Team name is required.");
  // a new main title without an old one used to crash after doing nothing
  assert.equal((await dailyChecklistService.createOrUpdateChecklistMainTitle({ new_main_title: "Night" })).updated_count, 0);
});

test("changing or removing another admin follows the rule for creating one", async () => {
  const admins = new Map([
    [1, { id: 1, role_id: 1 }],
    [2, { id: 2, role_id: 2 }],
    [3, { id: 3, role_id: 3 }],
    [5, { id: 5, role_id: 5 }],
  ]);
  const saved = [];
  const row = (id) => {
    const admin = admins.get(id);
    return admin && { ...admin, save: async function () { saved.push({ ...this }); }, destroy: async () => saved.push({ deleted: id }) };
  };
  models.Admin.findOne = async ({ where }) => (where.email ? (where.email === "used@example.com" ? { id: 9 } : null) : row(Number(where.id)));
  const as = (id) => admins.get(id);

  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 2, name: "X" }, as(5)), 403, "Your admin role is not allowed to do this.");
  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 5, role_id: 1 }, as(5)), 403, "Your admin role is not allowed to do this.");
  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 1, name: "X" }, as(2)), 403, "Only a super admin can change or remove a super admin.");
  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 3, role_id: 1 }, as(2)), 403, "Only a super admin can create another super admin.");
  await rejectsWith(adminAuthService.deleteAdmin({ admin_id: 3 }, as(5)), 403, "Your admin role is not allowed to do this.");
  await rejectsWith(adminAuthService.deleteAdmin({ admin_id: 1 }, as(2)), 403, "Only a super admin can change or remove a super admin.");
  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 99, name: "X" }, as(1)), 404, "Admin not found");
  await rejectsWith(adminAuthService.updateAdmin({ admin_id: 3, email: "used@example.com" }, as(2)), 400, "Email already in use");

  saved.length = 0;
  await adminAuthService.updateAdmin({ admin_id: 5, name: "Own name", role_id: 5 }, as(5)); // own profile, role unchanged
  await adminAuthService.updateAdmin({ admin_id: 3, role_id: 5 }, as(2));
  await adminAuthService.updateAdmin({ admin_id: 2, role_id: 1 }, as(1));
  await adminAuthService.deleteAdmin({ admin_id: 3 }, as(2));
  assert.deepEqual(
    saved.map((s) => (s.deleted ? `delete ${s.deleted}` : `${s.id}:${s.role_id}:${s.name ?? ""}`)),
    ["5:5:Own name", "3:5:", "2:1:", "delete 3"],
  );
});
