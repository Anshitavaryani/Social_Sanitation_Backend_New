/** @format */

const { status: httpStatus } = require("http-status");

const {
	User,
	UserAttachment,
	Profile,
	UserAddress,
	Country,
	City,
	State,
	UserConsent,
} = require("../../models");
const ApiError = require("../../utils/ApiError");

const getProfile = async (body, headers) => {
	try {
		const { user } = body;
		const { role_id } = headers;
		let result = "";

		result = await User.findOne({
			attributes: [
				"id",
				"user_name",
				"email",
				"role_id",
				"sub_role_id",
				"status",
				"notification_status",
				"is_sync_by_google_calendar",
				"logout_image_required",
			],
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["name", "mobile", "is_active", "created_at","id","user_id"],
				},
				{
					model: UserAttachment,
					as: "user_attachments",
					attributes: [
						"id",
						"title",
						"file_type",
						"file_name",
						"file_uri",
						"role_id",
					],
					order: [["id", "desc"]],
					limit: 1,
				},
			],
			where: { id: user?.id, is_active: true, role_id: role_id },
		});
		if (!result)
			throw new ApiError(httpStatus.BAD_REQUEST, "Failed to Get Profile.");
		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const updateUserProfile = async (body, files) => {
	try {
		const { name, mobile, user } = body;

		let userObj = {};

		if (name && typeof name === "string" && name !== "" && user.name !== name)
			userObj["name"] = name;

		if (
			mobile &&
			typeof mobile === "string" &&
			mobile !== "" &&
			user.mobile !== mobile
		)
			userObj["mobile"] = mobile;

		const userDoc = await Profile.update(userObj, {
			where: { user_id: user?.id, is_active: true },
		});

		if (!userDoc)
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to Update Profile.",
			);

		let profileImage;

		if (
			files &&
			Object.keys(files).length !== 0 &&
			files.images &&
			files.images.length !== 0
		) {
			// Delete existing user attachments
			await UserAttachment.destroy({
				where: { user_id: user.id, title: "Profile Image" },
			});

			// Insert new images
			for (let i = 0; i < files.images.length; i++) {
				let currImage = files.images[i];
				const userAttachmentObj = {
					user_id: user.id,
					role_id: user.role_id,
					title: "Profile Image",
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				};
				await UserAttachment.create(userAttachmentObj);

				// Set profileImage variable to the updated image information
				profileImage = {
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				};
			}
		}

		const newUpdatedUserDoc = await User.findOne({ where: { id: user?.id } });

		// Include profile picture information in the returned user document
		if (profileImage) {
			newUpdatedUserDoc.dataValues.profileImage = profileImage;
		}

		return newUpdatedUserDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const deactivateAccount = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;

		const isDeactivated = await User.destroy({
			where: {
				id: user?.id,
				is_active: true,
				role_id: role_id,
			},
		});

		if (!isDeactivated) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to deactivate your account.",
			);
		}
		return "";
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const notificationToogle = async (body) => {
	try {
		const { user } = body;
		user.notification_status = !user.notification_status;
		await user.save();
		return user;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const addNewAddress = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;

		// Combine address fields

		// Filter out empty fields and join with commas

		// Create user address object
		const userAddressObj = {
			// full_address: fullAddress,
			address: reqBody.address,
			state_id: reqBody.state_id,
			city_id: reqBody.city_id,
			address_lat: reqBody.address_lat,
			address_long: reqBody.address_long,
			user_id: user.id,
			role_id: role_id,
		};

		const userAddressDoc = await UserAddress.create(userAddressObj);

		if (!userAddressDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create address.",
			);
		}

		return userAddressDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const editAddress = async (body) => {
	try {
		const {
			user_address_id,
			address,
			state_id,
			city_id,
			address_lat,
			address_long,
		} = body;

		// Find the existing address record
		const addressDoc = await UserAddress.findOne({
			where: { id: user_address_id, is_active: true },
		});

		if (!addressDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Address Id doesn't exist");
		}

		// Update fields if they have changed
		if (address && address !== addressDoc.address) {
			addressDoc.address = address;
		}
		if (state_id && state_id !== addressDoc.state_id) {
			addressDoc.state_id = state_id;
		}
		if (city_id && city_id !== addressDoc.city_id) {
			addressDoc.city_id = city_id;
		}
		if (address_lat && address_lat !== addressDoc.address_lat) {
			addressDoc.address_lat = address_lat;
		}
		if (address_long && address_long !== addressDoc.address_long) {
			addressDoc.address_long = address_long;
		}

		await addressDoc.save();

		return addressDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const deleteAddress = async (reqBody, id) => {
	try {
		const { user } = reqBody;

		// Find the address document
		const addressDoc = await UserAddress.findOne({
			where: { id: id, user_id: user.id },
		});

		if (!addressDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Address ID doesn't exist");
		}

		// Delete all bookings and their calendar events

		// Finally, delete the address itself
		await addressDoc.destroy();
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

// 	try {

// 				continue;

// 	} catch (error) {

const getAllUserAddress = async (reqBody) => {
	try {
		const { user } = reqBody;

		const addressDoc = await UserAddress.findAll({
			where: { user_id: user.id, is_active: true },
			include: [
				{
					model: Country,
					as: "user_country",
					attributes: ["id", "name", "iso3"],
				},
				{
					model: State,
					as: "user_state",
					attributes: ["id", "name", "country_id"],
				},
				{
					model: City,
					as: "user_city",
					attributes: ["id", "name", "country_id", "state_id"],
				},
			],
		});

		if (!addressDoc || addressDoc.length === 0) {
			return [];
		}

		return addressDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getUserAddressById = async (id) => {
	try {
		const addressDoc = await UserAddress.findOne({
			where: {
				id: id,
				is_active: true,
			},
			include: [
				{
					model: Country,
					as: "user_country",
					attributes: ["id", "name", "iso3"],
				},
				{
					model: State,
					as: "user_state",
					attributes: ["id", "name", "country_id"],
				},
				{
					model: City,
					as: "user_city",
					attributes: ["id", "name", "country_id", "state_id"],
				},
			],
		});

		if (!addressDoc || addressDoc.length === 0) {
			return [];
		}

		return addressDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getUserAddressByUserId = async (id) => {
	try {
		const addressDoc = await UserAddress.findAll({
			where: {
				user_id: id,
				is_active: true,
			},
			include: [
				{
					model: Country,
					as: "user_country",
					attributes: ["id", "name", "iso3"],
				},
				{
					model: State,
					as: "user_state",
					attributes: ["id", "name", "country_id"],
				},
				{
					model: City,
					as: "user_city",
					attributes: ["id", "name", "country_id", "state_id"],
				},
			],
		});

		if (!addressDoc || addressDoc.length === 0) {
			return [];
		}

		return addressDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const createUserConsent = async (body, req = {}) => {
	try {
		console.log(body, "body");

		const {
			first_name,
			last_name,
			email,
			phone_no,
			service,
			message,

			// ✅ new consent fields
			consent_calls,
			consent_autodialer,
			consent_marketing,
			consent_sms,
		} = body;


		// ✅ Mandatory consent checks
		if (!consent_calls) {
			throw new Error("You must agree to receive calls");
		}

		if (!consent_autodialer) {
			throw new Error("You must consent to automated calls");
		}

		// ✅ Create entry
		const data = await UserConsent.create({
			first_name,
			last_name,
			email,
			phone_no,
			service,
			message,

			consent_calls,
			consent_autodialer,
			consent_marketing: consent_marketing || false,
			consent_sms: consent_sms || false,

			// optional audit fields (future-safe)
		});

		return data;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.BAD_REQUEST, // ✅ FIXED (not 500)
			error.message
		);
	}
};

module.exports = {
	getProfile,
	updateUserProfile,
	deactivateAccount,
	notificationToogle,
	addNewAddress,
	editAddress,
	deleteAddress,
	getAllUserAddress,
	getUserAddressById,
	getUserAddressByUserId,
	createUserConsent
};
