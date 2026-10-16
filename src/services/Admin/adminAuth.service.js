const { status: httpStatus } = require("http-status");
const bcrypt = require("bcryptjs");
const { randomInt } = require("crypto");
const jwt = require("jsonwebtoken");

const { Admin, Role, UserOAuth } = require("../../models");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const { emailService } = require("../Common");
const { otpTypes } = require("../../config/types");
const otpGuard = require("../../utils/otpGuard");
const { generateTemporaryPassword } = require("../../utils/temporaryPassword");
const { sendAdminCredentials } = require("../Common/email.service");


const createAdminUser = async (userBody) => {
  try {
    const password = generateTemporaryPassword();
    let salt = bcrypt.genSaltSync(10);
    const adminObj = {
      name: userBody.name,
      role_id: userBody.role_id,
      email: userBody.email,
      mobile:userBody.mobile,
      password: bcrypt.hashSync(password, salt),
    };
    const adminDoc = await Admin.create(adminObj);
    if (!adminDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Unable to create admin");
    }

    let isSend = await sendAdminCredentials(userBody.email, password);
    if (!isSend) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Unable to send Credentials to This Email"
      );
    }
    return adminDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const loginAdminUser = async (reqBody) => {
  try {
    const user = await Admin.findOne({ where: { email: reqBody.email } });

    if (!user) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Error: User not found.");
    }

    const validPass = await bcrypt.compare(reqBody.password, user.password);
    if (!validPass) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Error: Invalid email or password. Please try again."
      );
    }

    const token = jwt.sign(
      {
        id: user.id,
        role_id: user.role_id,
        department_id: user.department_id,
        is_backlisted: false,
      },
      Buffer.from(config.jwt.secret, "hex"),
      { algorithm: "HS256", expiresIn: `${config.jwt.adminAccessExpirationDays}d` }
    );

    // Check if id and role_id are present in UserAuth table
    const userAuth = await UserOAuth.findOne({
      where: { user_id: user.id, role_id: user.role_id },
    });

    const response = {
      id: user.id,
      name: user.name,
      email: user.email,
      token: token,
      role_id: user.role_id,
      authorize: userAuth ? true : false,
    };

    return response;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const resetAdminPassword = async (reqBody) => {
  try {
    const { old_password, confirm_password, user } = reqBody;

    const userDoc = await Admin.findByPk(user.id);

    if (!userDoc) {
      throw new ApiError(httpStatus.BAD_REQUEST, "User Not Found.");
    }

    const validPass = await bcrypt.compare(old_password, userDoc?.password);
    if (!validPass) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Incorrect Old Password.");
    }

    let salt = bcrypt.genSaltSync(10);
    const userObj = {
      password: bcrypt.hashSync(confirm_password, salt),
    };

    const isUserPasswordUpdate = await Admin.update(userObj, {
      where: { id: user?.id },
    });

    if (!isUserPasswordUpdate) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to Change Password."
      );
    }
    return "Password Changed Successfully.";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const sendOTP = async (email) => {
  try {
    const user = await Admin.findOne({
      where: { email: email, is_active: true },
    });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email");
    }
    const generatedOTP = String(randomInt(0, 10 ** 6)).padStart(6, "0");
    await emailService.sendForgotPasswordOTP(email, generatedOTP);

    await Admin.update(
      { otp: generatedOTP, is_otp_valid: true },
      { where: { email: user.email } }
    );
    // The code is valid for 10 minutes and 5 attempts
    otpGuard.issue(`admin-otp:${user.id}`, otpGuard.ADMIN_OTP_TTL_MS);
    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const verifyOTP = async (email, otp, otp_type) => {
  try {
    if (!email || !otp) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please Enter Required Fields : [email, otp]"
      );
    }

    const user = await Admin.findOne({ where: { email: email } });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email");
    }

    if (user.is_otp_valid === false) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invalid OTP Entered");
    }

    const guardKey = `admin-otp:${user.id}`;
    const invalidateOtp = async () => {
      otpGuard.clear(guardKey);
      user.is_otp_valid = false;
      await user.save();
    };

    if (!otpGuard.isActive(guardKey)) {
      await invalidateOtp();
      throw new ApiError(httpStatus.BAD_REQUEST, "OTP has expired. Please request a new one.");
    }

    if (!otpGuard.sameCode(otp, user.otp)) {
      if (otpGuard.recordFailure(guardKey, otpGuard.ADMIN_OTP_TTL_MS)) {
        await invalidateOtp();
        throw new ApiError(
          httpStatus.TOO_MANY_REQUESTS,
          "Too many incorrect attempts. Please request a new OTP.",
        );
      }
      throw new ApiError(httpStatus.NOT_FOUND, "Invalid OTP Entered");
    }

    otpGuard.clear(guardKey);
    let token = "";
    if (otp_type === otpTypes.FORGOT_PASSWORD) {
      token = jwt.sign(
        {
          id: user.id,
          role_id: user.role_id,
          department_id: user.department_id,
          is_backlisted: false,
        },
        Buffer.from(config.jwt.secret, "hex"),
        { algorithm: "HS256", expiresIn: `${config.jwt.adminResetExpirationDays}d` }
      );
      user.remember_token = token;
    }
    user.is_otp_valid = false;
    await user.save();
    return token ? { token } : "";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const forgotAdminPassword = async (reqBody) => {
  try {
    const { email, password, confirm_password, token } = reqBody;
    if (!email || !password || !confirm_password || !token) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please Enter Required Fields : [ email, password, confirm_password, token ]"
      );
    }

    const user = await Admin.findOne({
      where: { email: email, remember_token: token, is_active: true },
    });
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invalid Email or Token");
    }

    if (password !== confirm_password) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "New Password and Confirm Password Must Be Equal"
      );
    }

    let salt = bcrypt.genSaltSync(10);
    const userObj = {
      password: bcrypt.hashSync(confirm_password, salt),
      remember_token: null,
    };

    const isUserPasswordUpdate = await Admin.update(userObj, {
      where: { id: user?.id },
    });

    if (!isUserPasswordUpdate) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to Change Password."
      );
    }
    return "Password Changed Successfully.";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const getProfile = async (body) => {
  const { user } = body;
  let result = "";

  result = await Admin.findOne({
    include: [
      {
        model: Role,
        as: "admin_role",
      },
    ],
    where: { id: user?.id, is_active: true },
  });
  if (!result)
    throw new ApiError(httpStatus.BAD_REQUEST, "Failed to Get Profile.");

  return result;
};

