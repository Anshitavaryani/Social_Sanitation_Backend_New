// The every-5-minutes attendance jobs: absent alerts per booking and clock-outs far from the
// service address. Same alerts as before, with one attendance query per run instead of one per
// employee per booking.
require("./helpers/env");
const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
mockFirebase();

const emails = [];
mockModule("src/services/Common/email.service.js", {
  sendEmailToAdmin: async () => true,
  sendClockOutDistanceEmail: async (mail) => emails.push(["distance", mail]),
  sendGroupedAttendanceEmail: async (mail) => emails.push(["absent", mail]),
  sendTwoWeekScheduleEmail: async () => true,
});
const bookingService = loadFromRoot("src/services/Admin/booking.service.js");

afterEach(() => mock.timers.reset());

// Attendance rows the fake database holds; answers findOne (the old per-employee lookup) and findAll
let attendance = [];
const queries = { findOne: 0, findAll: 0, users: 0 };
const matches = (row, where) =>
  Object.entries(where).every(([key, condition]) => {
    if (key === "user_id") return Array.isArray(condition) ? condition.includes(row.user_id) : row.user_id === condition;
    const value = row[key];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if (Op.between in condition) return value >= condition[Op.between][0] && value <= condition[Op.between][1];
      if (Op.ne in condition) return value !== condition[Op.ne];
      if (Op.gte in condition) return value >= condition[Op.gte] && (!(Op.lt in condition) || value < condition[Op.lt]);
    }
    return value === condition;
  });
models.Attendance.findOne = async ({ where }) => {
  queries.findOne += 1;
  return attendance.find((row) => matches(row, where)) || null;
};
models.Attendance.findAll = async ({ where }) => {
  queries.findAll += 1;
  return attendance.filter((row) => matches(row, where)).sort((a, b) => a.id - b.id);
};
const names = { 1: "Ana", 2: "Ben", 3: "Cy" };
models.User.findByPk = async (id) => {
  queries.users += 1;
  return { id, user_profile: { name: names[id] } };
};
models.User.findAll = async ({ where }) => {
  queries.users += 1;
  return where.id.map((id) => ({ id, user_profile: { name: names[id] } }));
};

const reset = () => {
  emails.length = 0;
  Object.assign(queries, { findOne: 0, findAll: 0, users: 0 });
};

// 13:00 in New York (17:00 UTC)
const freezeAt1pm = () => mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-16T17:00:00Z") });
const wall = (hhmm) => new Date(`2026-10-16T${hhmm}:00Z`); // *_est columns: New York wall time in UTC fields

const runAlerts = async () => {
  const updated = [];
  const booking = (id, time, employeeIds) => ({
    id,
    time,
    absent_alert_sent: false,
    booking_address: { address: `${id} Main St` },
    booking_employee_details: employeeIds.map((employee_id) => ({ employee_id, role_id: 9 })),
    update: async (values) => updated.push([id, values]),
  });
  models.Booking.findAll = async () => [booking(71, "09:00:00", [1, 2, 3]), booking(72, "12:30:00", [1, 3])];
  // Ana never clocked in, Ben at 10:30 (late), Cy at 08:55 (on time)
  attendance = [
    { id: 5, user_id: 2, clock_in_est: wall("10:30") },
    { id: 6, user_id: 3, clock_in_est: wall("08:55") },
  ];
  reset();
  freezeAt1pm();
  await bookingService.sendAttendanceAlerts();
  return updated;
};

test("absent alerts go out per booking for employees still not clocked in two hours after the start", async () => {
  const updated = await runAlerts();
  // booking 71 started at 09:00: Ana is absent (Ben is late, Cy on time); booking 72 started at 12:30: nobody is absent yet
  assert.deepEqual(
    emails.map(([kind, mail]) => [kind, mail.booking.id, mail.employees.map((e) => [e.name, e.status])]),
    [["absent", 71, [["Ana", "ABSENT"]]]],
  );
  assert.deepEqual(updated, [[71, { absent_alert_sent: true }]]);
});

test("the absent alerts read attendance and names once per run", async () => {
  await runAlerts();
  assert.deepEqual(queries, { findOne: 0, findAll: 1, users: 1 });
});

