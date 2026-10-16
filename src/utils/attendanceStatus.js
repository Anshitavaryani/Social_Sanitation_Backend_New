// An employee's attendance status for one booking. bookingStart, clockIn and now must use the same
// convention: New York wall time held in a Date's UTC fields (bookings.time, clock_in_est and
// nowWallClock() in src/utils/time.js). Thresholds come from src/config/rules.js.
//
// - clocked in: LATE when the clock-in is past the late threshold, otherwise PRESENT. Coming in after
//   the absent threshold is still LATE: the employee came.
// - not clocked in: ABSENT past the absent threshold, LATE past the late threshold, otherwise PENDING.
const { ATTENDANCE } = require("../config/rules");
const { attendanceStatusTypes } = require("../config/types");

const MINUTE_MS = 60 * 1000;

const attendanceStatus = ({ bookingStart, clockIn, now }) => {
  const start = new Date(bookingStart).getTime();
  const lateAt = start + ATTENDANCE.LATE_AFTER_MINUTES * MINUTE_MS;
  const absentAt = start + ATTENDANCE.ABSENT_AFTER_MINUTES * MINUTE_MS;

  if (clockIn) {
    return new Date(clockIn).getTime() > lateAt ? attendanceStatusTypes.LATE : attendanceStatusTypes.PRESENT;
  }
  const current = new Date(now).getTime();
  if (current > absentAt) return attendanceStatusTypes.ABSENT;
  if (current > lateAt) return attendanceStatusTypes.LATE;
  return attendanceStatusTypes.PENDING;
};

module.exports = { attendanceStatus };