const findAdminById = async (id) => {
  const adminDoc = await Admin.findOne({
    where: { id: id },
    include: [
      {
        model: Role,
        as: "admin_role",
      },
    ],
  });
  return adminDoc ? adminDoc : {};
};

const updateAdmin = async (reqBody) => {
  const adminDoc = await Admin.findOne({
    where: {
      id: reqBody.admin_id,
    },
  });

  if (
    reqBody.name &&
    reqBody.name !== "" &&
    typeof reqBody.name !== "undefined"
  ) {
    adminDoc["name"] = reqBody.name;
  }

  if (
    reqBody.mobile &&
    reqBody.mobile !== "" &&
    typeof reqBody.mobile !== "undefined"
  ) {
    adminDoc["mobile"] = reqBody.mobile;
  }

  if (
    reqBody.email &&
    reqBody.email !== "" &&
    typeof reqBody.email !== "undefined"
  ) {
    adminDoc["email"] = reqBody.email;
  }
  if (
    reqBody.role_id &&
    reqBody.role_id !== "" &&
    typeof reqBody.role_id !== "undefined"
  ) {
    adminDoc["role_id"] = reqBody.role_id;
  }

  await adminDoc.save();
  return adminDoc ? adminDoc : {};
};

const deleteAdmin = async (reqBody) => {
  const admin = await Admin.findOne({
    where: {
      id: reqBody.admin_id,
    },
  });
  if (!admin) {
    throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
  }
  await admin.destroy({
    where: {
      id: reqBody.admin_id,
      is_active: true,
    },
  });
};

const getAllAdmins = async () => {
  try {
    const userDoc = await Admin.findAll({
      where: { is_active: true },
      include: [
        {
          model: Role,
          as: "admin_role",
        },
      ],
    });

    if (!userDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all User <=|"
      );
    }

    return userDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  createAdminUser,
  loginAdminUser,
  resetAdminPassword,
  sendOTP,
  verifyOTP,
  forgotAdminPassword,
  getAllAdmins,
  findAdminById,
  updateAdmin,
  deleteAdmin,
  getProfile,
};
