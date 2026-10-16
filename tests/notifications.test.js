// Push notifications never turn a saved chat message or booking into an error, and a message an
// app user sends to the admin panel is not pushed to an unrelated app user.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
const { db, sent } = mockFirebase();

const realEmailService = loadFromRoot("src/services/Common/email.service.js");
mockModule("src/services/Common/email.service.js", { ...realEmailService, sendEmailToAdmin: async () => true });

const chatService = loadFromRoot("src/services/Common/chat.service.js");
const bookingsService = loadFromRoot("src/services/Common/bookings.service.js");

const appUser = { id: 9, role_id: 6 };
let userLookups;

beforeEach(() => {
  sent.length = 0;
  db.writes.length = 0;
  userLookups = [];
  models.User.findOne = async ({ where }) => (Number(where.id) === appUser.id ? appUser : null);
  models.User.findByPk = async (id) => {
    userLookups.push(Number(id));
    return Number(id) === appUser.id ? appUser : null;
  };
  models.UserToken.findAll = async () => [{ fcm_token: "phone-1" }];
});

const quietly = async (fn) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, error });
  }
};

const savedMessages = () => db.writes.filter((w) => w.op === "push").length;

test("an app user's message to an admin is saved and not pushed to the app user who shares the admin's id", async () => {
  await quietly(() =>
    chatService.sendMessage({ user: { id: 3, role_id: 6 }, message: "Where is my cleaner?", receiverUserId: 9, user_type: "USER" }, {}, {}),
  );
  assert.equal(savedMessages(), 2);
  assert.equal(sent.length, 0);
  assert.deepEqual(userLookups, [], "receiverUserId (an admin id) is never looked up in the users table");
});

test("an admin's message to an app user is pushed to that user", async () => {
  await quietly(() => chatService.sendMessage({ user: { id: 1, role_id: 1 }, message: "On the way", receiverUserId: 9, user_type: "ADMIN" }, {}, {}));
  assert.equal(savedMessages(), 2);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].tokens, ["phone-1"]);
  assert.deepEqual(sent[0].notification, { title: "You have received a message from Admin", body: "On the way" });
});

test("an admin's message to a user without push tokens is still sent (was a 400 after saving)", async () => {
  models.UserToken.findAll = async () => [];
  await quietly(() => chatService.sendMessage({ user: { id: 1, role_id: 1 }, message: "Hi", receiverUserId: 9, user_type: "ADMIN" }, {}, {}));
  assert.equal(savedMessages(), 2);
  assert.equal(sent.length, 0);
});

test("a failing push does not fail an admin's message", async () => {
  models.UserToken.findAll = async () => {
    throw new Error("database timeout");
  };
  await quietly(() => chatService.sendMessage({ user: { id: 1, role_id: 1 }, message: "Hi", receiverUserId: 9, user_type: "ADMIN" }, {}, {}));
  assert.equal(savedMessages(), 2);
});

test("an admin's message to an unknown user is a 404 and nothing is saved", async () => {
  await assert.rejects(
    quietly(() => chatService.sendMessage({ user: { id: 1, role_id: 1 }, message: "Hi", receiverUserId: 404, user_type: "ADMIN" }, {}, {})),
    (err) => err.statusCode === 404 && err.message === "Receiver not found",
  );
  assert.equal(savedMessages(), 0);
});

test("the admin push endpoint still reports a user without push tokens", async () => {
  models.UserToken.findAll = async () => [];
  await assert.rejects(
    quietly(() => chatService.sendNotification({ message: "Hi", receiverUserId: 9, senderType: "ADMIN" })),
    (err) => err.statusCode === 400 && err.message === "No active FCM tokens found for this user",
  );
});

const bookingRequest = () => [
  { user: { id: 9, role_id: 6 }, service_id: 3, date: "2026-10-20", time: "10:00:00", type: "One Time Booking", notes: "" },
  {},
  { timezone: "America/New_York" },
];

const stubBookingModels = () => {
  const notifications = [];
  models.Service.findOne = async () => ({ id: 3, abbreviation: "RC" });
  models.Booking.create = async (values) => ({ id: 77, ...values });
  models.Notification.create = async (values) => {
    notifications.push(values);
    return values;
  };
  return notifications;
};

test("a user without push tokens can book (was a 400 before the booking was saved)", async () => {
  models.UserToken.findAll = async () => [];
  const notifications = stubBookingModels();

  const result = await quietly(() => bookingsService.createBooking(...bookingRequest()));

  assert.deepEqual(result, { booking_id: 77 });
  assert.equal(sent.length, 0);
  assert.equal(notifications.length, 1, "the in-app notification is still saved");
  assert.equal(notifications[0].title, "SERVICE BOOKED");
});

test("the booking push carries only the fields FCM accepts", async () => {
  const notifications = stubBookingModels();
  await quietly(() => bookingsService.createBooking(...bookingRequest()));

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].notification, { title: "SERVICE BOOKED", body: "Your Service has been booked successfully" });
  assert.equal(notifications[0].notification_types, "SERVICE BOOKED", "the type stays on the saved notification");
});
