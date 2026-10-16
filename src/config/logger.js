// The app's log: one line per entry with time and level, written to stdout/stderr (pm2 keeps them).
// Call it like console: logger.error("Square payment link failed:", error). An Error prints as its
// stack only; its other properties stay out (a database error's SQL holds customer data).
// Levels: error, warn, info, debug; LOG_LEVEL picks the least important one written (default: debug in
// development, info in production, silent in tests).
const util = require('util');
const winston = require('winston');
const config = require('./config.js');

const base = winston.createLogger({
    level: config.logLevel === 'silent' ? 'error' : config.logLevel,
    format: winston.format.combine(
        winston.format.timestamp(),
        config.env === 'development' ? winston.format.colorize() : winston.format.uncolorize(),
        winston.format.printf(({ level, message, timestamp }) => `${timestamp} ${level}: ${message}`)
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error'],
            silent: config.logLevel === 'silent',
        }),
    ],
});

const formatArg = (arg) => (arg instanceof Error ? arg.stack || String(arg) : arg);
const writer = (level) => (...args) => base.log(level, util.format(...args.map(formatArg)));

module.exports = {
    error: writer('error'),
    warn: writer('warn'),
    info: writer('info'),
    debug: writer('debug'),
};
