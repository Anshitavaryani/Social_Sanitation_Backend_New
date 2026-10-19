const { status: httpStatus } = require("http-status");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { Admin, Role } = require("../../models");
const { Op } = require("sequelize");
const { ROLE } = require("../../config/roles");
const ApiError = require("../../utils/ApiError");
const config = require("../../config/config");
const { emailService } = require("../Common");
const { otpTypes, tokenTypes } = require("../../config/types");
const otpGuard = require("../../utils/otpGuard");
const validatePassword = require("../../helpers/validatePassword");
const { hashPassword } = require("../../utils/password");
const { OTP_RULES, PASSWORD_POLICY_MESSAGE } = require("../../config/rules");
const { generateTemporaryPassword } = require("../../utils/temporaryPassword");
const { sendAdminCredentials } = require("../Common/email.service");


const createAdminUser = async (userBody) => {
  try {
    const password = generateTemporaryPassword();
    const adminObj = {
      name: userBody.name,
      role_id: userBody.role_id,
      email: userBody.email,
      mobile:userBody.mobile,
      password: hashPassword(password),
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
    throw ApiError.from(error);
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

    const response = {
      id: user.id,
      name: user.name,
      email: user.email,
      token: token,
      role_id: user.role_id,
      // Google Calendar is gone; the flag stays for the panel builds that read it
      authorize: false,
    };

    return response;
  } catch (error) {
    throw ApiError.from(error);
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

    const userObj = {
      password: hashPassword(confirm_password),
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
    throw ApiError.from(error);
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
    const generatedOTP = otpGuard.generateOtpCode(OTP_RULES.ADMIN_CODE_DIGITS);
    await emailService.sendForgotPasswordOTP(email, generatedOTP);

    await Admin.update(
      { otp: generatedOTP, is_otp_valid: true },
      { where: { email: user.email } }
    );
    // The code is valid for 10 minutes and 5 attempts
    otpGuard.issue(`admin-otp:${user.id}`, otpGuard.ADMIN_OTP_TTL_MS);
    return true;
  } catch (error) {
    throw ApiError.from(error);
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
      // only good for POST /admin/auth/forgot-password (requireAdmin refuses its type)
      token = jwt.sign(
        { id: user.id, type: tokenTypes.RESET_PASSWORD },
        Buffer.from(config.jwt.secret, "hex"),
        { algorithm: "HS256", expiresIn: `${config.jwt.adminResetExpirationDays}d` }
      );
      user.remember_token = token;
    }
    user.is_otp_valid = false;
    await user.save();
    return token ? { token } : "";
  } catch (error) {
    throw ApiError.from(error);
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

    // the token verify-otp issued: signed here, not expired, a reset token
    let reset = null;
    try {
      reset = jwt.verify(token, Buffer.from(config.jwt.secret, "hex"), { algorithms: ["HS256"] });
    } catch {
      reset = null;
    }
    if (reset?.type !== tokenTypes.RESET_PASSWORD) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Your password reset session has expired. Please request a new OTP.");
    }

    // and the one stored for this admin, so it works once
    const user = await Admin.findOne({
      where: { id: reset.id, email: email, remember_token: token, is_active: true },
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

    if (!validatePassword(password)) {
      throw new ApiError(httpStatus.BAD_REQUEST, PASSWORD_POLICY_MESSAGE);
    }

    const userObj = {
      password: hashPassword(confirm_password),
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
    throw ApiError.from(error);
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

// Who may change or remove an admin account, the same rule as creating one (POST
// /admin/auth/register): another admin's account needs a super admin or an admin, and a super
// admin account, or the super admin role, needs a super admin. Admins edit their own name,
// mobile and email freely.
const assertMayManageAdmin = (caller, target, newRoleId) => {
  const callerRole = Number(caller.role_id);
  const roleChanges = newRoleId !== undefined && Number(newRoleId) !== Number(target.role_id);
  if ((Number(target.id) !== Number(caller.id) || roleChanges) && ![ROLE.SUPER_ADMIN, ROLE.ADMIN].includes(callerRole)) {
    throw new ApiError(httpStatus.FORBIDDEN, "Your admin role is not allowed to do this.");
  }
  if (roleChanges && Number(newRoleId) === ROLE.SUPER_ADMIN && callerRole !== ROLE.SUPER_ADMIN) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only a super admin can create another super admin.");
  }
  if (Number(target.role_id) === ROLE.SUPER_ADMIN && Number(target.id) !== Number(caller.id) && callerRole !== ROLE.SUPER_ADMIN) {
    throw new ApiError(httpStatus.FORBIDDEN, "Only a super admin can change or remove a super admin.");
  }
};

const updateAdmin = async (reqBody, caller) => {
  const adminDoc = await Admin.findOne({
    where: {
      id: reqBody.admin_id,
    },
  });
  if (!adminDoc) {
    throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
  }
  assertMayManageAdmin(caller, adminDoc, reqBody.role_id || undefined);

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
    const taken = await Admin.findOne({ where: { email: reqBody.email, is_active: true, id: { [Op.ne]: adminDoc.id } } });
    if (taken) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email already in use");
    }
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

const deleteAdmin = async (reqBody, caller) => {
  const admin = await Admin.findOne({
    where: {
      id: reqBody.admin_id,
    },
  });
  if (!admin) {
    throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
  }
  assertMayManageAdmin(caller, admin);
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
    throw ApiError.orInternal(error);
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
