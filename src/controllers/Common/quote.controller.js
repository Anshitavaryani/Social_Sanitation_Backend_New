/** @format */

const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { quoteService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");


const createQuestions = catchAsync(async (req, res) => {
	const form = await quoteService.createQuestions(req.body);
	return responseWrapper(
		res,
		form,
		"Form Created Successfully",
		httpStatus.CREATED
	);
});

const getAllQuestions = catchAsync(async (req, res) => {
	const formDetails = await quoteService.getAllQuestions();
	return responseWrapper(
		res,
		formDetails,
		"Form Details Retrieved",
		httpStatus.OK
	);
});

const editQuestion = catchAsync(async (req, res) => {
	const form = await quoteService.editQuestion(req.body,req.params.id);
	return responseWrapper(
		res,
		form,
		"Form updated Successfully",
		httpStatus.CREATED
	);
});

const deleteQuestion = catchAsync(async (req, res) => {
	await quoteService.deleteQuestion(req.params.id);
	res.status(httpStatus.OK).send({
		code: httpStatus.NO_CONTENT,
		message: "Deleted Successfull.",
		data: "",
	});
});

const getQuoteRequests = catchAsync(async (req, res) => {
	const formDetails = await quoteService.getQuoteRequests();
	return responseWrapper(
		res,
		formDetails,
		"Form Details Retrieved",
		httpStatus.OK
	);
});

const updateStatus = catchAsync(async (req, res) => {
	const form = await quoteService.updateStatus(req.body,req.params.id);
	return responseWrapper(
		res,
		form,
		"Form updated Successfully",
		httpStatus.CREATED
	);
});


// user apis
const submitForm = catchAsync(async (req, res) => {
	const form = await quoteService.submitForm(req.body);
	return responseWrapper(
		res,
		form,
		"Form Submitted Successfully",
		httpStatus.CREATED
	);
});

const getQuoteRequestsByUser = catchAsync(async (req, res) => {
	const formDetails = await quoteService.getQuoteRequestsByUser(req.body);
	return responseWrapper(
		res,
		formDetails,
		"Form Details Retrieved",
		httpStatus.OK
	);
});





module.exports = {
	createQuestions,
    getAllQuestions,
    editQuestion,
    deleteQuestion,
	getQuoteRequests,
	updateStatus,

	submitForm,
    getQuoteRequestsByUser,
};
