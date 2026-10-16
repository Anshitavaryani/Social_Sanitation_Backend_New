// "Today", "this week" and lateness at the edges of the New York day.
// The clock is frozen with mock.timers; 21:30 ET is 01:30 UTC the next day, which is
// exactly when the old UTC-based code jumped to tomorrow.
require("./helpers/env");
const { test, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models, sequelize } = mockDatabase();
mockFirebase();

const realEmailService = loadFromRoot("src/services/Common/email.service.js");
mockModule("src/services/Common/email.service.js", {
  ...realEmailService,
  sendEmailToAdmin: async () => true,
});

const adminBookingService = loadFromRoot("src/services/Admin/booking.service.js");
const bookingsService = loadFromRoot("src/services/Common/bookings.service.js");
const dailyChecklistService = loadFromRoot("src/services/Common/dailyChecklist.service.js");
const attendanceService = loadFromRoot("src/services/Common/attendance.service.js");
const invoiceService = loadFromRoot("src/services/Common/invoice.service.js");
const equipmentService = loadFromRoot("src/services/Common/equipment.service.js");
const authService = loadFromRoot("src/services/User/auth.service.js");
const paymentController = loadFromRoot("src/controllers/Common/payment.controller.js");

// attendance.service imports this model file directly rather than through src/models
const AttendanceModel = loadFromRoot("src/models/attendance.model.js");

const iso = (d) => new Date(d).toISOString();
const freeze = (instant) => mock.timers.enable({ apis: ["Date"], now: new Date(instant) });
const quietly = async (fn) => {
  const { log, warn, error } = console;
  console.log = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, warn, error });
  }
};

afterEach(() => mock.timers.reset());

const EVENING_ET = "2026-10-16T01:30:00Z"; // Thu 15 Oct 2026, 21:30 New York

test("admin booking list 'today' is the New York date at 21:30 ET", async () => {
  freeze(EVENING_ET);
  let where;
  models.Booking.findAndCountAll = async (query) => {
    where = query.where;
    return { count: 0, rows: [] };
  };
  await adminBookingService.getAllBookings({ booking_status: "UPCOMING", period: "today" });
  assert.equal(iso(where.date[Op.gte]), "2026-10-15T00:00:00.000Z");
  assert.equal(iso(where.date[Op.lt]), "2026-10-16T00:00:00.000Z");
});

test("admin booking list 'current_week' runs to the New York Sunday, also on a Sunday evening", async () => {
  freeze("2026-10-19T01:30:00Z"); // Sun 18 Oct, 21:30 ET (UTC is already Monday)
  let where;
  models.Booking.findAndCountAll = async (query) => {
    where = query.where;
    return { count: 0, rows: [] };
  };
  await adminBookingService.getAllBookings({ booking_status: "UPCOMING", period: "current_week" });
  assert.equal(iso(where.date[Op.gte]), "2026-10-18T00:00:00.000Z");
  assert.equal(iso(where.date[Op.lt]), "2026-10-18T23:59:59.999Z");
});

test("an employee's 'today' bookings use the New York date at 21:30 ET", async () => {
  freeze(EVENING_ET);
  let where;
  models.Booking.findAndCountAll = async (query) => {
    where = query.where;
    return { count: 0, rows: [] };
  };
  await quietly(() => bookingsService.getTodaysBooking({ user: { id: 9 } }));
  assert.deepEqual(where.date[Op.between], ["2026-10-15", "2026-10-15"]);
});

test("payments 'today' count and total cover the New York day", async () => {
  freeze(EVENING_ET);
  const ranges = [];
  models.Payment.findAll = async ({ where }) => {
    ranges.push(where.created_at[Op.between].map(iso));
    return [{ id: 1, amount: 40 }, { id: 2, amount: 60 }];
  };
  const count = await runHandler(paymentController.getNewPaymentCount, { body: {} });
  const total = await runHandler(paymentController.getNewPaymentTotal, { body: {} });
  assert.equal(count.res.body.data, 2);
  assert.equal(total.res.body.data, 100);
  for (const range of ranges) {
    assert.deepEqual(range, ["2026-10-15T04:00:00.000Z", "2026-10-16T03:59:59.999Z"]);
  }
});

