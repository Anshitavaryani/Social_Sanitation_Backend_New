const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { adminAuthService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const createAdminUser = catchAsync(async (req, res) => {
  await adminAuthService.createAdminUser(req.body);
  return responseWrapper(
    res,
    "",
    "Admin Created Successfully.",
    httpStatus.CREATED
  );
});

const loginAdminUser = catchAsync(async (req, res) => {
  const response = await adminAuthService.loginAdminUser(req.body);
  responseWrapper(res, response, "", httpStatus.OK);
});

const resetAdminPassword = catchAsync(async (req, res) => {
  const response = await adminAuthService.resetAdminPassword(req.body);
  responseWrapper(res, response, "", httpStatus.OK);
});

const sendOTP = catchAsync(async (req, res) => {
  await adminAuthService.sendOTP(req.body.email);
  responseWrapper(res, "", "OTP has been Sent To Your Email", httpStatus.OK);
});

const verifyOTP = catchAsync(async (req, res) => {
  const status = await adminAuthService.verifyOTP(
    req.body.email,
    req.body.otp,
    req.body.otp_type
  );
  if (!status) {
    responseWrapper(
      res,
      "",
      "Ineternal Server Error",
      httpStatus.INTERNAL_SERVER_ERROR
    );
  }
  responseWrapper(res, status, "OTP has been verified", httpStatus.OK);
});

const forgotAdminPassword = catchAsync(async (req, res) => {
  const response = await adminAuthService.forgotAdminPassword(req.body);
  responseWrapper(res, response, "", httpStatus.OK);
});

const getProfile = catchAsync(async (req, res) => {
  const response = await adminAuthService.getProfile(req.body);
  return responseWrapper(res, response, "Successfully get profile");
});

const getAllAdmins = catchAsync(async (req, res) => {
  const users = await adminAuthService.getAllAdmins();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

// App users get an admin's display fields only (name, contact, role); admins get the whole row
const ADMIN_FIELDS_FOR_APP_USERS = ["id", "role_id", "name", "email", "mobile"];

const findAdminById = catchAsync(async (req, res) => {
  const adminDoc = await adminAuthService.findAdminById(req.query.id);
  if (req.body.user_type === "ADMIN" || !adminDoc?.id) {
    return responseWrapper(res, adminDoc, "", httpStatus.OK);
  }
  const shown = Object.fromEntries(ADMIN_FIELDS_FOR_APP_USERS.map((field) => [field, adminDoc[field] ?? null]));
  shown.admin_role = adminDoc.admin_role ? { id: adminDoc.admin_role.id, name: adminDoc.admin_role.name } : null;
  return responseWrapper(res, shown, "", httpStatus.OK);
});

const updateAdmin = catchAsync(async (req, res) => {
  const response = await adminAuthService.updateAdmin(req.body, req.admin);
  return responseWrapper(res, response, "Admin Updated Successfully");
});

const deleteAdmin = catchAsync(async (req, res) => {
  await adminAuthService.deleteAdmin(req.body, req.admin);
  res.status(httpStatus.OK).send({
    code: httpStatus.NO_CONTENT,
    message: "Deleted Successfull.",
    data: "",
  });
});

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
