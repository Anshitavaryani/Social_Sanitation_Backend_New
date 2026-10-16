// One attendance rule for every screen: late after 60 minutes, absent after 120 with no clock-in,
// and a clock-in is never absent however late (D3: the admin late/absent list used to say ABSENT).
require("./helpers/env");
const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
const { attendanceStatus } = loadFromRoot("src/utils/attendanceStatus.js");

afterEach(() => mock.timers.reset());

// New York wall time held in UTC fields, as bookings.time and clock_in_est are stored
const at = (hhmm) => new Date(`2026-10-16T${hhmm}:00Z`);
const start = at("09:00");

test("without a clock-in: PENDING, then LATE after 60 minutes, then ABSENT after 120", () => {
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: null, now: at("09:59") }), "PENDING");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: null, now: at("10:00") }), "PENDING", "the threshold itself is not late yet");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: null, now: at("10:01") }), "LATE");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: null, now: at("11:01") }), "ABSENT");
});

test("with a clock-in: PRESENT within 60 minutes, LATE after, and still LATE after 120 minutes", () => {
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: at("08:55"), now: at("15:00") }), "PRESENT");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: at("10:00"), now: at("15:00") }), "PRESENT");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: at("10:30"), now: at("15:00") }), "LATE");
  assert.equal(attendanceStatus({ bookingStart: start, clockIn: at("11:30"), now: at("15:00") }), "LATE", "came 2.5 hours late: LATE, not ABSENT");
});

test("the admin late/absent list marks a clock-in more than 2 hours late as LATE", async () => {
  // 12:00 in New York (16:00 UTC, daylight time)
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T16:00:00Z") });
  const clockIns = { 1: at("11:30"), 3: at("09:45"), 4: at("10:30") }; // employee 2 never clocked in
  models.Booking.findAll = async () => [
    {
      id: 7,
      booking_name: "Office cleaning",
      time: "09:00:00",
      booking_employee_details: [1, 2, 3, 4].map((employee_id) => ({ employee_id })),
    },
  ];
  // one query for every employee's attendance and one for the names (it was one each per employee)
  models.Attendance.findAll = async ({ where }) =>
    where.user_id.filter((id) => clockIns[id]).map((id, index) => ({ id: index + 1, user_id: id, clock_in_est: clockIns[id] }));
  models.User.findAll = async ({ where }) => where.id.map((id) => ({ id, user_profile: { name: `Employee ${id}` } }));

  const userService = loadFromRoot("src/services/Admin/user.service.js");
  const response = await userService.getLateAbsentEmployees({});
  const rows = (Array.isArray(response) ? response : response.data || response.employees || []).map((r) => [r.employee_id, r.status, r.delay_minutes]);

  assert.deepEqual(rows.sort((a, b) => a[0] - b[0]), [
    [1, "LATE", 150], // was ABSENT
    [2, "ABSENT", 180],
    [4, "LATE", 90],
  ]);
});