test("ticking a daily checklist item at 21:30 ET finds the entry made earlier that New York day", async () => {
  freeze(EVENING_ET);
  let where;
  models.DailyChecklist.findByPk = async () => ({ id: 3 });
  models.DailySupervisorChecklist.findOne = async (query) => {
    where = query.where;
    return { is_completed: true, async save() {} };
  };
  await dailyChecklistService.markDailyChecklistItemAsCompleted({ user: { id: 9 } }, 3);
  assert.equal(iso(where.created_at[Op.gte]), "2026-10-15T04:00:00.000Z");
});

test("the weekly checklist on a Sunday shows the week that started the Monday before", async () => {
  freeze("2026-10-18T16:00:00Z"); // Sun 18 Oct, noon ET
  let createdAt;
  models.User.findByPk = async () => ({ id: 9, sub_role_id: 2 });
  models.DailyChecklistHeading.findAll = async (query) => {
    createdAt = query.include[0].include[0].where.created_at[Op.between];
    return [];
  };
  const result = await dailyChecklistService.getWeeklyChecklistWithStatus({ user_id: 9 });
  assert.deepEqual(createdAt.map(iso), ["2026-10-12T04:00:00.000Z", "2026-10-19T04:00:00.000Z"]);
  assert.deepEqual(Object.keys(result.data), [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
  ]);
});

test("employee attendance THIS_WEEK on a Sunday covers Monday to that Sunday, and leave lands on its own day", async () => {
  freeze("2026-10-18T16:00:00Z"); // Sun 18 Oct
  const queries = [];
  AttendanceModel.findAll = async (query) => {
    queries.push(query.where);
    if (query.where.is_on_leave) {
      // leave_date is stored as the calendar date at UTC midnight
      return [{ leave_date: new Date("2026-10-14T00:00:00Z"), leave_reason: "Doctor" }];
    }
    return [{ clock_in: new Date("2026-10-13T13:05:00Z"), clock_in_est: "2026-10-13 09:05:00", total_hours: "8" }];
  };

  const days = await attendanceService.getAttendanceByUserId({ filterType: "THIS_WEEK" }, 9);

  assert.deepEqual(days.map((d) => d.date), [
    "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18",
  ]);
  assert.deepEqual(queries[0].created_at[Op.between].map(iso), ["2026-10-12T04:00:00.000Z", "2026-10-19T03:59:59.999Z"]);
  const byDate = Object.fromEntries(days.map((d) => [d.date, d.status]));
  assert.equal(byDate["2026-10-13"], "PRESENT");
  assert.equal(byDate["2026-10-14"], "ON LEAVE", "leave used to show on the 13th");
  assert.equal(byDate["2026-10-13"] === "ON LEAVE", false);
});

test("admin monthly attendance shows leave on the leave date and marks only future days as '--'", async () => {
  freeze(EVENING_ET);
  models.User.findAll = async () => [{ id: 9, role_id: 7, user_profile: { name: "Ana" } }];
  AttendanceModel.findAll = async () => [
    { user_id: 9, is_on_leave: true, leave_status: "APPROVED", leave_date: new Date("2026-10-14T00:00:00Z"), leave_date_est: "2026-10-13 20:00:00", clock_in_est: null },
  ];
  const [row] = await attendanceService.getAllAttendance({ month: 10, year: 2026 });
  const status = Object.fromEntries(row.monthly_attendance.map((d) => [d.date, d.status]));
  assert.equal(status["2026-10-14"], "ON LEAVE");
  assert.equal(status["2026-10-13"], "ABSENT");
  assert.equal(status["2026-10-15"], "ABSENT", "today (New York) is not a future day");
  assert.equal(status["2026-10-16"], "--");
});

test("attendance status compares 'now' in New York time: 30 minutes after start is still PENDING", async () => {
  freeze("2026-10-15T13:30:00Z"); // 09:30 ET; booking at 09:00 ET
  models.User.findAll = async () => [{ id: 9, role_id: 7, user_profile: { name: "Ana" } }];
  AttendanceModel.findAll = async () => [];
  models.BookingAssignment.findOne = async () => ({ employee_details_booking: { id: 1, time: "09:00:00", date: "2026-10-15" } });
  const [row] = await attendanceService.getAllAttendance({ date: "2026-10-15" });
  // the old code compared with the UTC clock (13:30) and reported ABSENT here
  assert.equal(row.status, "PENDING", JSON.stringify(row));
});

