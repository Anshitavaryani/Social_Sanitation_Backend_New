/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { formService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const submitForm = catchAsync(async (req, res) => {
	await formService.submitForm(req.body,req.files);
	return responseWrapper(res, "", "Form submitted successfully", httpStatus.CREATED);
});

const getAllForm = catchAsync(async (req, res) => {
    const contactUs = await formService.getAllForm();
    return responseWrapper(res, contactUs, '');
});

const getFormById = catchAsync(async (req, res) => {
    const contactUs = await formService.getFormById(req.params.id);
    return responseWrapper(res, contactUs, '');
});

const deleteForm = catchAsync(async (req, res) => {
	const result = await formService.deleteForm(req.body.ids);

	return responseWrapper(
		res,
		result,
		"Forms deleted successfully."
	);
});

const getHiringFormsByEmail = catchAsync(async (req, res) => {
  const { email, name } = req.query;

  const response =
    await formService.getHiringFormsByEmail(email, name);

  return responseWrapper(
    res,
    response,
    "Hiring forms fetched successfully",
    httpStatus.OK,
  );
});

module.exports = {
	submitForm,
	getAllForm,
	getFormById,
	deleteForm,
	getHiringFormsByEmail
};
