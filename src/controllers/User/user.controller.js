/** @format */

const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { userOpService } = require("../../services");
const pick = require("../../utils/pick");
const responseWrapper = require("../../config/responseWrapper");

const getProfile = catchAsync(async (req, res) => {
	const response = await userOpService.getProfile(req.body, req.headers);
	return responseWrapper(res, response, "");
});

const updateUserProfile = catchAsync(async (req, res) => {
	const body = pick(req.body, ["user", "name", "mobile"]);
	const response = await userOpService.updateUserProfile(body, req.files);
	return responseWrapper(res, response, "Profile Updated Successfully.");
});

const deactivateAccount = catchAsync(async (req, res) => {
	const response = await userOpService.deactivateAccount(req.body, req.headers);
	return responseWrapper(res, response, "Account Successfully Deactivated.");
});

const notificationToogle = catchAsync(async (req, res) => {
	const body = pick(req.body, ["user"]);
	const response = await userOpService.notificationToogle(body);
	const message =
		response.notification_status === true
			? "Notification turned On!"
			: "Notification turned Off!";
	return responseWrapper(res, "", message);
});

const addNewAddress = catchAsync(async (req, res) => {
	await userOpService.addNewAddress(req.body, req.headers);
	return responseWrapper(
		res,
		"",
		"New Address Added Successfully.",
		httpStatus.CREATED
	);
});

const editAddress = catchAsync(async (req, res) => {
	await userOpService.editAddress(req.body);
	return responseWrapper(
		res,
		"",
		"Address Updated Successfully.",
		httpStatus.CREATED
	);
});

const deleteAddress = catchAsync(async (req, res) => {
	let response = await userOpService.deleteAddress(req.body, req.params.id);
	return responseWrapper(res, response, "Address Deleted.", httpStatus.OK);
});

const getAllUserAddress = catchAsync(async (req, res) => {
	const bookings = await userOpService.getAllUserAddress(req.body);
	return responseWrapper(res, bookings, "");
});

const getUserAddressById = catchAsync(async (req, res) => {
	const bookings = await userOpService.getUserAddressById(req.params.id);
	return responseWrapper(res, bookings, "");
});

const getUserAddressByUserId = catchAsync(async (req, res) => {
	const bookings = await userOpService.getUserAddressByUserId(req.params.id);
	return responseWrapper(res, bookings, "");
});

const createUserConsent = catchAsync(async (req, res) => {
	const response = await userOpService.createUserConsent(req.body);
	return responseWrapper(res, response, "User Consent Created Successfully.");
});



module.exports = {
	getProfile,
	updateUserProfile,
	deactivateAccount,
	notificationToogle,
	addNewAddress,
	editAddress,
	deleteAddress,
	getAllUserAddress,
	getUserAddressById,
	getUserAddressByUserId,
	createUserConsent
};
