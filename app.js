/** @format */

const express = require("express");
const logger = require("./src/config/logger");
const helmet = require("helmet");
const { dayjs, BUSINESS_TZ, DATE_FORMAT } = require("./src/utils/time.js");
const cors = require("cors");
const compression = require("compression");
const { status: httpStatus } = require("http-status");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const app = express();

app.set("trust proxy", 1);
// Never send password hashes, OTPs or password-reset tokens in any JSON response, wherever an
// Admin or User row ends up in a payload
const HIDDEN_RESPONSE_KEYS = new Set(["password", "remember_token", "otp"]);
app.set("json replacer", (key, value) => (HIDDEN_RESPONSE_KEYS.has(key) ? undefined : value));
// Express 5 defaults to the "simple" query parser; keep nested query support (?a[b]=1)
app.set("query parser", "extended");

const config = require("./src/config/config.js");
const { LIMITS } = require("./src/config/rules.js");
const routes = require("./src/routes/v1");
const morgan = require("./src/config/morgan.js");
const { authLimiter } = require("./src/middlewares/rateLimiter.js");
const corsConfigs = require("./src/config/corsConfigs.js");
const credentials = require("./src/middlewares/credentials.js");

const ApiError = require("./src/utils/ApiError.js");
const errorHandler = require("./src/utils/errorHandler.js");
const responseWrapper = require("./src/config/responseWrapper.js");
const { adminAuthMiddleware } = require("./src/middlewares");
require("./src/models");
const { PUBLIC_DIR, UPLOAD_DIRS, SERVED_UPLOAD_FOLDERS, ASSETS_DIR } = require("./src/config/storage");

const { initializeApp, cert } = require("firebase-admin/app");
const {
  autoClockOutEmployees,
  syncClockInData,
  syncClockOutData,
  autoCompleteExpiredBreaks,
} = require("./src/services/Common/attendance.service.js");
const {
  notifyAdminIfClockoutFar,
  sendAttendanceAlerts,
} = require("./src/services/Admin/booking.service.js");
const { expireQuotesJob } = require("./src/services/Admin/user.service.js");
const { sendInvoiceCron, generateRecurringInvoicesCron, sendDueBalancesCron } = require("./src/services/Common/invoice.service.js");

