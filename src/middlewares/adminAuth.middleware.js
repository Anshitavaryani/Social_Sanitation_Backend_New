const { status: httpStatus } = require('http-status');
const { requireAdmin } = require('./access.middleware');


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


// Admin-token check used by the routes that already had one; same as access.middleware requireAdmin
const validateJWTtoken = requireAdmin;

// Only a super admin may create another super admin (POST /admin/auth/register)
const restrictSuperAdminCreation = (req, res, next) => {
    const superAdminRole = Number(config.SUP_ADM_ROLE_ID);
    if (Number(req.body.role_id) === superAdminRole && Number(req.user.role_id) !== superAdminRole) {
        return next(new ApiError(httpStatus.FORBIDDEN, 'Only a super admin can create another super admin.'));
    }
    next();
};

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
  restrictSuperAdminCreation,
};