// The only place that configures dayjs and the only place that spells a date format.
// Every date/time operation in the app imports from here (tests/dateFormats.test.js checks it).
//
// Rules:
// - The server process runs in UTC; instants are stored as UTC DATETIME.
// - The business runs on BUSINESS_TZ (New York): "today", "this week" and
//   cron schedules are measured there.
// - Day ranges are built from the wall-clock date in BUSINESS_TZ and then
//   converted to UTC; never with Date#setHours on the server clock.
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const customParseFormat = require("dayjs/plugin/customParseFormat");
const isSameOrBefore = require("dayjs/plugin/isSameOrBefore");
const isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
const isBetween = require("dayjs/plugin/isBetween");
const isoWeek = require("dayjs/plugin/isoWeek");
const config = require("../config/config");

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);
dayjs.extend(isoWeek);

const BUSINESS_TZ = config.businessTimeZone;

// Formats for data: the database, API fields, query parameters, file names and logs
const DATE_FORMAT = "YYYY-MM-DD";
const MONTH_FORMAT = "YYYY-MM";
const TIME_FORMAT = "HH:mm:ss";
const SHORT_TIME_FORMAT = "HH:mm";
const DATETIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

// Formats for people: every date shown in a PDF, email, message or display field
const DISPLAY_DATE_FORMAT = "MM-DD-YYYY";
const DISPLAY_TIME_FORMAT = "hh:mm A";
const DISPLAY_MONTH_FORMAT = "MMMM YYYY";

const isValidTimeZone = (tz) => {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// Unknown or missing zones (for example a client-supplied header) resolve to BUSINESS_TZ
// instead of throwing; moment silently used UTC here, which put Eastern bookings 4-5 hours off.
const resolveTimeZone = (tz, fallback = BUSINESS_TZ) => (isValidTimeZone(tz) ? tz : fallback);

// An explicit offset after a time ("...T09:00:00Z", "... 09:00-04:00") marks an absolute instant.
const HAS_OFFSET = /\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)$/i;

// Same semantics as moment.tz(input, zone): an offset-less date string is wall-clock time in
// `zone`; anything else (Date, timestamp, ISO string with Z/offset, dayjs) is an instant
// converted into `zone`. (dayjs.tz alone would reinterpret "...Z" strings as wall time.)
const inZone = (input, zone = BUSINESS_TZ, format) => {
  const tz = resolveTimeZone(zone);
  if (typeof input === "string" && !HAS_OFFSET.test(input.trim())) {
    return format ? dayjs.tz(input, format, tz) : dayjs.tz(input, tz);
  }
  const parsed = dayjs(input);
  return parsed.isValid() ? parsed.tz(tz) : parsed;
};

// Calendar date ("YYYY-MM-DD") of an instant in a timezone; defaults to now in BUSINESS_TZ.
const dateInTz = (instant = new Date(), tz = BUSINESS_TZ) => dayjs(instant).tz(tz).format(DATE_FORMAT);

// Interprets a wall-clock date and time in a timezone and returns that instant as a dayjs UTC object.
// Example: zonedTimeToUtc("2026-03-08", "02:30:00", "America/New_York")
const zonedTimeToUtc = (date, time = "00:00:00", tz = BUSINESS_TZ) => {
  const parsed = dayjs.tz(`${date} ${time}`, DATETIME_FORMAT, tz);
  return parsed.isValid() ? parsed.utc() : parsed;
};

// First and last millisecond of a calendar date in a timezone, as JS Dates (UTC instants).
const dayBoundsUtc = (date = dateInTz(), tz = BUSINESS_TZ) => {
  const start = zonedTimeToUtc(date, "00:00:00", tz);
  const next = dayjs(date, DATE_FORMAT, true).add(1, "day").format(DATE_FORMAT);
  const end = zonedTimeToUtc(next, "00:00:00", tz).subtract(1, "millisecond");
  return { start: start.toDate(), end: end.toDate() };
};

// First and last millisecond of a calendar month ("YYYY-MM") in a timezone, as JS Dates.
const monthBoundsUtc = (month, tz = BUSINESS_TZ) => {
  const first = dayjs(`${month}-01`, DATE_FORMAT, true);
  return {
    start: dayBoundsUtc(first.format(DATE_FORMAT), tz).start,
    end: dayBoundsUtc(first.endOf("month").format(DATE_FORMAT), tz).end,
  };
};

// "Now" as New York wall-clock time held in a Date's UTC fields: the convention of the
// attendance *_est columns (clock_in_est, clock_out_est), so it compares with them directly.
const nowWallClock = (tz = BUSINESS_TZ) => new Date(`${dayjs().tz(tz).format("YYYY-MM-DDTHH:mm:ss.SSS")}Z`);

// A calendar date as a dayjs at UTC midnight: the way bookings.date stores dates.
// calendarDateUtc() is today's New York date in that form.
const calendarDateUtc = (date = dateInTz()) => dayjs.utc(date, DATE_FORMAT, true);

// A calendar date from a request ("YYYY-MM-DD", ISO string) or from bookings.date (a Date
// at UTC midnight) as "YYYY-MM-DD"; null when missing or unparseable.
const toCalendarDate = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    const day = value.split("T")[0].trim();
    return dayjs(day, DATE_FORMAT, true).isValid() ? day : null;
  }
  const parsed = dayjs.utc(value);
  return parsed.isValid() ? parsed.format(DATE_FORMAT) : null;
};