test("today's attendance counts use the New York day for clock-ins and the calendar date for leave", async () => {
  freeze(EVENING_ET);
  const wheres = [];
  models.User.findAll = async () => [{ id: 9 }];
  AttendanceModel.findAll = async ({ where }) => {
    wheres.push(where);
    return [];
  };
  await attendanceService.getTodayAttendanceStats({});
  const [present, leave] = wheres;
  assert.deepEqual(present.created_at[Op.between].map(iso), ["2026-10-15T04:00:00.000Z", "2026-10-16T03:59:59.999Z"]);
  assert.equal(iso(leave.leave_date[Op.gte]), "2026-10-15T00:00:00.000Z");
  assert.equal(iso(leave.leave_date[Op.lt]), "2026-10-16T00:00:00.000Z");
});

test("applying for leave stores leave_date_est as New York midnight of that day", async () => {
  let rows;
  AttendanceModel.findAll = async () => [];
  AttendanceModel.bulkCreate = async (r) => {
    rows = r;
    return r;
  };
  await quietly(() =>
    attendanceService.applyForLeave(
      { user: { id: 9 }, leave_reason: "Trip", start_date: "2026-10-20", end_date: "2026-10-21" },
      { role_id: 7 },
    ),
  );
  assert.deepEqual(rows.map((r) => r.leave_date_est), ["2026-10-20 00:00:00", "2026-10-21 00:00:00"]);
});

test("breaks are listed on the New York day of the clock-in, including after midnight", async () => {
  models.User.findAll = async () => [{ id: 9, role_id: 7, email: "a@b.c", user_profile: { name: "Ana" } }];
  models.Break.findAll = async () => [
    // clock_in_est is naive New York wall time: 00:30 on the 15th
    { user_id: 9, break_start_est: new Date("2026-10-15T00:40:00Z"), attendence_break: { clock_in_est: new Date("2026-10-15T00:30:00Z") } },
  ];
  const [onThe15th] = await attendanceService.getAllBreaks({ date: "2026-10-15" });
  assert.equal(onThe15th.break_count, 1, "the 00:30 clock-in counts for the 15th");
  const [onThe14th] = await attendanceService.getAllBreaks({ date: "2026-10-14" });
  assert.equal(onThe14th.break_count, 0, "it used to land on the 14th");
});

test("manual overnight shift: clock-out moves to the next New York day, across DST too", async () => {
  let created;
  AttendanceModel.findOne = async () => null;
  AttendanceModel.create = async (values) => {
    created = values;
    return values;
  };
  await quietly(() =>
    attendanceService.manualClockInOut({ employee_id: 9, date: "2026-10-31", clock_in: "22:00", clock_out: "06:00" }),
  );
  assert.equal(iso(created.clock_in), "2026-11-01T02:00:00.000Z"); // 22:00 EDT
  assert.equal(iso(created.clock_out), "2026-11-01T11:00:00.000Z"); // 06:00 EST after the change
  assert.equal(created.clock_out_est, "2026-11-01 06:00:00");
});

test("invoices due today are not overdue at 21:30 ET", async () => {
  freeze(EVENING_ET);
  models.Invoice.findAll = async () => [
    { total_due: 100, payment_status: "PENDING", due_date: "2026-10-15", billing_date: "2026-10-01", user_id: 1 },
    { total_due: 50, payment_status: "PENDING", due_date: "2026-10-14", billing_date: "2026-10-01", user_id: 1 },
  ];
  models.ServiceQuote.findAll = async () => [];
  const { data } = await invoiceService.getBusinessAnalytics({ month: "2026-10" });
  assert.equal(data.overview.overdue_invoices, 1);
  assert.equal(data.overview.overdue_revenue, 50);
});

