// src/utils/time.js at the edges: late evening ET, midnight, both DST changes, other zones.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadFromRoot } = require("./helpers/mocks");

const time = loadFromRoot("src/utils/time.js");

const iso = (d) => new Date(d).toISOString();

test("the process runs in UTC (index.js sets TZ from DEFAULT_TIMEZONE)", () => {
  // Tests run with the same assumption as the server
  assert.equal(new Date("2026-10-15T00:00:00").toISOString(), "2026-10-15T00:00:00.000Z");
});

test("23:30 ET is still 'today' in New York even though UTC is already tomorrow", () => {
  const instant = "2026-10-16T03:30:00Z"; // 23:30 EDT on Oct 15
  assert.equal(time.dateInTz(instant), "2026-10-15");
  assert.equal(time.dateInTz(instant, "UTC"), "2026-10-16");
});

test("00:30 ET belongs to the new day", () => {
  assert.equal(time.dateInTz("2026-10-16T04:30:00Z"), "2026-10-16");
});

test("day bounds of an ordinary EDT day are 04:00Z to 03:59:59.999Z", () => {
  const { start, end } = time.dayBoundsUtc("2026-10-15");
  assert.equal(iso(start), "2026-10-15T04:00:00.000Z");
  assert.equal(iso(end), "2026-10-16T03:59:59.999Z");
});

test("day bounds of an ordinary EST day are 05:00Z to 04:59:59.999Z", () => {
  const { start, end } = time.dayBoundsUtc("2026-12-15");
  assert.equal(iso(start), "2026-12-15T05:00:00.000Z");
  assert.equal(iso(end), "2026-12-16T04:59:59.999Z");
});

test("DST start (8 Mar 2026) is a 23-hour day", () => {
  const { start, end } = time.dayBoundsUtc("2026-03-08");
  assert.equal(iso(start), "2026-03-08T05:00:00.000Z"); // midnight EST
  assert.equal(iso(end), "2026-03-09T03:59:59.999Z"); // just before midnight EDT
  assert.equal((end - start + 1) / 3600000, 23);
});

test("DST end (1 Nov 2026) is a 25-hour day", () => {
  const { start, end } = time.dayBoundsUtc("2026-11-01");
  assert.equal(iso(start), "2026-11-01T04:00:00.000Z"); // midnight EDT
  assert.equal(iso(end), "2026-11-02T04:59:59.999Z"); // just before midnight EST
  assert.equal((end - start + 1) / 3600000, 25);
});

test("wall-clock times convert to the right UTC instant on both sides of DST", () => {
  assert.equal(time.zonedTimeToUtc("2026-03-07", "09:00:00").toISOString(), "2026-03-07T14:00:00.000Z");
  assert.equal(time.zonedTimeToUtc("2026-03-09", "09:00:00").toISOString(), "2026-03-09T13:00:00.000Z");
  assert.equal(time.zonedTimeToUtc("2026-11-02", "09:00:00").toISOString(), "2026-11-02T14:00:00.000Z");
  // Bookings in other zones keep their own offset
  assert.equal(
    time.zonedTimeToUtc("2026-10-15", "09:00:00", "America/Los_Angeles").toISOString(),
    "2026-10-15T16:00:00.000Z",
  );
});

test("a time inside the skipped DST hour resolves to a real instant", () => {
  // 02:30 on 8 Mar 2026 does not exist in New York; it must not be invalid
  const instant = time.zonedTimeToUtc("2026-03-08", "02:30:00");
  assert.equal(instant.isValid(), true);
  assert.ok(["2026-03-08T06:30:00.000Z", "2026-03-08T07:30:00.000Z"].includes(instant.toISOString()));
});

test("invalid dates and zones are reported, not silently accepted", () => {
  assert.equal(time.zonedTimeToUtc("not-a-date", "09:00:00").isValid(), false);
  assert.equal(time.isValidTimeZone("America/New_York"), true);
  assert.equal(time.isValidTimeZone("Mars/Olympus"), false);
  assert.equal(time.isValidTimeZone(undefined), false);
  assert.equal(time.isValidTimeZone(""), false);
});

