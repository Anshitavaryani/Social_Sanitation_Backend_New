const { status: httpStatus } = require('http-status');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('./access.middleware');
const { parseUploads } = require('./upload.middleware');

const { User, OTP, UserToken, Profile } = require('../models');
const validateEmail = require('../helpers/validateEmail');
const validatePassword = require('../helpers/validatePassword');
const { tokenTypes, otpTypes } = require('../config/types');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const config = require('../config/config');
const responseWrapper = require('../config/responseWrapper');

const validateRegisterUserBody = catchAsync(async (req, res, next) => {

    try {
        const { name, email,  password, confirm_password } = req.body;
        const { role_id } = req.headers;

        if (!name || !email ||  !password || !confirm_password) {
            return responseWrapper(res, '', 'Please Enter Required Fields : [ name || email ||  password || confirm_password ]', httpStatus.BAD_REQUEST);
        };

        if (!validateEmail(email) || name.length === 0) {
            return responseWrapper(res, '', 'Invalid Name or Email', httpStatus.BAD_REQUEST);
        };

        if (await User.isEmailTaken(email, role_id)) {
            return responseWrapper(res, '', 'Email already taken', httpStatus.BAD_REQUEST);
        };

        if (!validatePassword(password)) {
            return responseWrapper(res, '', 'Password should have a minimum length of 8 characters and must have at least 2 digits and No Blank Space', httpStatus.BAD_REQUEST);
        };

        if (password !== confirm_password) {
            return responseWrapper(res, '', 'Password and Confirm Password must be equal.', httpStatus.BAD_REQUEST);
        };
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const validateSignInReqBody = catchAsync(async (req, res, next) => {

    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Please Enter Required Fields : [email, password] ');
    };
    req.body.ip_address = req.ip;

    next();
});

const verifyAuthJWTToken = catchAsync(async (req, res, next) => {
    try {
        const token = req.headers["x-access-token"];
        const role_id = req.headers['role_id'];
        if (!token) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required. Send the access token in the x-access-token header.');
        };
        const payload = jwt.verify(token, config.jwt.secret);

        const tokenDoc = await UserToken.findOne({
            where: {
                token: token,
                role_id: role_id,
                token_type: tokenTypes.ACCESS,
                user_id: payload.sub,
                is_active: true
            }
        });

        if (!tokenDoc) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Your session has ended. Please log in again.');
        };

        const user = await User.findOne({ 
            where: { id: tokenDoc.user_id, is_active: 1, role_id: role_id },
            include : [
                {
                    model: Profile,
                    as: 'user_profile',
                    attributes: ['name', 'dialing_code', 'mobile', 'is_active', 'created_at'],
                },
            ]
        });
        if (!user) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'This account is not active. Please log in again.');
        };
        await parseUploads(req, res);
        req.body.user = user;
        req.body.tokenDoc = tokenDoc;
        req.body.ip_address = req.ip;
        req.body.user_type = "USER";
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Your session has expired. Please log in again.');
        }
        if (error instanceof jwt.JsonWebTokenError) {
            throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid access token. Please log in again.');
        }
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

const validateForgetPassordToken = catchAsync(async (req, res, next) => {
    try {
        const { email, password, confirm_password, token } = req.body;

        if (!email || !password || !confirm_password || !token) {
            return responseWrapper(res, '', 'Please Enter Required Fields : [ email || new_password || confirm_password || token ]', httpStatus.BAD_REQUEST);
        };

        const userDoc = await User.findOne({ where: { email: email, is_active: true, role_id: req.headers.role_id } });
        if (!userDoc) {
            return responseWrapper(res, '', 'User With This Email Id Not Found.', httpStatus.BAD_REQUEST);
        };

        let otpDoc = await OTP.findOne({ where: { email: email, code: token, is_verified: true, type: otpTypes.FORGOT_PASSWORD } });
        if (!otpDoc) {
            return responseWrapper(res, '', 'Forget Password Token is not Valid.', httpStatus.BAD_REQUEST);
        };
        if (!otpDoc.otp_expiration_time || new Date(otpDoc.otp_expiration_time) < new Date()) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Your password reset session has expired. Please request a new OTP.');
        };
        req.body.user = userDoc;
        req.body.otpDoc = otpDoc;
        next()

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const setRoleIdIfNotPresent = (req, res, next) => {
    try {
        if (!req.headers.role_id) {
            req.headers.role_id = config.USR_ROLE_ID;
        };
        next();

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
};


// Admin or app-user token; same as access.middleware requireAuth
const verifyAnyAuthJWTToken = requireAuth;


module.exports = {
    validateRegisterUserBody,
    verifyAuthJWTToken,
    validateResetPassordBody,
    setRoleIdIfNotPresent,
    validateForgetPassordToken,
    validateSignInReqBody,
    verifyAnyAuthJWTToken
};