test("upcoming invoices start from today's New York date", async () => {
  freeze(EVENING_ET);
  let where;
  models.Invoice.findAll = async (query) => {
    where = query.where;
    return [];
  };
  await invoiceService.getUpcomingInvoices();
  assert.equal(where.billing_date[Op.gte], "2026-10-15");
});

test("balance emails go out on the balance due date itself (they used to wait a day)", async () => {
  freeze("2026-10-15T14:00:00Z"); // 10:00 ET
  let rechecks = 0;
  const eligible = {
    id: 5,
    is_active: true,
    status: "ACTIVE",
    deposit_required: true,
    payment_stage: "DEPOSIT_PAID",
    balance_sent_at: null,
    balance_due_date: "2026-10-15",
  };
  models.Invoice.findAll = async () => [eligible];
  models.Invoice.findByPk = async () => {
    rechecks++;
    return rechecks === 1 ? eligible : null; // second lookup is inside sendInvoiceBalance
  };
  await quietly(() => invoiceService.sendDueBalancesCron());
  assert.equal(rechecks, 2, "sendInvoiceBalance was reached for a balance due today");
});

test("balance emails are not sent before 9:00 AM New York", async () => {
  freeze("2026-10-15T12:30:00Z"); // 08:30 ET
  let queried = false;
  models.Invoice.findAll = async () => {
    queried = true;
    return [];
  };
  await quietly(() => invoiceService.sendDueBalancesCron());
  assert.equal(queried, false);
});

test("equipment monthly records use New York month boundaries", async () => {
  // Sequelize operators are symbol keys, so walk them explicitly to collect the Date bounds
  const datesIn = (value, found = []) => {
    if (value instanceof Date) found.push(value.toISOString());
    else if (value && typeof value === "object") {
      for (const key of Reflect.ownKeys(value)) datesIn(value[key], found);
    }
    return found;
  };
  let dates = [];
  models.User.findAndCountAll = async (query) => {
    dates = datesIn(query.include);
    return { count: 0, rows: [] };
  };
  const result = await quietly(() =>
    equipmentService.getMonthlyEmployeeEquipmentRecords({ month: "2026-10", page: 1, limit: 10 }),
  );
  assert.ok(dates.includes("2026-10-01T04:00:00.000Z"), `starts at New York midnight on the 1st: ${dates}`);
  assert.ok(dates.includes("2026-11-01T03:59:59.999Z"), `ends just before New York midnight on Nov 1: ${dates}`);
  assert.deepEqual(result.month, { value: "2026-10", label: "October 2026", start_date: "2026-10-01", end_date: "2026-10-31" });
});

test("login stores the local time in 24-hour form and survives an unknown timezone header", async () => {
  freeze(EVENING_ET);
  const password = await bcrypt.hash("Secret#1", 4);
  models.User.findOne = async () => ({ id: 9, role_id: 6, email: "a@b.c", password, user_profile: { name: "Ana" } });
  models.UserOAuth.findOne = async () => null;
  sequelize.query = async () => [1, 1];
  const timings = [];
  models.userLoginTiming.create = async (row) => timings.push(row);
  models.Timezone.findOne = async ({ where }) => (where.time_zone === "America/New_York" ? { id: 4 } : null);

  await authService.login({ email: "a@b.c", password: "Secret#1" }, { role_id: "6", timezone: "America/New_York" });
  assert.equal(timings[0].login_time_local, "2026-10-15 21:30:00", "was '09:30:00' with the 12-hour format");
  assert.equal(timings[0].time_zone, 4);

  const user = await quietly(() => authService.login({ email: "a@b.c", password: "Secret#1" }, { role_id: "6", timezone: "Not/AZone" }));
  assert.equal(user.email, "a@b.c", "login succeeds even though the timing row is skipped");
  assert.equal(timings.length, 1);
});

test("logout stores the local time as New York wall-clock text", async () => {
  freeze(EVENING_ET);
  const timing = { async save() {} };
  models.userLoginTiming.findOne = async () => timing;
  await authService.logout({ tokenDoc: { id: 1, destroy: async () => 1 } }, { timezone: "America/New_York" });
  assert.equal(timing.logout_time_local, "2026-10-15 21:30:00");
  assert.equal(iso(timing.logout_time_utc), "2026-10-16T01:30:00.000Z");
});