// A booking's wall-clock date and time in its own timezone, as the UTC date and time stored in
// bookings.date_in_utc / time_in_utc. Accepts "HH:mm:ss" or "HH:mm"; an unknown timezone counts
// as BUSINESS_TZ. Returns nulls when the date or time cannot be parsed.
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const bookingUtcParts = (date, time, tz) => {
  const day = toCalendarDate(date);
  const clock = time ? String(time).trim() : "";
  const local = day && TIME_OF_DAY.test(clock) ? inZone(`${day} ${clock.length === 5 ? `${clock}:00` : clock}`, tz) : null;
  if (!local || !local.isValid()) {
    return { date_in_utc: null, time_in_utc: null };
  }
  const utcInstant = local.utc();
  return {
    date_in_utc: utcInstant.format(DATE_FORMAT),
    time_in_utc: utcInstant.format(TIME_FORMAT),
  };
};

// Strict "YYYY-MM-DD" (or a Date) as midnight of that day in a timezone; an invalid dayjs otherwise.
// Replaces moment.tz(value, "YYYY-MM-DD", true, tz).
const parseDateInZone = (value, tz = BUSINESS_TZ) => {
  const day = typeof value === "string" ? (dayjs(value, DATE_FORMAT, true).isValid() ? value : null) : toCalendarDate(value);
  return day ? inZone(day, tz) : dayjs(null);
};

// True for a real calendar date written "YYYY-MM-DD" (2026-02-31 is not one).
const isValidDate = (value) => typeof value === "string" && dayjs(value, DATE_FORMAT, true).isValid();

// True for a real month written "YYYY-MM".
const isValidMonth = (value) => typeof value === "string" && dayjs(value, MONTH_FORMAT, true).isValid();

// UTC calendar date of an instant ("YYYY-MM-DD"); defaults to now.
const utcDate = (instant = new Date()) => dayjs.utc(instant).format(DATE_FORMAT);

// A date as people read it, "MM-DD-YYYY". Takes what toCalendarDate takes ("YYYY-MM-DD", an ISO
// string, or a Date such as bookings.date) and keeps its calendar day; "" when missing or invalid.
const formatDisplayDate = (value) => {
  const day = toCalendarDate(value);
  return day ? dayjs(day, DATE_FORMAT, true).format(DISPLAY_DATE_FORMAT) : "";
};

// A range written "YYYY-MM-DD - YYYY-MM-DD" (quote and invoice service dates) as
// "MM-DD-YYYY - MM-DD-YYYY". A single date works too; a part that is not a date stays as written.
const formatDisplayDateRange = (value) =>
  value
    ? String(value)
        .split(" - ")
        .map((part) => formatDisplayDate(part.trim()) || part.trim())
        .join(" - ")
    : "";

// An instant as people read it in a timezone, "MM-DD-YYYY hh:mm AM"; "" when missing or invalid.
const formatDisplayDateTime = (instant, tz = BUSINESS_TZ) => {
  const parsed = instant ? inZone(instant, tz) : null;
  return parsed && parsed.isValid() ? parsed.format(`${DISPLAY_DATE_FORMAT} ${DISPLAY_TIME_FORMAT}`) : "";
};

// A time of day ("16:00:41" or "16:00") as "04:00 PM"; "" when missing or invalid.
const formatTime12h = (time) => {
  const parsed = time ? dayjs(String(time).trim(), [TIME_FORMAT, SHORT_TIME_FORMAT], true) : null;
  return parsed && parsed.isValid() ? parsed.format(DISPLAY_TIME_FORMAT) : "";
};

// A month ("YYYY-MM") as people read it, "October 2026".
const formatDisplayMonth = (month) => dayjs(month, MONTH_FORMAT, true).format(DISPLAY_MONTH_FORMAT);

// An instant (Date or ISO string) as New York wall-clock time, "YYYY-MM-DD HH:mm:ss"; null when invalid.
const toBusinessDateTime = (value) => {
  if (!value) return null;
  const instant = dayjs(value);
  return instant.isValid() ? instant.tz(BUSINESS_TZ).format(DATETIME_FORMAT) : null;
};

// Adds whole calendar days to a "YYYY-MM-DD" date (no timezone involved).
const addDays = (date, days) => dayjs(date, DATE_FORMAT, true).add(days, "day").format(DATE_FORMAT);

// Monday of the ISO week containing a calendar date.
const isoWeekStart = (date = dateInTz()) => dayjs(date, DATE_FORMAT, true).startOf("isoWeek").format(DATE_FORMAT);

module.exports = {
  dayjs,
  BUSINESS_TZ,
  DATE_FORMAT,
  MONTH_FORMAT,
  TIME_FORMAT,
  SHORT_TIME_FORMAT,
  DATETIME_FORMAT,
  DISPLAY_DATE_FORMAT,
  isValidDate,
  isValidMonth,
  utcDate,
  formatDisplayDate,
  formatDisplayDateRange,
  formatDisplayDateTime,
  formatTime12h,
  formatDisplayMonth,
  toBusinessDateTime,
  isValidTimeZone,
  resolveTimeZone,
  inZone,
  dateInTz,
  zonedTimeToUtc,
  dayBoundsUtc,
  monthBoundsUtc,
  calendarDateUtc,
  nowWallClock,
  toCalendarDate,
  parseDateInZone,
  bookingUtcParts,
  addDays,
  isoWeekStart,
};
