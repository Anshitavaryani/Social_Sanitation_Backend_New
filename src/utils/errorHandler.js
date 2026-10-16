const ApiError = require('./ApiError');
const { status: httpStatus } = require('http-status');
const logger = require('../config/logger');

const isHttpErrorCode = (code) => Number.isInteger(code) && code >= 400 && code <= 599;

const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof ApiError) {
        const statusCode = isHttpErrorCode(err.statusCode) ? err.statusCode : httpStatus.INTERNAL_SERVER_ERROR;
        res.status(statusCode).json(
            {
                success: false,
                status: statusCode,
                message: err.message,
                data: '',
            }
        );
        if (statusCode >= 500) {
            logger.error(err);
        }
        return;
    } else {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json(
            {
                success: false,
                status: httpStatus.INTERNAL_SERVER_ERROR,
                message: 'An internal server error occurred.',
                data: '',
            }
        );
        logger.error(err);
        return;
    }
};

module.exports = errorHandler;