test("updating a booking computes its UTC date/time from the stored Date", async () => {
  // bookings.date comes back from MySQL as a Date at UTC midnight
  const bookingDoc = {
    id: 7,
    date: new Date("2026-10-15T00:00:00Z"),
    time: "09:00:00",
    time_zone: "America/New_York",
    toJSON() {
      return { ...this };
    },
  };
  models.Booking.findByPk = async () => bookingDoc;
  let payload;
  models.Booking.update = async (values) => {
    payload = values;
    return [1];
  };
  await quietly(() => adminBookingService.updateBookingStatus({ booking_id: 7, booking_status: "ACCEPTED" }));
  assert.equal(payload.date_in_utc, "2026-10-15");
  assert.equal(payload.time_in_utc, "13:00:00");
});

test("editing 'following' bookings of a series computes UTC parts from the stored Date (used to be garbage)", async () => {
  const updates = [];
  const bookingDoc = {
    id: 7,
    recurrence_id: "series-1",
    date: new Date("2026-12-15T00:00:00Z"),
    time: "09:00:00",
    time_zone: "America/New_York",
    toJSON() {
      return { ...this };
    },
    async update(values) {
      updates.push(values);
      // like Sequelize's instance.update, undefined values are ignored
      for (const [key, value] of Object.entries(values)) if (value !== undefined) this[key] = value;
    },
  };
  models.Booking.findByPk = async () => bookingDoc;
  models.Booking.destroy = async () => 0;
  try {
    await quietly(() =>
      adminBookingService.updateBookingStatus({ booking_id: 7, booking_status: "ACCEPTED", edit_mode: "following" }),
    );
  } catch {
    // regenerating the series needs more data than this test provides; the UTC parts come first
  }
  const parts = updates.find((u) => "date_in_utc" in u);
  assert.ok(parts, "the edit flow computed UTC parts");
  assert.equal(parts.date_in_utc, "2026-12-15");
  assert.equal(parts.time_in_utc, "14:00:00"); // 09:00 EST
});

test("clock-in finds the day's booking in the booking's own time zone (only New York bookings were looked at)", async () => {
  // a Los Angeles booking at 21:30 on 16 Oct is 04:30 UTC on 17 Oct, already 17 Oct in New York
  const losAngeles = { id: 21, time_zone: "America/Los_Angeles", date_in_utc: new Date("2026-10-17T00:00:00Z"), time_in_utc: "04:30:00" };
  const newYork = { id: 22, time_zone: "America/New_York", date_in_utc: new Date("2026-10-16T00:00:00Z"), time_in_utc: "13:00:00" };
  let query;
  const clockInWith = async (bookings, clock_in_time) => {
    models.Booking.findAll = async (q) => (query = q) && bookings;
    AttendanceModel.findOne = async () => ({ id: 1 }); // already clocked in: reached only when a booking matched
    return quietly(() => attendanceService.clockIn({ user: { id: 9 }, clock_in_time }, { role_id: "9" }, {})).catch((err) => err.message);
  };
  const matched = "Already clocked in. Please clock out before clocking in again.";
  const noTask = "You do not have any assigned task for today.";

  // 20:50 in Los Angeles on 16 Oct, still 16 Oct in New York (23:50): compared in New York, the dates differed
  assert.equal(await clockInWith([losAngeles], "2026-10-16 23:50:00"), matched);
  assert.equal(await clockInWith([losAngeles], "2026-10-17 23:50:00"), noTask, "the next day in Los Angeles");
  assert.equal(await clockInWith([newYork], "2026-10-16 08:55:00"), matched, "New York bookings as before");
  assert.equal(await clockInWith([newYork], "2026-10-17 08:55:00"), noTask);

  // only bookings within a day of the clock-in are loaded, in any time zone
  assert.equal(query.where.time_zone, undefined);
  const [from, to] = query.where.date_in_utc[Op.between];
  assert.deepEqual([iso(from), iso(to)], ["2026-10-16T00:00:00.000Z", "2026-10-18T00:00:00.000Z"]);
});
