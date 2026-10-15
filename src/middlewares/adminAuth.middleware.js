const { status: httpStatus } = require('http-status');
const jwt = require('jsonwebtoken');


const validateEmail = require('../helpers/validateEmail');
const catchAsync = require('../utils/catchAsync');
const responseWrapper = require('../config/responseWrapper');

const config = require('../config/config');
const ApiError = require('../utils/ApiError');





const validateLoginAdminBody = catchAsync(async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return responseWrapper(res, '', 'Please Enter Required Fields : [ email_id || password ]', httpStatus.BAD_REQUEST);
        };

        if (!validateEmail(email)) {
            return responseWrapper(res, '', 'Invalid Email', httpStatus.BAD_REQUEST);
        };
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});


const validateJWTtoken = catchAsync(async (req, res, next) => {
    try {
        const token = req.header('x-access-token');
        if (!token) {
            return responseWrapper(res, '', 'Access denied: No token provided', httpStatus.BAD_REQUEST);
        };
        req.user = jwt.verify(token, Buffer.from(config?.jwt?.secret, 'hex'), {
            algorithm: 'HS256',
        });
        if (req?.user?.is_backlisted) return responseWrapper(res, '', 'Invalid Token', httpStatus.UNAUTHORIZED);
        req.body['user'] = req.user;
        req.body.user_type = "ADMIN";
        next();

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const validateResetPassordBody = catchAsync(async (req, res, next) => {
    try {
        const { old_password, new_password, confirm_password } = req.body;

        if (!old_password || !new_password || !confirm_password) {
            return responseWrapper(res, '', 'Please Enter Required Fields : [ old_password || new_password || confirm_password ]', httpStatus.BAD_REQUEST);
        };

        if (new_password !== confirm_password) {
            return responseWrapper(res, '', 'New Password and Confirm Password Must Be Equal', httpStatus.BAD_REQUEST);
        };
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});


module.exports = {
  validateLoginAdminBody,
  validateJWTtoken,
  validateResetPassordBody,
};