const runDistanceCheck = async () => {
  const alerted = [];
  const assignment = (id, lat, lng) => ({
    role_id: 9,
    employee_profile: { id, email: `${names[id].toLowerCase()}@example.com`, user_profile: { name: names[id] } },
    update: async (values) => alerted.push([id, values]),
    lat,
    lng,
  });
  models.Booking.findAll = async () => [
    { id: 81, booking_address: { address_lat: "27.9506", address_long: "-82.4572" }, booking_employee_details: [assignment(1), assignment(2)] },
  ];
  attendance = [
    { id: 9, user_id: 1, clock_in: new Date("2026-10-16T13:00:00Z"), clock_out: new Date("2026-10-16T16:00:00Z"), clock_out_lat: "27.9510", clock_out_lng: "-82.4570" },
    { id: 10, user_id: 2, clock_in: new Date("2026-10-16T13:05:00Z"), clock_out: new Date("2026-10-16T16:10:00Z"), clock_out_lat: "28.0500", clock_out_lng: "-82.4572" },
  ];
  reset();
  freezeAt1pm();
  await bookingService.notifyAdminIfClockoutFar();
  return alerted;
};

test("a clock-out more than 0.5 km from the service address alerts the admin once", async () => {
  const alerted = await runDistanceCheck();
  assert.deepEqual(
    emails.map(([kind, mail]) => [kind, mail.employee.name, mail.employee.distance]),
    [["distance", "Ben", "11.05"]],
  );
  assert.deepEqual(alerted, [[2, { clock_out_alert_sent: true }]]);
});

test("the clock-out distance check reads attendance once per run", async () => {
  await runDistanceCheck();
  assert.deepEqual([queries.findOne, queries.findAll], [0, 1]);
});

test("the employee day overview reads attendance and payroll once each, not per employee", async () => {
  models.User.findAll = async () => [1, 2, 3].map((id) => ({ id, role_id: 9, employee_type: "full_time", user_profile: { name: names[id] } }));
  models.Booking.findAll = async () => [{ id: 71, booking_employee_details: [{ employee_id: 1 }, { employee_id: 2 }] }];
  attendance = [
    { id: 7, user_id: 1, clock_in_est: wall("08:55"), clock_out_est: wall("16:00"), total_hours: 7.08 },
    { id: 8, user_id: 2, clock_in_est: wall("10:30"), clock_out_est: null, total_hours: null },
  ];
  let payrollQueries = 0;
  const payroll = { id: 1, attendance_id: 7, pay_per_day: 120, bonus: 10, total_amount: 130, is_manual: true };
  models.AttendancePayroll.findAll = async ({ where }) => {
    payrollQueries += 1;
    return where.attendance_id.includes(7) ? [payroll] : [];
  };
  models.AttendancePayroll.findOne = async ({ where }) => {
    payrollQueries += 1;
    return where.attendance_id === 7 ? payroll : null;
  };
  reset();
  const { employees } = await bookingService.getEmployeeDayOverview({ date: "2026-10-16" });
  assert.deepEqual(
    employees.map((e) => [e.name, e.booking_id, e.clock_in, e.clock_out, e.total_amount, e.is_manual]),
    [
      ["Ana", 71, "08:55:00", "16:00:00", 130, true],
      ["Ben", 71, "10:30:00", null, null, false],
      ["Cy", null, null, null, null, false],
    ],
  );
  assert.deepEqual([queries.findOne, queries.findAll, payrollQueries], [0, 1, 1]);
});

test("the closest employees list reads every employee's address in one query", async () => {
  const userService = loadFromRoot("src/services/Admin/user.service.js");
  models.User.findByPk = async (id) => ({ id, user_profile: { name: "Client Co" } });
  const client = { address: "Tampa", address_lat: "27.9506", address_long: "-82.4572" };
  const rows = [
    { id: 1, user_id: 1, address: "Orlando", address_lat: "28.5383", address_long: "-81.3792" },
    { id: 2, user_id: 2, address: "Clearwater", address_lat: "27.9659", address_long: "-82.8001" },
    { id: 3, user_id: 2, address: "Miami", address_lat: "25.7617", address_long: "-80.1918" },
  ];
  let addressQueries = 0;
  // the client's address, or one employee's first address (the old per-employee lookup)
  models.UserAddress.findOne = async ({ where }) => {
    if (where.user_id === 40) return client;
    addressQueries += 1;
    return rows.find((row) => row.user_id === where.user_id) || null;
  };
  models.User.findAll = async () => [1, 2, 3].map((id) => ({ id, role_id: 9, user_profile: { name: names[id] } }));
  models.UserAddress.findAll = async ({ where, order }) => {
    addressQueries += 1;
    assert.deepEqual(order, [["created_at", "ASC"], ["id", "ASC"]], "each employee's first address, as before");
    return rows.filter((row) => where.user_id.includes(row.user_id));
  };
  const { employees } = await userService.getClosestEmployees(40);
  assert.deepEqual(employees.map((e) => [e.employee_name ?? e.name, e.address]), [
    ["Ben", "Clearwater"],
    ["Ana", "Orlando"],
  ]);
  assert.equal(addressQueries, 1);
});
