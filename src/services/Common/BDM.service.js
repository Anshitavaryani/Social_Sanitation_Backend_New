/** @format */

const { status: httpStatus } = require("http-status");
const { User, BDMUser, Admin, Profile, Booking } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");

const assignUser = async (reqBody) => {
	const { bdm_id, user_id, remove_user_id } = reqBody;

	try {
		if (!bdm_id) {
			throw new ApiError(httpStatus.BAD_REQUEST, "bdm_id is required");
		}

		// 🔹 Remove users if `remove_user_id` is provided
		if (remove_user_id && Array.isArray(remove_user_id) && remove_user_id.length > 0) {
			await BDMUser.destroy({
				where: {
					bdm_id: bdm_id,
					user_id: remove_user_id,
				},
			});
		}

		// 🔹 Assign new users if `user_id` is provided
		if (user_id && Array.isArray(user_id) && user_id.length > 0) {

  // 🔥 REMOVE EXISTING BDM FOR THIS USER
  await BDMUser.destroy({
    where: {
      user_id: user_id
    }
  });

  // 🔥 ASSIGN NEW BDM
  const newAssignments = user_id.map((id) => ({
    user_id: id,
    bdm_id: bdm_id,
  }));

  await BDMUser.bulkCreate(newAssignments);
}

		return { success: true, message: "Users updated successfully" };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const getAllBDMs = async () => {
	try {
		const userDoc = await Admin.findAll({
			where: { is_active: true, role_id: "5" },
		});

		if (!userDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"|=> Failed to get all User <=|"
			);
		}

		return userDoc;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const deleteBDM = async (body) => {
	try {
		// Validate user_id
		if (!Array.isArray(body.user_id) || body.user_id.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user_id");
		}

		// Ensure all IDs are trimmed and filtered
		const userIds = body.user_id.map((id) => String(id).trim()).filter(Boolean);

		if (userIds.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No valid user IDs provided");
		}

		// Find all users with the given IDs
		const users = await Admin.findAll({
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
				// Send email notification to user
				// await sendUserDeletionEmail(user.email);

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

const getAllUsers = async () => {
	try {
		// Fetch all user_ids already assigned in BDMUser and not deleted
		const assignedUsers = await BDMUser.findAll({
			where: { deleted_at: null }, // Only active assignments
			attributes: ["user_id"],
			raw: true,
		});

		const assignedUserIds = assignedUsers.map((u) => u.user_id); // Extract IDs

		// Get users where role_id = 6 and exclude assigned users
		const userDoc = await User.findAll({
			where: {
				role_id: 6,
				id: { [Op.notIn]: assignedUserIds }, // Exclude assigned users
			},
			attributes: ["id"], // Select only 'id'
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["name"], // Select only 'name'
				},
			],
		});

		// Map only required fields: 'id' & 'name'
		const result = userDoc.map((user) => ({
			id: user.id,
			name: user.user_profile?.name || null, // Handle missing profile name
		}));

		return result;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getAllUsersByBDMId = async (id) => {
	try {
		const userDoc = await BDMUser.findAll({
			where: { is_active: true, bdm_id: id },
			include: [
				{
					model: User,
					as: "user_bdm",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["name", "mobile"],
						},
					],
				},
			],
		});

		if (!userDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"|=> Failed to get all User <=|"
			);
		}

		// 🔹 Filter out entries where `user_bdm` is null
		const filteredUsers = userDoc.filter((user) => user.user_bdm !== null);

		return filteredUsers;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

const getBDMByUserId = async (user_id) => {
	try {
		const record = await BDMUser.findOne({
			where: { user_id, is_active: true },
			include: [
				{
					model: Admin,
					as: "bdm",
					attributes: ["id", "name", "email", "mobile"],
				},
			],
		});

		if (!record) return null;

		return record.bdm;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};


const getAllBookingsByBDMId = async (reqBody) => {
	try {
		const { user } = reqBody;

		// Get all user IDs assigned to this BDM
		const assignedUsers = await BDMUser.findAll({
			where: { is_active: true, bdm_id: user.id },
			attributes: ["user_id"],
		});

		// Extract user IDs from assignedUsers
		const assignedUserIds = assignedUsers.map((u) => u.user_id);

		if (assignedUserIds.length === 0) {
			return {
				success: true,
				message: "No assigned users found for this BDM",
				data: [],
			};
		}

		// Get bookings of assigned users
		const bookings = await Booking.findAll({
			where: { user_id: assignedUserIds },
			include: [
				{
					model: User,
					as: "booking_user",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["name", "mobile"],
						},
					],
				},
			],
		});

		return {
			success: true,
			message: "Bookings retrieved successfully",
			data: bookings,
		};
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

module.exports = {
	assignUser,
	getAllBDMs,
	deleteBDM,
	getAllUsers,
	getAllUsersByBDMId,
	getAllBookingsByBDMId,
	getBDMByUserId,
};
