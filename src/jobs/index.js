const cron = require("node-cron");
const logger = require("../config/logger");
const { BUSINESS_TZ } = require("../utils/time");
const {
  autoClockOutEmployees,
  syncClockInData,
  syncClockOutData,
  autoCompleteExpiredBreaks,
} = require("../services/Common/attendance.service");
const { notifyAdminIfClockoutFar, sendAttendanceAlerts } = require("../services/Admin/booking.service");
const { expireQuotesJob } = require("../services/Admin/user.service");
const { sendInvoiceCron, generateRecurringInvoicesCron, sendDueBalancesCron } = require("../services/Common/invoice.service");

// Every scheduled job. worker.js runs them; the API process (index.js) runs none.
// Schedules are New York wall-clock time (BUSINESS_TZ).
const JOBS = [
  { name: "syncClockInData", schedule: "*/5 * * * *", run: syncClockInData },
  { name: "syncClockOutData", schedule: "*/5 * * * *", run: syncClockOutData },
  { name: "sendAttendanceAlerts", schedule: "*/5 * * * *", run: sendAttendanceAlerts },
  { name: "notifyAdminIfClockoutFar", schedule: "*/5 * * * *", run: notifyAdminIfClockoutFar },
  { name: "autoCompleteExpiredBreaks", schedule: "*/10 * * * *", run: autoCompleteExpiredBreaks },
  { name: "autoClockOutEmployees", schedule: "*/10 * * * *", run: autoClockOutEmployees },
  { name: "expireQuotesJob", schedule: "0 0 * * *", run: expireQuotesJob },
  { name: "generateRecurringInvoicesCron", schedule: "0 2 * * *", run: generateRecurringInvoicesCron },
  { name: "sendInvoiceCron", schedule: "* * * * *", run: sendInvoiceCron },
  { name: "sendDueBalancesCron", schedule: "* * * * *", run: sendDueBalancesCron },
];

// A failed run is logged with the job's name and the schedule carries on
const runJob = (name, run) => async () => {
  try {
    await run();
  } catch (error) {
    logger.error(`${name} failed:`, error);
  }
};

// node-cron's own warnings (a skipped or missed run) go through the logger, naming the job
const taskLogger = (name) => ({
  info: (message) => logger.info(`${name}: ${message}`),
  warn: (message) => logger.warn(`${name}: ${message}`),
  error: (message, error) => logger.error(`${name}:`, message, ...(error ? [error] : [])),
  debug: (message, error) => logger.debug(`${name}:`, message, ...(error ? [error] : [])),
});

// noOverlap: while a run is still going, the next one due is skipped instead of starting alongside
// it, so a slow minute of invoice emails can't send the same invoice twice
const startJobs = () =>
  JOBS.map(({ name, schedule, run }) =>
    cron.schedule(schedule, runJob(name, run), { name, timezone: BUSINESS_TZ, noOverlap: true, logger: taskLogger(name) }),
  );

// Stops scheduling and gives runs in progress up to graceMs to finish
const stopJobs = (graceMs) => cron.shutdown(graceMs);

module.exports = { JOBS, runJob, startJobs, stopJobs };
