require("./src/config/processSettings.js");

const logger = require("./src/config/logger.js");
const { initFirebase } = require("./src/config/firebase.js");
const { ensureUploadDirs } = require("./src/config/storage.js");
const { startJobs, stopJobs } = require("./src/jobs");
const { closePdfBrowser } = require("./src/config/pdfBrowser.js");

// Time a run in progress gets to finish when pm2 stops or restarts the worker (its kill_timeout is
// longer), and after an uncaught exception
const STOP_GRACE_MS = 30000;
const CRASH_GRACE_MS = 10000;

let stopping = false;
const shutDown = (code, graceMs) => {
  if (stopping) return;
  stopping = true;
  stopJobs(graceMs)
    .catch(() => {})
    .then(closePdfBrowser)
    .finally(() => {
      logger.info("Worker stopped");
      process.exit(code);
    });
};

// pm2 stops with SIGINT, the system with SIGTERM
process.on("SIGINT", () => shutDown(0, STOP_GRACE_MS));
process.on("SIGTERM", () => shutDown(0, STOP_GRACE_MS));

// After an uncaught exception the process state is undefined: exit so pm2 starts a clean one
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  setTimeout(() => process.exit(1), CRASH_GRACE_MS + 1000).unref();
  shutDown(1, CRASH_GRACE_MS);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

// The scheduled jobs run in this process (pm2 app socialsanitation-jobs, one instance only), so a
// slow or failing job never holds up the API. src/jobs lists them.
initFirebase();
ensureUploadDirs(); // invoice jobs write PDFs to the docs folder
const tasks = startJobs();
logger.info(`Worker started: ${tasks.length} scheduled jobs`);
