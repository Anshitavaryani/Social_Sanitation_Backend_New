/** @format */

const express = require("express");
const helmet = require("helmet");
const moment = require("moment-timezone");
const cors = require("cors");
const compression = require("compression");
const { status: httpStatus } = require("http-status");
const cron = require("node-cron");
const path = require("path");
const app = express();

app.set("trust proxy", 1);
// Express 5 defaults to the "simple" query parser; keep nested query support (?a[b]=1)
app.set("query parser", "extended");

const config = require("./src/config/config.js");
const routes = require("./src/routes/v1");
const morgan = require("./src/config/morgan.js");
const { authLimiter } = require("./src/middlewares/rateLimiter.js");
const corsConfigs = require("./src/config/corsConfigs.js");
const credentials = require("./src/middlewares/credentials.js");

const ApiError = require("./src/utils/ApiError.js");
const upload = require("./src/config/multer.js");
const errorHandler = require("./src/utils/errorHandler.js");
require("./src/models");
const PUBLIC_DIR = path.resolve(__dirname, "./public");

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
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL:
    process.env.FIREBASE_DATABASE_URL ||
    "https://social-sanitation-default-rtdb.firebaseio.com",
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    "social-sanitation.firebasestorage.app",
});

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await syncClockInData();
    } catch (err) {
      console.error("syncClockInData failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await syncClockOutData();
    } catch (err) {
      console.error("syncClockOutData failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await sendAttendanceAlerts();
    } catch (err) {
      console.error("sendAttendanceAlerts failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      await notifyAdminIfClockoutFar();
    } catch (err) {
      console.error("notifyAdminIfClockoutFar failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

cron.schedule(
  "*/10 * * * *",
  async () => {
    try {
      await autoCompleteExpiredBreaks();
    } catch (err) {
      console.error("autoCompleteExpiredBreaks failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

// Run every 5 minutes
cron.schedule(
  "*/10 * * * *",
  async () => {
    try {
      console.log("⏰ Running autoClockOut check...");
      await autoClockOutEmployees();
    } catch (err) {
      console.error("autoClockOutEmployees failed:", err);
    }
  },
  { timezone: "America/New_York" },
);

cron.schedule(
  "0 0 * * *",
  async () => {
    try {
      console.log("🧾 Running invoice expiry job...");
      await expireQuotesJob();
    } catch (err) {
      console.error("expireQuotesJob failed:", err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "0 2 * * *",
  async () => {
    try {
      console.log("Generating recurring invoices...");
      await generateRecurringInvoicesCron();
    } catch (err) {
      console.error(err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "* * * * *",
  async () => {
    try {
      await sendInvoiceCron();
    } catch (err) {
      console.error(err);
    }
  },
  {
    timezone: "America/New_York",
  },
);

cron.schedule(
  "* * * * *",
  async () => {
    await sendDueBalancesCron();
  },
  { timezone: "America/New_York" },
);

app.use(helmet());

// parse json request body
app.use(express.json({ limit: "25mb" }));

// parse urlencoded request body
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

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

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 1;

app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.use(credentials);
app.use(cors(corsConfigs));


// limit repeated failed requests to auth endpoints
if (config.env === "production") {
  app.use("/v1/auth", authLimiter);
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

// Global multer for v1 routes, except the CSV import which has its own parser
app.use(
  "/api/v1",
  (req, res, next) => {
    if (req.path === "/invoice/import-historical-csv") return next();
    return upload(req, res, next);
  },
  routes,
);

app.get("/api/v1/logs", (req, res) => {
  const currentDate = moment().format("YYYY-MM-DD");
  const logFileName = `${currentDate}.log`;
  const logFilePath = path.join(__dirname, "logs", logFileName);
  fs.readFile(logFilePath, "utf8", (err, data) => {
    if (err) {
      return responseWrapper(res, [], "success");
    } else {
      const logs = data.split("\n");
      return responseWrapper(res, logs, "success");
    }
  });
});

app.delete("/api/v1/logs", async (req, res) => {
  const logDirectory = path.join(__dirname, "logs");
  fs.readdir(logDirectory, async (err, files) => {
    if (err) {
      return responseWrapper(res, "", "Error reading log directory", 400);
    } else {
      files.forEach((file) => {
        if (file.endsWith(".log")) {
          fs.unlink(path.join(logDirectory, file), (err) => {
            if (err) {
              return responseWrapper(res, "", "Error deleting log file", 400);
            }
          });
        }
      });
      return responseWrapper(res, "", "All log files deleted successfully");
    }
  });
});

app.use("/api/v1/images", express.static(`${PUBLIC_DIR}/uploads/images`));
app.use("/api/v1/videos", express.static(`${PUBLIC_DIR}/uploads/videos`));
app.use("/api/v1/gifs", express.static(`${PUBLIC_DIR}/uploads/gifs`));
app.use("/api/v1/docs", express.static(`${PUBLIC_DIR}/uploads/docs`));
app.use("/api/v1/songs", express.static(`${PUBLIC_DIR}/uploads/songs`));


// All File Apis
app.use("/images", express.static(`${PUBLIC_DIR}/uploads/images`));
app.use("/videos", express.static(`${PUBLIC_DIR}/uploads/videos`));
app.use("/gifs", express.static(`${PUBLIC_DIR}/uploads/gifs`));
app.use("/docs", express.static(`${PUBLIC_DIR}/uploads/docs`));
app.use("/songs", express.static(`${PUBLIC_DIR}/uploads/songs`));

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, "Not found"));
});

// error handling
app.use(errorHandler);

module.exports = app;
