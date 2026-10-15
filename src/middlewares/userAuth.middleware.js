const { status: httpStatus } = require('http-status');
const jwt = require('jsonwebtoken');

const { User, OTP, UserToken, Profile, Admin } = require('../models');
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
            return responseWrapper(res, '', 'Please authenticate', httpStatus.UNAUTHORIZED);
        };
        const payload = jwt.verify(token, config.jwt.secret);
        if (!payload) {
            return responseWrapper(res, '', 'Invalid Token', httpStatus.UNAUTHORIZED);
        };

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
            return responseWrapper(res, '', 'Token Not Found', httpStatus.BAD_REQUEST);
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
            return responseWrapper(res, '', 'User Not Found', httpStatus.NOT_FOUND);
        };
        req.body.user = user;
        req.body.tokenDoc = tokenDoc;
        req.body.ip_address = req.ip;
        req.body.user_type = "USER";
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


const verifyAnyAuthJWTToken = catchAsync(async (req, res, next) => {
	try {
		const token = req.header('x-access-token');
		const role_id = req.header('role_id'); // required for users

		if (!token) {
			return responseWrapper(res, '', 'Access denied: No token provided', httpStatus.BAD_REQUEST);
		}

        console.log(token,role_id)
		// 1. Try verifying as Admin
		try {
			const decoded = jwt.verify(token, Buffer.from(config?.jwt?.secret, 'hex'), {
				algorithm: 'HS256',
			});

			if (decoded?.is_backlisted) {
				return responseWrapper(res, '', 'Invalid Token', httpStatus.UNAUTHORIZED);
			}

			const admin = await Admin.findOne({ where: { id: decoded.id, is_active: true } });

			if (admin) {
				req.body.user = admin;
				req.body.user_type = "ADMIN";
				return next();
			}
		} catch (adminError) {
			// continue to check as User
		}

		// 2. Try verifying as User
		try {
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
				return responseWrapper(res, '', 'Token Not Found', httpStatus.BAD_REQUEST);
			}

            console.log(tokenDoc,"tokenDoc")

			const user = await User.findOne({
				where: { id: tokenDoc.user_id, is_active: 1, role_id: role_id },
				include: [
					{
						model: Profile,
						as: 'user_profile',
						attributes: ['name', 'dialing_code', 'mobile', 'is_active', 'created_at'],
					},
				]
			});

			if (!user) {
				return responseWrapper(res, '', 'User Not Found', httpStatus.NOT_FOUND);
			}

            console.log(user,"user")

			req.body.user = user;
			req.body.tokenDoc = tokenDoc;
			req.body.ip_address = req.ip;
			req.body.user_type = "USER";
			return next();
		} catch (userError) {
			// If both fail
			return responseWrapper(res, '', 'Invalid Token', httpStatus.UNAUTHORIZED);
		}
	} catch (error) {
		throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
});


module.exports = {
    validateRegisterUserBody,
    verifyAuthJWTToken,
    validateResetPassordBody,
    setRoleIdIfNotPresent,
    validateForgetPassordToken,
    validateSignInReqBody,
    verifyAnyAuthJWTToken
};