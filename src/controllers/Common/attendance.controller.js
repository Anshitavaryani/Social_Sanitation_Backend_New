/** @format */

const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { attendanceService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

// attendence
const clockIn = catchAsync(async (req, res) => {
	await attendanceService.clockIn(req.body, req.headers, req.files);
	return responseWrapper(res, "", "Clock-in successful.", httpStatus.CREATED);
});

const clockOut = catchAsync(async (req, res) => {
	await attendanceService.clockOut(req.body, req.headers, req.files);
	return responseWrapper(res, "", "Clock-out successful", httpStatus.CREATED);
});

const applyBreak = catchAsync(async (req, res) => {
	await attendanceService.applyBreak(req.body, req.headers);
	return responseWrapper(res, "", "Break Applied successful", httpStatus.CREATED);
});

const checkIfOnBreak = catchAsync(async (req, res) => {
	const attendance = await attendanceService.checkIfOnBreak(
		req.body,
		req.headers
	);
	return responseWrapper(res, attendance, "Clock-in Sttaus");
});

const checkClockInStatus = catchAsync(async (req, res) => {
	const attendance = await attendanceService.checkClockInStatus(
		req.body,
		req.headers
	);
	return responseWrapper(res, attendance, "Clock-in Sttaus");
});

const getAttendance = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAttendance(req.body, req.headers);
	return responseWrapper(res, bookings, "Attendance records fetched");
});

// leave
const applyForLeave = catchAsync(async (req, res) => {
	await attendanceService.applyForLeave(req.body, req.headers);
	return responseWrapper(
		res,
		"",
		"Leave request submitted.",
		httpStatus.CREATED
	);
});

const getAllUserLeaves = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAllUserLeaves(
		req.body,
		req.headers
	);
	return responseWrapper(res, bookings, "Leave records fetched");
});

// admin apis
const updateLeaveStatus = catchAsync(async (req, res) => {
	await attendanceService.updateLeaveStatus(req.body, req.params.id);
	return responseWrapper(res, "", "Leave request updated.", httpStatus.CREATED);
});

const getAllLeaveRequest = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAllLeaveRequest();
	return responseWrapper(res, bookings, "Leave records fetched");
});

const getAttendanceByUserId = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAttendanceByUserId(
		req.body,
		req.params.id
	);
	return responseWrapper(res, bookings, "Leave records fetched");
});

const getAllAttendance = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAllAttendance(req.body);
	return responseWrapper(res, bookings, "Attendance records fetched");
});

const getTodayAttendanceStats = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getTodayAttendanceStats(req.body);
	return responseWrapper(res, bookings, "Today's attendance stats fetched");
});

const getDailyPresenceForMonth = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getDailyPresenceForMonth(req.body);
	return responseWrapper(res, bookings, "Daily presence records fetched");
});

const getAllBreaks = catchAsync(async (req, res) => {
	const bookings = await attendanceService.getAllBreaks(req.body);
	return responseWrapper(res, bookings, "Break records fetched");
});

const manualClockInOut = catchAsync(async (req, res) => {
	const bookings = await attendanceService.manualClockInOut(req.body);
	return responseWrapper(res, bookings, "Manual clock in/out successful");
});

module.exports = {
	clockIn,
	clockOut,
	applyBreak,
	checkIfOnBreak,
	checkClockInStatus,
	getAttendance,
	applyForLeave,
	getAllUserLeaves,
	updateLeaveStatus,
	getAllLeaveRequest,
	getAttendanceByUserId,
	getAllAttendance,
	getTodayAttendanceStats,
	getDailyPresenceForMonth,
	getAllBreaks,
	manualClockInOut
};
