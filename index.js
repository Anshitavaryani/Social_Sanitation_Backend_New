const config = require("./src/config/config.js");

// Process-wide settings, before anything else loads: the server clock runs on DEFAULT_TIMEZONE,
// and TLS certificates are always verified, whatever NODE_TLS_REJECT_UNAUTHORIZED says in .env
process.env.TZ = config.DEFAULT_TIMEZONE;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";

const app = require("./app.js");
const http = require("http");
const { dayjs } = require("./src/utils/time.js");
const logger = require("./src/config/logger.js");

// Create HTTP server (Nginx handles SSL)
const server = http.createServer(app);

// Get the current date and time
const currentTime = dayjs();

server.listen(config.port, "127.0.0.1", () => {
  logger.info(
    `Server is Working Fine😊 & Listening to PORT: ${
      config.port
    } | Default Timezone is: ${
      config.DEFAULT_TIMEZONE
    } | Current date and time: ${currentTime.format("YYYY-MM-DD HH:mm:ss")}`
  );
});

// Server exit operations
const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

// After an uncaught exception the process state is undefined: stop accepting
// requests and exit so pm2 (autorestart) brings up a clean process
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  setTimeout(() => process.exit(1), 10000).unref();
  server.close(() => process.exit(1));
});

// Keep the API running on unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection:", reason);
});

process.on("SIGTERM", exitHandler);