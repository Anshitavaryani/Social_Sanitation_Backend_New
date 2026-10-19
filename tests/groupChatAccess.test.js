// Group chats (audit row 2): app users read, post to, rename, delete and list the participants of
// only the groups they are members of, booking groups included (only teams were checked before).
// Admins reach every group. App users see an admin's display fields only.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models } = mockDatabase();
const firebase = mockFirebase();
mockModule("src/config/logger.js", { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} });
mockModule("src/config/firebaseStorage.js", { uploadFileToFirebase: async () => "https://storage.test/f" });
const groups = loadFromRoot("src/services/Common/groupChat.service.js");

firebase.db.data = { "GroupChats/booking_100": { name: "Office - 2026-10-20", members: { employee_20: true, admin_1: true } } };

const cleaner = { user: { id: 20, role_id: 9 }, user_type: "USER" };
const outsider = { user: { id: 21, role_id: 9 }, user_type: "USER" };
const admin = { user: { id: 5, role_id: 3 }, user_type: "ADMIN" };

const refused = (promise) => assert.rejects(promise, (err) => err.statusCode === 403 && err.message === "You are not a member of this group.");

test("app users reach only the booking groups they are members of", async () => {
  await refused(groups.getGroupMessages("booking_100", outsider));
  await refused(groups.sendGroupMessage({ ...outsider, groupId: "booking_100", message: "hi" }));
  await refused(groups.updateGroupName({ ...outsider, groupId: "booking_100", newName: "Mine" }));
  await refused(groups.getGroupParticipants("booking_100", outsider));
  await refused(groups.deleteGroup("booking_100", outsider));
  assert.equal(firebase.db.writes.length, 0, "nothing written for the outsider");

  await groups.sendGroupMessage({ ...cleaner, groupId: "booking_100", message: "on my way" });
  await groups.updateGroupName({ ...cleaner, groupId: "booking_100", newName: "Office crew" });
  assert.ok(firebase.db.writes.some((w) => w.op === "update" && w.value.name === "Office crew"));
});

test("admins reach every group, members or not", async () => {
  firebase.db.writes.length = 0;
  models.User.findByPk = async () => null;
  models.Admin.findByPk = async () => null;
  await groups.getGroupParticipants("booking_100", admin);
  await groups.sendGroupMessage({ ...admin, groupId: "booking_100", message: "update" });
  assert.ok(firebase.db.writes.length > 0);
});

test("app users get an admin's name, contact and role only", async () => {
  models.Admin.findOne = async () => ({ id: 2, role_id: 1, name: "Ann Admin", email: "ann@example.com", mobile: "555", socket_id: "s-1", is_otp_valid: true, department_id: 4, admin_role: { id: 1, name: "Super Admin", created_at: "x" } });
  const controller = loadFromRoot("src/controllers/Admin/adminAuth.controller.js");
  const asApp = await runHandler(controller.findAdminById, { query: { id: 2 }, body: { user_type: "USER", user: { id: 9 } } });
  assert.deepEqual(asApp.res.body.data, { id: 2, role_id: 1, name: "Ann Admin", email: "ann@example.com", mobile: "555", admin_role: { id: 1, name: "Super Admin" } });
  const asAdmin = await runHandler(controller.findAdminById, { query: { id: 2 }, body: { user_type: "ADMIN", user: { id: 1 } } });
  assert.equal(asAdmin.res.body.data.socket_id, "s-1", "admins still get the whole row");
});
