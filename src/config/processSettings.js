// Process-wide settings, applied first by each entry point (index.js, worker.js) before anything
// else loads: the clock runs on DEFAULT_TIMEZONE, and TLS certificates are always verified,
// whatever NODE_TLS_REJECT_UNAUTHORIZED says in .env
const config = require("./config.js");

process.env.TZ = config.DEFAULT_TIMEZONE;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
