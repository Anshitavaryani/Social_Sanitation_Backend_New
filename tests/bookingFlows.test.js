// Admin booking updates (POST /admin/booking/updateBookingStatus): rejecting, accepting with
// employees and the booking's group chat, recurring series, and edits to a whole series.
// The clock is 2026-10-16, New York; generated ids are numbered.
require("./helpers/env");
const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T14:00:00Z") });
let uuid = 0;
require("crypto").randomUUID = () => `uuid-${++uuid}`;

const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot, mockFirebase, mockModule } = require("./helpers/mocks");

const db = recordingDatabase();
const firebase = mockFirebase();
recordingModule("src/services/Common/email.service.js", db.log, {});
recordingModule("src/config/logger.js", db.log, {});
mockModule("src/config/getCoordinatesFromGoogleMapLink.js", async () => ({ latitude: 27.95, longitude: -82.46 }));
const bookings = loadFromRoot("src/services/Admin/booking.service.js");

const booking = (overrides = {}) => ({
  id: 21,
  user_id: 7,
  address_id: 4,
  bdm_id: 2,
  service_id: 3,
  booking_name: "Office",
  date: "2026-10-20",
  time: "09:00:00",
  time_zone: "America/Chicago",
  recurrence_id: null,
  booking_status: "PENDING",
  type: "One Time",
  ...overrides,
});

beforeEach(() => {
  db.reset();
  uuid = 0;
  firebase.db.writes.length = 0;
  firebase.db.data = {};
  db.respond("Service.findOne", () => ({ id: 3, abbreviation: "OC" }));
});

const updates = () => db.calls("Booking.update").map(([, values, options]) => [values, options.where]);

test("an unknown booking is a 404", async () => {
  await assert.rejects(bookings.updateBookingStatus({ booking_id: 99 }), (err) => err.statusCode === 404 && err.message === "Booking not found");
});

test("rejecting deactivates the booking; a new time is saved with its UTC date and time", async () => {
  db.respond("Booking.findByPk", () => booking());
  const result = await bookings.updateBookingStatus({ booking_id: 21, booking_status: "REJECTED", date: "2026-10-22", time: "10:30", google_map_link: "https://maps.google.com/?q=1,2" });
  assert.deepEqual(result, { success: true, message: "Booking marked as rejected" });
  const [edit, times, reject] = updates();
  assert.deepEqual(edit[1], { id: 21 });
  assert.deepEqual([times[0].date, times[0].time, times[0].date_in_utc, times[0].time_in_utc], ["2026-10-22", "10:30", "2026-10-22", "15:30:00"], "10:30 Chicago");
  assert.deepEqual(reject[0], { booking_status: "REJECTED", is_active: false });
  assert.deepEqual(db.calls("UserAddress.update")[0].slice(1), [{ address_lat: 27.95, address_long: -82.46, google_map_link: "https://maps.google.com/?q=1,2" }, { where: { id: 4 } }]);
});

test("accepting assigns new employees once and builds the booking's group chat", async () => {
  db.respond("Booking.findByPk", () => booking());
  db.respond("BookingAssignment.findAll", () => [{ employee_id: 11, role_id: 9 }]);
  db.respond("Admin.findAll", () => [{ id: 1 }]);
  const result = await bookings.updateBookingStatus({ booking_id: 21, booking_status: "ACCEPTED", cleaners: [11, 12, 12], supervisors: [21], is_recurring: false });
  assert.equal(result.success, true);
  assert.deepEqual(db.calls("BookingAssignment.bulkCreate")[0][1], [
    { booking_id: 21, employee_id: 12, role_id: 9 },
    { booking_id: 21, employee_id: 21, role_id: 7 },
  ]);
  const [created, welcome] = firebase.db.writes;
  assert.deepEqual([created.op, created.path, created.value.name, Object.keys(created.value.members)], ["set", "GroupChats/booking_21", "Office - 2026-10-20", ["employee_11", "employee_12", "employee_21", "admin_1", "bdm_2"]]);
  assert.equal(welcome.value.message, "Welcome to the group for this booking!");
  assert.deepEqual(updates().at(-1)[0].recurrence_id, null, "not recurring: recurrence cleared");
});

test("an existing group chat gains and loses members", async () => {
  db.respond("Booking.findByPk", () => booking({ booking_status: "ACCEPTED" }));
  firebase.db.data = { "GroupChats/booking_21": { members: { employee_12: true, admin_1: true } } };
  await bookings.updateBookingStatus({ booking_id: 21, cleaners: [13], remove_employees: [12], is_recurring: false });
  assert.deepEqual(db.calls("BookingAssignment.destroy")[0][1], { where: { booking_id: 21, employee_id: [12] } });
  assert.deepEqual(firebase.db.writes[0], { op: "update", path: "GroupChats/booking_21", value: { members: { admin_1: true, employee_13: true, bdm_2: true } } });
});

test("accepting without is_recurring saves the assignments but answers success: false", async () => {
  db.respond("Booking.findByPk", () => booking());
  const result = await bookings.updateBookingStatus({ booking_id: 21, booking_status: "ACCEPTED", cleaners: [12] });
  assert.deepEqual(result, { success: false, message: "Invalid 'is_recurring' type" });
  assert.equal(db.calls("BookingAssignment.bulkCreate").length, 1, "the assignment was saved anyway");
});

test("a recurring booking with settings becomes a new series", async () => {
  db.respond("Booking.findByPk", () => booking({ type: "Recurring Booking" }));
  await bookings.updateBookingStatus({
    booking_id: 21,
    booking_status: "ACCEPTED",
    is_recurring: "true",
    recurring_every: 1,
    recurring_type: "week",
    repeat_on_days: ["Tue", "Thu"],
    recurrence_end_type: "after",
    recurrence_end_value: 3,
  });
  const series = updates().find(([values]) => values.recurrence_id);
  assert.deepEqual([series[0].is_recurring, series[0].recurrence_id, series[0].repeat_on_days], [true, "uuid-1", ["Tue", "Thu"]]);
  const created = db.calls("Booking.create").map(([, values]) => [values.date, values.recurrence_id]);
  assert.ok(created.length > 0, "occurrences created");
  assert.ok(created.every(([, recurrence]) => recurrence === "uuid-1"));
});

test("editing one booking of a series as 'following' replaces the later bookings", async () => {
  db.respond("Booking.findByPk", () => booking({ recurrence_id: "r-1", type: "Recurring Booking" }));
  const result = await bookings.updateBookingStatus({
    booking_id: 21,
    edit_mode: "following",
    booking_name: "Renamed",
    recurring_every: 1,
    recurring_type: "week",
    repeat_on_days: ["Mon"],
    recurrence_end_type: "after",
    recurrence_end_value: 2,
  });
  assert.deepEqual(result, { success: true, message: "Recurring series updated (following)" });
  const later = { recurrence_id: "r-1", date: { "Op.gt": "2026-10-20" } };
  assert.deepEqual(db.calls("Booking.destroy")[0][1], { where: later });
  const moved = db.log.find(([n]) => n === "Booking#update")[2];
  assert.deepEqual([moved.booking_name, moved.recurrence_id, moved.parent_id], ["Renamed", "uuid-1", 21]);
});
