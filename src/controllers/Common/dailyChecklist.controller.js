/** @format */

const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { dailyChecklistService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createDailyChecklist = catchAsync(async (req, res) => {
	await dailyChecklistService.createDailyChecklist(req.body);
	return responseWrapper(
		res,
		"",
		"New Service Created Successfully.",
		httpStatus.CREATED
	);
});

const createOrUpdateChecklistMainTitle = catchAsync(async (req, res) => {
	await dailyChecklistService.createOrUpdateChecklistMainTitle(req.body);
	return responseWrapper(
		res,
		"",
		"New Service Created Successfully.",
		httpStatus.CREATED
	);
});

const getChecklistMainTitle = catchAsync(async (req, res) => {
	const services = await dailyChecklistService.getChecklistMainTitle();
	return responseWrapper(res, services, "", httpStatus.OK);
});

const getDailyChecklist = catchAsync(async (req, res) => {
	const services = await dailyChecklistService.getDailyChecklist();
	return responseWrapper(res, services, "", httpStatus.OK);
});

const findDailyChecklistById = catchAsync(async (req, res) => {
	const serviceDoc = await dailyChecklistService.findDailyChecklistById(
		req.params.id
	);
	return responseWrapper(res, serviceDoc, "");
});

const updateDailyChecklist = catchAsync(async (req, res) => {
	const serviceDoc = await dailyChecklistService.updateDailyChecklist(
		req.body,
		req.params.id
	);
	return responseWrapper(
		res,
		serviceDoc,
		"Service Updated Successfully",
		httpStatus.OK
	);
});

const deleteDailyChecklist = catchAsync(async (req, res) => {
	await dailyChecklistService.deleteDailyChecklist(req.body);
	return responseWrapper(res, "", "Deleted Successfull.");
});

const markDailyChecklistItemAsCompleted = catchAsync(async (req, res) => {
	await dailyChecklistService.markDailyChecklistItemAsCompleted(req.body,req.params.id);
	return responseWrapper(
		res,
		"",
		"Booking updated Successfully.",
		httpStatus.CREATED
	);
});

const getDailyChecklistWithTodayStatus = catchAsync(async (req, res) => {
	const services = await dailyChecklistService.getDailyChecklistWithTodayStatus(req.body);
	return responseWrapper(res, services, "", httpStatus.OK);
});


const getWeeklyChecklistWithStatus = catchAsync(async (req, res) => {
	const services = await dailyChecklistService.getWeeklyChecklistWithStatus(req.body);
	return responseWrapper(res, services, "", httpStatus.OK);
});

const getJanitors = catchAsync(async (req, res) => {
	const services = await dailyChecklistService.getJanitors();
	return responseWrapper(res, services, "", httpStatus.OK);
});

module.exports = {
	createDailyChecklist,
	createOrUpdateChecklistMainTitle,
	getDailyChecklist,
	findDailyChecklistById,
	updateDailyChecklist,
	deleteDailyChecklist,
	markDailyChecklistItemAsCompleted,
	getDailyChecklistWithTodayStatus,
	getChecklistMainTitle,
	getWeeklyChecklistWithStatus,
	getJanitors
};
