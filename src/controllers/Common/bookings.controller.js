/** @format */

const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { bookingService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

// ************************************USER API****************************************************
const createBooking = catchAsync(async (req, res) => {
	const bookingResult = await bookingService.createBooking(req.body,req.files, req.headers);
	return responseWrapper(
		res,
		bookingResult,
		"New Booking Created Successfully.",
		httpStatus.CREATED
	);
});

const getAllUserBooking = catchAsync(async (req, res) => {
	const bookings = await bookingService.getAllUserBooking(req.body);
	return responseWrapper(res, bookings, "");
});

const getBookingById = catchAsync(async (req, res) => {
	const bookings = await bookingService.getBookingById(req.params.id);
	return responseWrapper(res, bookings, "");
});

const cancelBookingbyUser = catchAsync(async (req, res) => {
	let response = await bookingService.cancelBookingbyUser(req.body);
	return responseWrapper(res, response, "Booking Cancelled.", httpStatus.OK);
});



// **************************************DRIVER API****************************************************

const getAllEmployeeBooking = catchAsync(async (req, res) => {
	const bookings = await bookingService.getAllEmployeeBooking(
		req.body,
		req.body.booking_status
	);
	return responseWrapper(res, bookings, "");
});

const updateBookingStatusByEmployee = catchAsync(async (req, res) => {
	await bookingService.updateBookingStatusByEmployee(req.body);
	return responseWrapper(
		res,
		"",
		"Booking updated Successfully.",
		httpStatus.CREATED
	);
});

const uploadImages = catchAsync(async (req, res) => {
	await bookingService.uploadImages(req.body, req.files);
	return responseWrapper(
		res,
		"",
		"Booking updated Successfully.",
		httpStatus.CREATED
	);
});

const getAllServiceCheckList = catchAsync(async (req, res) => {
	const bookings = await bookingService.getAllServiceCheckList(
		req.body,
		req.params.id
	);
	return responseWrapper(res, bookings, "");
});

const getAllServiceCheckListByUserForBookingId = catchAsync(async (req, res) => {
	const bookings = await bookingService.getAllServiceCheckListByUserForBookingId(
		req.params.id
	);
	return responseWrapper(res, bookings, "");
});

const getAllServiceCheckListByBookingId = catchAsync(async (req, res) => {
	const bookings = await bookingService.getAllServiceCheckListByBookingId(
		req.params.id
	);
	return responseWrapper(res, bookings, "");
});


const markChecklistItemAsCompleted = catchAsync(async (req, res) => {
	await bookingService.markChecklistItemAsCompleted(req.body,req.params.id);
	return responseWrapper(
		res,
		"",
		"Booking updated Successfully.",
		httpStatus.CREATED
	);
});

const getTodaysBooking = catchAsync(async (req, res) => {
	const bookings = await bookingService.getTodaysBooking(req.body);
	return responseWrapper(res, bookings, "");
});

const getCompletedBooking = catchAsync(async (req, res) => {
	const bookings = await bookingService.getCompletedBooking(req.body);
	return responseWrapper(res, bookings, "");
});

module.exports = {
	createBooking,
	getAllUserBooking,
	getBookingById,
	cancelBookingbyUser,

	updateBookingStatusByEmployee,
	markChecklistItemAsCompleted,
	uploadImages,
	getAllServiceCheckList,
	getAllServiceCheckListByUserForBookingId,
	getAllServiceCheckListByBookingId,
	getAllEmployeeBooking,
	getTodaysBooking,
	getCompletedBooking,
};
