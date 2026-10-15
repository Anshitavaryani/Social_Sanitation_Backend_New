/** @format */

const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { BDMService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const assignUser = catchAsync(async (req, res) => {
	await BDMService.assignUser(req.body);
	return responseWrapper(
		res,
		"",
		"User assigned to BDM successfully.",
		httpStatus.CREATED
	);
});

const getAllBDMs = catchAsync(async (req, res) => {
	const bookings = await BDMService.getAllBDMs();
	return responseWrapper(res, bookings, "");
});

const deleteBDM = catchAsync(async (req, res) => {
	await BDMService.deleteBDM(req.body);
	res.status(httpStatus.OK).send({
		code: httpStatus.NO_CONTENT,
		message: "Deleted Successfull.",
		data: "",
	});
});

const getBDMByUserIdController = async (req, res) => {
	const data = await BDMService.getBDMByUserId(req.params.user_id);
	res.json({ success: true, data });
};

const getAllUsers = catchAsync(async (req, res) => {
	const bookings = await BDMService.getAllUsers();
	return responseWrapper(res, bookings, "");
});

const getAllUsersByBDMId = catchAsync(async (req, res) => {
	const bookings = await BDMService.getAllUsersByBDMId(req.params.id);
	return responseWrapper(res, bookings, "");
});

const getAllBookingsByBDMId = catchAsync(async (req, res) => {
	const bookings = await BDMService.getAllBookingsByBDMId(req.body);
	return responseWrapper(res, bookings, "");
});

module.exports = {
	assignUser,
	getAllBDMs,
	getAllUsers,
	deleteBDM,
	getAllUsersByBDMId,
	getAllBookingsByBDMId,
	getBDMByUserIdController
};
