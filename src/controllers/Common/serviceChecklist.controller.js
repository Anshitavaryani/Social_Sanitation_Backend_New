/** @format */

const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { serviceChecklistService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createServiceChecklist = catchAsync(async (req, res) => {
	await serviceChecklistService.createServiceChecklist(req.body);
	return responseWrapper(
		res,
		"",
		"New Service Created Successfully.",
		httpStatus.CREATED
	);
});

const getAllServiceChecklist = catchAsync(async (req, res) => {
	const services = await serviceChecklistService.getAllServiceChecklist();
	return responseWrapper(res, services, "", httpStatus.OK);
});

const findServiceChecklistById = catchAsync(async (req, res) => {
	const serviceDoc = await serviceChecklistService.findServiceChecklistById(
		req.params.id
	);
	return responseWrapper(res, serviceDoc, "");
});

const updateServiceChecklist = catchAsync(async (req, res) => {
	const serviceDoc = await serviceChecklistService.updateServiceChecklist(
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

const deleteServiceChecklist = catchAsync(async (req, res) => {
	await serviceChecklistService.deleteServiceChecklist(req.body);
	return responseWrapper(res, "", "Deleted Successfull.");
});

module.exports = {
	createServiceChecklist,
	getAllServiceChecklist,
	findServiceChecklistById,
	updateServiceChecklist,
	deleteServiceChecklist,
};
