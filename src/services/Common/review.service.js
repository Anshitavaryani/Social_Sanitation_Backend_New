const { status: httpStatus } = require("http-status");
const { User, Profile, Service, ServiceReview } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Sequelize } = require("sequelize");

const postReviewAndRating = async (reqBody) => {
	try {
		const { user } = reqBody;
		const serviceDoc = await Service.findOne({
			where: { id: reqBody.service_id },
		});
		if (!serviceDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Service not found");
		}

			// Check if the user has a valid booking for the service
	

		const newReviewObj = {
			user_id: user.id,
			service_id: reqBody.service_id,
			review: reqBody.review,
			rating: reqBody.rating,
		};

		const createdReviewDoc = await ServiceReview.create(newReviewObj);
		if (!createdReviewDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Failed to create review");
		}

		const ratings = await ServiceReview.findAll({
			where: { service_id: reqBody.service_id, is_active: true },
			attributes: [
				[Sequelize.fn("AVG", Sequelize.col("rating")), "average_rating"],
			],
			raw: true,
		});

		const averageRating = ratings[0].average_rating;
		await Service.update(
			{ average_rating: averageRating },
			{ where: { id: reqBody.service_id } }
		);

		// Calculate the count of users who have rated the service and update it in the service table
		const ratingCount = await ServiceReview.count({
			where: { service_id: reqBody.service_id, is_active: 1 },
		});

		await Service.update(
			{ rating: ratingCount },
			{ where: { id: reqBody.service_id } }
		);

		return newReviewObj;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateReviewAndRating = async (reqBody) => {
	try {
		const { user } = reqBody;
		const existingReviewDoc = await ServiceReview.findOne({
			where: { service_id: reqBody.service_id, user_id: user.id, is_active: true },
		});
		if (!existingReviewDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Review and rating not found");
		}

		// Update the existing review
		existingReviewDoc.review = reqBody.review;
		existingReviewDoc.rating = reqBody.rating;
		await existingReviewDoc.save();

		// Calculate the new average rating for the Service and update it in the Services table
		const ratings = await ServiceReview.findAll({
			where: { service_id: reqBody.service_id, is_active: true },
			attributes: [
				[Sequelize.fn("AVG", Sequelize.col("rating")), "average_rating"],
			],
			raw: true,
		});

		const averageRating = ratings[0].average_rating;
		await Service.update(
			{ average_rating: averageRating },
			{ where: { id: reqBody.service_id } }
		);

		// Calculate the count of users who have rated the Service and update it in the Services table
		const ratingCount = await ServiceReview.count({
			where: { service_id: reqBody.service_id, is_active: true },
		});

		await Service.update(
			{ rating: ratingCount },
			{ where: { id: reqBody.service_id } }
		);

		return existingReviewDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const deleteReviewAndRating = async (id) => {
	try {
		const reviewDoc = await ServiceReview.findByPk(id);
		if (!reviewDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Review not found");
		}

		const serviceId = reviewDoc.service_id;
		await reviewDoc.destroy();

		// Recalculate average rating for the Service and update it in the Services table
		const ratings = await ServiceReview.findAll({
			where: { service_id: serviceId, is_active: true },
			attributes: [
				[Sequelize.fn("AVG", Sequelize.col("rating")), "average_rating"],
			],
			raw: true,
		});

		const averageRating = ratings[0].average_rating || 0; // If no ratings left, set average rating to 0
		await Service.update(
			{ average_rating: averageRating },
			{ where: { id: serviceId } }
		);

		// Calculate the count of users who have rated the course and update it in the courses table
		const ratingCount = await ServiceReview.count({
			where: { service_id: serviceId, is_active: true },
		});

		await Service.update(
			{ rating: ratingCount },
			{ where: { id: serviceId } }
		);
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getReviewsAndRatings = async (reqBody) => {
	try {
		const { user, service_id } = reqBody;

		if (!service_id) {
			throw new ApiError(httpStatus.BAD_REQUEST, "serviceId ID must be provided");
		}

		const result = await ServiceReview.findAll({
			where: { service_id: service_id, is_active: true },
			include: [
				{
					model: User,
					as: "reviews_user",
					attributes: ["id", "email"],
					required: false,
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
			],
			order: [
				[Sequelize.literal(`CASE WHEN ServiceReview.user_id = ${Number(user.id)} THEN 1 ELSE 2 END`), 'ASC'],
				["id", "DESC"]
			],
		});

		if (!result || result.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Data not found");
		}

		// Modify each review to include user_rating_provided field
		const modifiedResult = result.map(review => {
			return {
				...review.toJSON(), // Convert Sequelize model instance to plain object
				user_rating_provided: review.user_id === user.id
			};
		});


		return {
			success: true,
			status: httpStatus.OK,
			// is_rating_provided: userRatingProvided,
			data: modifiedResult
		};
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllReviewsAndRatings = async (reqBody) => {
	try {
		const result = await ServiceReview.findAll({
			where: { service_id: reqBody.service_id, is_active: true },
			include: [
				{
					model: User,
					as: "reviews_user",
					attributes: ["id", "email"],
					required: false,
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
			],
		});

		if (!result) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Data not found");
		}
		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

module.exports = {
	postReviewAndRating,
	updateReviewAndRating,
	deleteReviewAndRating,
	getReviewsAndRatings,
	getAllReviewsAndRatings,
};
