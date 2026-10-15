/** @format */

const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { adminBookingService } = require("../../services");

const getAllBookings = catchAsync(async (req, res) => {
	const result = await adminBookingService.getAllBookings(req.body);
	return responseWrapper(res, result.data, "");
});

const getBookingById = catchAsync(async (req, res) => {
	const bookings = await adminBookingService.getBookingById(req.params.id);
	return responseWrapper(res, bookings, "");
});

const updateBookingStatus = catchAsync(async (req, res) => {
	let response = await adminBookingService.updateBookingStatus(req.body);
	return responseWrapper(
		res,
		response,
		"Booking Updated successfully.",
		httpStatus.CREATED,
	);
});

const checkBookingRequest = catchAsync(async (req, res) => {
	const bookings = await adminBookingService.checkBookingRequest();
	return responseWrapper(res, bookings, "");
});

const adminCreateBooking = catchAsync(async (req, res) => {
	let response = await adminBookingService.adminCreateBooking(req.body);
	return responseWrapper(
		res,
		response,
		"Booking Updated successfully.",
		httpStatus.CREATED,
	);
});

const adminCreateBookingForGuest = catchAsync(async (req, res) => {
	let response = await adminBookingService.adminCreateBookingForGuest(req.body);
	return responseWrapper(
		res,
		response,
		"Booking Updated successfully.",
		httpStatus.CREATED,
	);
});

const getMonthlyBookingCalendar = catchAsync(async (req, res) => {
	const bookings = await adminBookingService.getMonthlyBookingCalendar(
		req.body,
	);
	return responseWrapper(res, bookings, "");
});

const getDayOverview = catchAsync(async (req, res) => {
	const result = await adminBookingService.getDayOverview(req.body);
	return responseWrapper(res, result, "Day overview fetched successfully");
});

const getBookingOverviewById = catchAsync(async (req, res) => {
	const result = await adminBookingService.getBookingOverviewById(
		req.params.id,
	);
	return responseWrapper(res, result, "Booking overview fetched successfully");
});

const deleteBooking = catchAsync(async (req, res) => {
	const response = await adminBookingService.deleteBooking(req.body);

	// If service says booking not found, return 404
	if (!response.success) {
		return responseWrapper(res, null, response.message, httpStatus.NOT_FOUND);
	}

	// Otherwise, return success
	return responseWrapper(
		res,
		response,
		"Booking Deleted successfully.",
		httpStatus.OK,
	);
});



const getDayOverviewForGantt = catchAsync(async (req, res) => {
	const result = await adminBookingService.getDayOverviewForGantt(req.body);
	return responseWrapper(res, result, "Day overview fetched successfully");
});

const getEmployeeDayOverview = catchAsync(async (req, res) => {
	const result = await adminBookingService.getEmployeeDayOverview(req.body);
	return responseWrapper(res, result, "Day overview fetched successfully");
});

const getEmployeeRangeOverview = catchAsync(async (req, res) => {
	const result = await adminBookingService.getEmployeeRangeOverview(req.body);
	return responseWrapper(res, result, "Day overview fetched successfully");
});


const updateEmployeeTimesheet = catchAsync(async (req, res) => {
	let response = await adminBookingService.updateEmployeeTimesheet(req.body);
	return responseWrapper(
		res,
		response,
		"Employee timesheet updated successfully.",
		httpStatus.CREATED,
	);
});

const sendEmployeeTwoWeekSchedule = catchAsync(async (req, res) => {
	let response = await adminBookingService.sendEmployeeTwoWeekSchedule(req.body.employee_id);
	return responseWrapper(
		res,
		response,
		"Two week schedule sent successfully.",
		httpStatus.CREATED,
	);
});

module.exports = {
	getAllBookings,
	getBookingById,
	updateBookingStatus,
	checkBookingRequest,
	adminCreateBooking,
	getMonthlyBookingCalendar,
	deleteBooking,
	getDayOverview,
	getBookingOverviewById,
	adminCreateBookingForGuest,
	getDayOverviewForGantt,
	getEmployeeDayOverview,
	getEmployeeRangeOverview,
	updateEmployeeTimesheet,
	sendEmployeeTwoWeekSchedule
};
