/** @format */

const { status: httpStatus } = require("http-status");

const { TrendingVideoAttachment } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createTrendingVideo = async (reqBody) => {
	try {
		if (!reqBody.title || !reqBody.video_link) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Title and video link are required"
			);
		}

		const videoDoc = await TrendingVideoAttachment.create({
			title: reqBody.title,
			video_link: reqBody.video_link,
		});

		return videoDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllTrendingVideos = async (reqBody) => {
	try {
		const { user } = reqBody;
		const contentDoc = await TrendingVideoAttachment.findAll({
			where: { is_active: 1 },
		});
		if (!contentDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to get all Content"
			);
		}
		return contentDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const findTrendingVideoById = async (id) => {
	try {
		const contentDoc = await TrendingVideoAttachment.findByPk(id, {});
		return contentDoc ? contentDoc : [];
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateTrendingVideo = async (reqBody, id) => {
	try {
		// Find the existing video record
		const contentDoc = await TrendingVideoAttachment.findByPk(id);
		if (!contentDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Trending Video not found");
		}

		// Update title if provided
		if (
			reqBody.title &&
			typeof reqBody.title !== "undefined" &&
			reqBody.title !== ""
		) {
			contentDoc.title = reqBody.title;
		}

		// Update video link if provided
		if (
			reqBody.video_link &&
			typeof reqBody.video_link !== "undefined" &&
			reqBody.video_link !== ""
		) {
			contentDoc.video_link = reqBody.video_link;
		}

		// Save updated record
		await contentDoc.save();

		return contentDoc; // return updated record
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const deleteTrendingVideo = async (body) => {
	try {
		// Validate heading_id
		if (!Array.isArray(body.heading_id) || body.heading_id.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid heading_id");
		}

		// Ensure all IDs are trimmed and filtered
		const userIds = body.heading_id
			.map((id) => String(id).trim())
			.filter(Boolean);

		if (userIds.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No valid user IDs provided");
		}

		// Find all users with the given IDs
		const users = await TrendingVideoAttachment.findAll({
			where: {
				id: userIds,
			},
		});

		if (users.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No users found");
		}

		// Send email notifications and delete users
		await Promise.all(
			users.map(async (user) => {
				// Delete the user
				await user.destroy();
			})
		);
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

module.exports = {
	createTrendingVideo,
	getAllTrendingVideos,
	findTrendingVideoById,
	updateTrendingVideo,
	deleteTrendingVideo,
};
