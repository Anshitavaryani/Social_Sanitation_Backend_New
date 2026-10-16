const { status: httpStatus } = require('http-status');

class ApiError extends Error {
    constructor(statusCode, message, isOperational = true, stack = '') {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    // What a catch block rethrows: the caught error's status (500 when it has none) and message
    static from(error) {
        return new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }

    // What a catch block rethrows when the error may come from another service: an ApiError this
    // code threw keeps its status (404, 400...); anything else is a 500 with its message
    static orInternal(error) {
        return error instanceof ApiError ? error : new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
}

module.exports = ApiError;