initializeApp({
  credential: cert({
    projectId: config.firebase.projectId,
    clientEmail: config.firebase.clientEmail,
    privateKey: config.firebase.privateKey,
  }),
  databaseURL: config.firebase.databaseUrl,
  storageBucket: config.firebase.storageBucket,
});

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await syncClockInData();
    } catch (err) {
      logger.error("syncClockInData failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await syncClockOutData();
    } catch (err) {
      logger.error("syncClockOutData failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await sendAttendanceAlerts();
    } catch (err) {
      logger.error("sendAttendanceAlerts failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await notifyAdminIfClockoutFar();
    } catch (err) {
      logger.error("notifyAdminIfClockoutFar failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "*/10 * * * *",
  async () => {
    try {
      await autoCompleteExpiredBreaks();
    } catch (err) {
      logger.error("autoCompleteExpiredBreaks failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

// Run every 10 minutes
cron.schedule(
  "*/10 * * * *",
  async () => {
    try {
      logger.debug("Running autoClockOut check...");
      await autoClockOutEmployees();
    } catch (err) {
      logger.error("autoClockOutEmployees failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "0 0 * * *",
  async () => {
    try {
      logger.debug("Running invoice expiry job...");
      await expireQuotesJob();
    } catch (err) {
      logger.error("expireQuotesJob failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "0 2 * * *",
  async () => {
    try {
      logger.debug("Generating recurring invoices...");
      await generateRecurringInvoicesCron();
    } catch (err) {
      logger.error("generateRecurringInvoicesCron failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "* * * * *",
  async () => {
    try {
      await sendInvoiceCron();
    } catch (err) {
      logger.error("sendInvoiceCron failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

cron.schedule(
  "* * * * *",
  async () => {
    try {
      await sendDueBalancesCron();
    } catch (err) {
      logger.error("sendDueBalancesCron failed:", err);
    }
  },
  { timezone: BUSINESS_TZ },
);

app.use(helmet());

// parse json request body; keep the raw bytes for the Square webhook signature check
app.use(
  express.json({
    limit: `${LIMITS.MAX_REQUEST_BODY_MB}mb`,
    verify: (req, res, buffer) => {
      if (req.originalUrl.startsWith("/api/v1/payment/square/webhooks")) {
        req.rawBody = buffer.toString("utf8");
      }
    },
  }),
);

// parse urlencoded request body
app.use(express.urlencoded({ extended: true, limit: `${LIMITS.MAX_REQUEST_BODY_MB}mb` }));

// Express 5 leaves req.body undefined when there is no body; the auth
// middlewares attach req.body.user on GET requests, so default it to {}
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// gzip compression
app.use(compression());

if (config.env !== "test") {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(express.static(PUBLIC_DIR));

// CORS: only origins listed in ACCESSDOMAINS (credentials.js + corsConfigs.js)
app.use(credentials);
app.use(cors(corsConfigs));


// limit repeated failed sign-in, OTP and password-reset attempts (20 failures per 15 minutes per IP)
if (config.env === "production") {
  app.use(
    [
      "/api/v1/user/auth/login",
      "/api/v1/user/auth/otp",
      "/api/v1/user/auth/verify-otp",
      "/api/v1/user/auth/forgot-password",
      "/api/v1/user/auth/register",
      "/api/v1/admin/auth/login",
      "/api/v1/admin/auth/otp",
      "/api/v1/admin/auth/verify-otp",
      "/api/v1/admin/auth/forgot-password",
    ],
    authLimiter,
  );
}

app.get("/api/healthcheck", function (req, res) {
  let data = {
    response: "ok",
  };
  res.status(200).send(data);
});

app.get("/test", (req, res, next) => {
  res.status(200).send("Hello World !!");
});

// Uploads are parsed once the route's access check passes (src/middlewares/upload.middleware.js);
// files from a request that is still refused afterwards (403 from a role check) are deleted
// instead of being left on disk
const discardFilesOfRejectedRequests = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode !== 401 && res.statusCode !== 403) return;
    const files = Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
    for (const file of files) {
      if (file && file.path) fs.promises.unlink(file.path).catch(() => {});
    }
  });
  next();
};

app.use("/api/v1", discardFilesOfRejectedRequests, routes);

// Admin-only access to the daily request logs written by src/config/morgan.js
const LOG_DIR = path.join(__dirname, "logs");

app.get("/api/v1/logs", adminAuthMiddleware.validateJWTtoken, async (req, res) => {
  const logFilePath = path.join(LOG_DIR, `${dayjs().format(DATE_FORMAT)}.log`);
  try {
    const data = await fs.promises.readFile(logFilePath, "utf8");
    return responseWrapper(res, data.split("\n"), "success");
  } catch (err) {
    return responseWrapper(res, [], "success");
  }
});

app.delete("/api/v1/logs", adminAuthMiddleware.validateJWTtoken, async (req, res) => {
  let files;
  try {
    files = await fs.promises.readdir(LOG_DIR);
  } catch (err) {
    return responseWrapper(res, "", "Error reading log directory", 400);
  }
  const results = await Promise.allSettled(
    files
      .filter((file) => file.endsWith(".log"))
      .map((file) => fs.promises.unlink(path.join(LOG_DIR, file))),
  );
  if (results.some((result) => result.status === "rejected")) {
    return responseWrapper(res, "", "Error deleting log file", 400);
  }
  return responseWrapper(res, "", "All log files deleted successfully");
});

// Uploaded files at /api/v1/<folder> and /<folder>, and the fixed images emails link to (storage.js)
for (const folder of SERVED_UPLOAD_FOLDERS) {
  app.use(`/api/v1/${folder}`, express.static(UPLOAD_DIRS[folder]));
}
app.use("/api/v1/assets", express.static(ASSETS_DIR));
for (const folder of SERVED_UPLOAD_FOLDERS) {
  app.use(`/${folder}`, express.static(UPLOAD_DIRS[folder]));
}

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// error handling
app.use(errorHandler);

module.exports = app;