test("calendar helpers", () => {
  assert.equal(time.addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(time.addDays("2026-03-08", 1), "2026-03-09");
  // isoWeekStart is Monday, including when the date itself is a Sunday
  assert.equal(time.isoWeekStart("2026-10-18"), "2026-10-12"); // Sunday
  assert.equal(time.isoWeekStart("2026-10-12"), "2026-10-12"); // Monday
  assert.equal(time.isoWeekStart("2026-10-16"), "2026-10-12"); // Friday
});

test("inZone matches moment.tz: wall-clock strings vs instants", () => {
  const Z = "America/New_York";
  // offset-less strings are New York wall time
  assert.equal(time.inZone("2026-10-15", Z).toISOString(), "2026-10-15T04:00:00.000Z");
  assert.equal(time.inZone("2026-10-15 23:30:00", Z).toISOString(), "2026-10-16T03:30:00.000Z");
  assert.equal(time.inZone("2026-10-15T23:30:00", Z).toISOString(), "2026-10-16T03:30:00.000Z");
  // instants keep their moment in time
  for (const instant of ["2026-10-16T03:30:00Z", "2026-10-16T03:30:00.000Z", "2026-10-15T23:30:00-04:00", "2026-10-15 23:30:00-0400", new Date("2026-10-16T03:30:00Z"), Date.parse("2026-10-16T03:30:00Z")]) {
    const zoned = time.inZone(instant, Z);
    assert.equal(zoned.toISOString(), "2026-10-16T03:30:00.000Z", String(instant));
    assert.equal(zoned.format("YYYY-MM-DD HH:mm"), "2026-10-15 23:30", String(instant));
  }
  // explicit parse format
  assert.equal(time.inZone("10/15/2026 09:00", Z, "MM/DD/YYYY HH:mm").toISOString(), "2026-10-15T13:00:00.000Z");
});

test("inZone falls back to BUSINESS_TZ for unknown or missing zones instead of throwing", () => {
  for (const zone of ["Bad/Zone", "", null, undefined]) {
    assert.equal(time.inZone("2026-10-15 09:00:00", zone).toISOString(), "2026-10-15T13:00:00.000Z", String(zone));
  }
  assert.equal(time.resolveTimeZone("America/Chicago"), "America/Chicago");
  assert.equal(time.resolveTimeZone("nope"), "America/New_York");
});

test("inZone keeps invalid input invalid", () => {
  assert.equal(time.inZone(null).isValid(), false);
  assert.equal(time.inZone("garbage").isValid(), false);
});

test("month bounds follow New York midnight, including a DST month", () => {
  const oct = time.monthBoundsUtc("2026-10");
  assert.equal(iso(oct.start), "2026-10-01T04:00:00.000Z");
  assert.equal(iso(oct.end), "2026-11-01T03:59:59.999Z");
  const nov = time.monthBoundsUtc("2026-11"); // DST ends on Nov 1
  assert.equal(iso(nov.start), "2026-11-01T04:00:00.000Z");
  assert.equal(iso(nov.end), "2026-12-01T04:59:59.999Z");
  const feb = time.monthBoundsUtc("2028-02"); // leap year
  assert.equal(iso(feb.end), "2028-03-01T04:59:59.999Z");
});

test("calendarDateUtc puts a calendar date at UTC midnight (bookings.date convention)", () => {
  assert.equal(time.calendarDateUtc("2026-10-15").toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(time.calendarDateUtc().format("YYYY-MM-DD"), time.dateInTz());
});

test("bookingUtcParts converts a booking's local date and time to the stored UTC parts", () => {
  const Z = "America/New_York";
  assert.deepEqual(time.bookingUtcParts("2026-10-15", "09:00:00", Z), { date_in_utc: "2026-10-15", time_in_utc: "13:00:00" });
  // evening bookings roll into the next UTC day
  assert.deepEqual(time.bookingUtcParts("2026-10-15", "21:30:00", Z), { date_in_utc: "2026-10-16", time_in_utc: "01:30:00" });
  // winter offset
  assert.deepEqual(time.bookingUtcParts("2026-12-15", "09:00:00", Z), { date_in_utc: "2026-12-15", time_in_utc: "14:00:00" });
  // bookings.date read back from MySQL is a Date at UTC midnight (this used to break the edit flow)
  assert.deepEqual(time.bookingUtcParts(new Date("2026-10-15T00:00:00Z"), "09:00:00", Z), { date_in_utc: "2026-10-15", time_in_utc: "13:00:00" });
  // ISO date strings and HH:mm times from the apps
  assert.deepEqual(time.bookingUtcParts("2026-10-15T00:00:00.000Z", "09:00", Z), { date_in_utc: "2026-10-15", time_in_utc: "13:00:00" });
  // other zones
  assert.deepEqual(time.bookingUtcParts("2026-10-15", "09:00:00", "America/Los_Angeles"), { date_in_utc: "2026-10-15", time_in_utc: "16:00:00" });
  // missing or unknown zone -> New York, not UTC
  assert.deepEqual(time.bookingUtcParts("2026-10-15", "09:00:00", null), { date_in_utc: "2026-10-15", time_in_utc: "13:00:00" });
  // unusable input -> nulls
  for (const [d, t] of [[null, "09:00"], ["2026-10-15", null], ["garbage", "09:00"], ["2026-10-15", "99:99"]]) {
    assert.deepEqual(time.bookingUtcParts(d, t, Z), { date_in_utc: null, time_in_utc: null }, `${d} ${t}`);
  }
});

test("toCalendarDate normalises request and database dates", () => {
  assert.equal(time.toCalendarDate("2026-10-15"), "2026-10-15");
  assert.equal(time.toCalendarDate("2026-10-15T00:00:00.000Z"), "2026-10-15");
  assert.equal(time.toCalendarDate(new Date("2026-10-15T00:00:00Z")), "2026-10-15");
  assert.equal(time.toCalendarDate("15/10/2026"), null);
  assert.equal(time.toCalendarDate(undefined), null);
});

test("parseDateInZone is a strict YYYY-MM-DD parse at New York midnight", () => {
  assert.equal(time.parseDateInZone("2026-10-15").toISOString(), "2026-10-15T04:00:00.000Z");
  assert.equal(time.parseDateInZone("2026-02-30").isValid(), false);
  assert.equal(time.parseDateInZone("10/15/2026").isValid(), false);
  assert.equal(time.parseDateInZone(null).isValid(), false);
  // dates keep their calendar day through month arithmetic
  assert.equal(time.parseDateInZone("2026-10-31").add(1, "month").format("YYYY-MM-DD"), "2026-11-30");
  assert.equal(time.parseDateInZone("2026-10-30").add(1, "week").format("YYYY-MM-DD"), "2026-11-06");
});

test("BUSINESS_TZ defaults to New York", () => {
  assert.equal(time.BUSINESS_TZ, "America/New_York");
});
