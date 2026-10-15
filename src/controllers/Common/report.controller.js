const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { reportService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");


const reportBooking = catchAsync(async (req, res) => {
	const response = await reportService.reportBooking(req.body,req.files, req.params.id);
	return responseWrapper(
		res,
		response,
		"Appointment Reported Successfully.",
		httpStatus.OK
	);
});

const getAllReport = catchAsync(async (req, res) => {
	const response = await reportService.getAllReport();
	return responseWrapper(res, response, "", httpStatus.OK);
});

const getAllUserReport = catchAsync(async (req, res) => {
	const response = await reportService.getAllUserReport(req.body, req.headers);
	return responseWrapper(res, response, "", httpStatus.OK);
});

const updateReportStatus = catchAsync(async (req, res) => {
	const response = await reportService.updateReportStatus(req.body);
	return responseWrapper(res, response, "Success");
});

module.exports = {
	reportBooking,
	getAllReport,
	getAllUserReport,
	updateReportStatus,
};
