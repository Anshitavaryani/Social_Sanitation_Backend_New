const httpStatus = require('http-status');
const jwt = require('jsonwebtoken');


const sequelize = require('../config/central.db');
const { Admin, Role, Department, Category, Service } = require('../models');
const validateEmail = require('../helpers/validateEmail');
const catchAsync = require('../utils/catchAsync');
const responseWrapper = require('../config/responseWrapper');

const { roleService } = require('../services');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');


const validateCreateAdminBody = catchAsync(async (req, res, next) => {
    try {
        const { name, email, role_id } = req.body;
        if (!name || !email ||  !role_id ) {
            return responseWrapper(res, '', 'Please Enter Required Fields : [name || email_id || role_id ]', httpStatus.BAD_REQUEST);
        };

        // if (role_id === config.ADM) {
        //     return responseWrapper(res, '', 'You are not authorized to create this role.', httpStatus.BAD_REQUEST);
        // };

        if (!validateEmail(email) || name.length === 0) {
            return responseWrapper(res, '', 'Invalid Name or Email', httpStatus.BAD_REQUEST);
        };

        if (await Admin.isEmailTaken(email)) {
            return responseWrapper(res, '', 'Email already taken', httpStatus.BAD_REQUEST);
        };

        const isValidRoleId = await roleService.findRoleById(parseInt(role_id));
        if (!isValidRoleId) return responseWrapper(res, '', 'Invalid Role Id', httpStatus.BAD_REQUEST);

        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});



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
    validateCreateAdminBody,
    validateLoginAdminBody,
    validateJWTtoken,
    validateResetPassordBody,
};