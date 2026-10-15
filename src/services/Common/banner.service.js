/** @format */

const { status: httpStatus } = require("http-status");

const { BannerAttachment } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createBanner = async (reqBody, files) => {
	if (
		files &&
		Object.keys(files).length !== 0 &&
		files.images &&
		files.images.length !== 0
	) {
		let currImage = files.images[0];
		const calculatorObj = {
			title: "Banner Image",
			file_type: "Image",
			file_name: currImage.filename,
			file_uri: "/images",
			file_size: currImage.size,
		};

		const bannerDoc = await BannerAttachment.create(calculatorObj);

		if (!bannerDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Banner Image"
			);
		}

		return true;
	} else {
		throw new ApiError(
			httpStatus.BAD_REQUEST,
			"No images found in the request"
		);
	}
};

const getAllBannerImgae = async () => {
	const bannerDocs = await BannerAttachment.findAll({
		where: { is_active: 1 },
	});

	if (!bannerDocs) {
		throw new ApiError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"Failed to get all Banners"
		);
	}

	const bannerCount = bannerDocs.length; // Getting the count of banner documents

	return { banners: bannerDocs, count: bannerCount };
};

const getAllBannerImgaeByAdmin = async () => {
	const bannerDocs = await BannerAttachment.findAll({
		where: { is_active: 1 },
	});

	if (!bannerDocs) {
		throw new ApiError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"Failed to get all Banners"
		);
	}

	const bannerCount = bannerDocs.length; // Getting the count of banner documents

	return { banners: bannerDocs, count: bannerCount };
};

const findBannerImgaeById = async (id) => {
	try {
		const contentDoc = await BannerAttachment.findByPk(id);
		return contentDoc ? contentDoc : [];
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateBannerImgaeById = async (reqBody, files, id) => {
	let result = "";

	const contentDoc = await BannerAttachment.findByPk(id);
	if (!contentDoc) {
		throw new ApiError(httpStatus.NOT_FOUND, "Content Id not found");
	}

	try {
		result = await contentDoc.save();
		if (
			files &&
			Object.keys(files).length !== 0 &&
			files.images &&
			files.images.length !== 0
		) {
			for (let i = 0; i < files.images.length; i++) {
				let currImage = files.images[i];
				const bannerAttachmentObj = {
					about_us_id: contentDoc.id,
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				};
				await updateBannerImgaeById.create(bannerAttachmentObj);
			}
		}
		("");
		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const deleteBannerImgaeById = async (id) => {
	try {
		const contentDoc = await BannerAttachment.findByPk(id);
		if (!contentDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Content not found");
		}
		return await contentDoc.destroy();
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

module.exports = {
	createBanner,
	getAllBannerImgae,
	getAllBannerImgaeByAdmin,
	findBannerImgaeById,
	updateBannerImgaeById,
	deleteBannerImgaeById,
};
