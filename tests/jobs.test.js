// The scheduled jobs (src/jobs, run by worker.js): the 10 jobs and schedules app.js used to run, in
// New York time, one run of a job at a time, each failure logged under the job's name.
require("./helpers/env");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT, mockModule, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
mockFirebase();
const logged = [];
mockModule("src/config/logger.js", {
  error: (...args) => logged.push(["error", ...args]),
  warn: (...args) => logged.push(["warn", ...args]),
  info: () => {},
  debug: () => {},
});

// The real node-cron; every task is stopped as soon as it is made, so nothing runs on its own
const cron = require(require.resolve("node-cron", { paths: [ROOT] }));
const scheduled = [];
const realSchedule = cron.schedule;
cron.schedule = (expression, task, options) => {
  const created = realSchedule(expression, task, options);
  created.stop();
  scheduled.push({ expression, task, options, created });
  return created;
};

const jobs = loadFromRoot("src/jobs/index.js");
after(() => jobs.stopJobs(0));

test("the worker runs the 10 jobs app.js ran, on the same schedules", () => {
  assert.deepEqual(
    jobs.JOBS.map(({ name, schedule }) => [name, schedule]),
    [
      ["syncClockInData", "*/5 * * * *"],
      ["syncClockOutData", "*/5 * * * *"],
      ["sendAttendanceAlerts", "*/5 * * * *"],
      ["notifyAdminIfClockoutFar", "*/5 * * * *"],
      ["autoCompleteExpiredBreaks", "*/10 * * * *"],
      ["autoClockOutEmployees", "*/10 * * * *"],
      ["expireQuotesJob", "0 0 * * *"],
      ["generateRecurringInvoicesCron", "0 2 * * *"],
      ["sendInvoiceCron", "* * * * *"],
      ["sendDueBalancesCron", "* * * * *"],
    ],
  );
  for (const job of jobs.JOBS) assert.equal(job.run.name, job.name, "each job runs the service function it is named after");
});

test("jobs are scheduled in New York time, named, one run at a time", () => {
  const tasks = jobs.startJobs();
  assert.equal(tasks.length, 10);
  assert.equal(scheduled.length, 10);
  for (const [index, { expression, options, created }] of scheduled.entries()) {
    assert.equal(expression, jobs.JOBS[index].schedule);
    assert.equal(options.timezone, "America/New_York");
    assert.equal(options.noOverlap, true);
    assert.equal(created.name, jobs.JOBS[index].name);
  }
});

test("a job's failure is logged under its name and never reaches node-cron", async () => {
  const failure = new Error("db down");
  await assert.doesNotReject(jobs.runJob("demoJob", async () => Promise.reject(failure))());
  assert.deepEqual(logged.at(-1), ["error", "demoJob failed:", failure]);

  models.Invoice.findAll = async () => {
    throw failure;
  };
  for (const { task, options } of scheduled) {
    await assert.doesNotReject(Promise.resolve(task()), options.name);
  }
});

test("stopJobs stops every scheduled task", async () => {
  await jobs.stopJobs(0);
  assert.equal(cron.getTasks().size, 0);
});
