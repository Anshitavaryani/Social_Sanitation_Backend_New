const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { reviewService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const postReviewAndRating = catchAsync(async (req, res) => {
	const data = await reviewService.postReviewAndRating(req.body);
	return responseWrapper(
		res,
		data,
		"Succssfully posted review and ratings.",
		httpStatus.CREATED
	);
});

const updateReviewAndRating = catchAsync(async (req, res) => {
	const data = await reviewService.updateReviewAndRating(req.body);
	return responseWrapper(
		res,
		data,
		"Succssfully updated review and ratings.",
		httpStatus.CREATED
	);
});

const deleteReviewAndRating = catchAsync(async (req, res) => {
	await reviewService.deleteReviewAndRating(req.params.id);
	return responseWrapper(res, "", "Deleted Successfull.");
});

const getReviewsAndRatings = catchAsync(async (req, res) => {
	const courses = await reviewService.getReviewsAndRatings(req.body);
	return responseWrapper(res, courses, "");
});

const getAllReviewsAndRatings = catchAsync(async (req, res) => {
	const courses = await reviewService.getAllReviewsAndRatings(req.body);
	return responseWrapper(res, courses, "");
});

module.exports = {
	postReviewAndRating,
	updateReviewAndRating,
	deleteReviewAndRating,
    getReviewsAndRatings,
    getAllReviewsAndRatings
};
