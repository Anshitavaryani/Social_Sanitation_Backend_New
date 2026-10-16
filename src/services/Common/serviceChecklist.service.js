/** @format */

const { status: httpStatus } = require("http-status");

const { ServiceChecklist, ServiceChecklistHeading } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");

const createServiceChecklist = async (reqBody) => {
	try {
		// Check if heading already exists
		let heading = await ServiceChecklistHeading.findOne({
			where: { title: reqBody.heading },
		});

		if (!heading) {
			heading = await ServiceChecklistHeading.create({
				title: reqBody.heading,
				role_id: reqBody.role_id,
			});
		}

		// Create tasks under the heading
		const taskEntries = reqBody.tasks.map((task) => ({
			heading_id: heading.id,
			task,
		}));

		const tasks = await ServiceChecklist.bulkCreate(taskEntries);

		return { heading, tasks };
	} catch (error) {
		throw ApiError.from(error);
	}
};

const getAllServiceChecklist = async () => {
	try {
		const serviceDoc = await ServiceChecklistHeading.findAll({
			where: { is_active: true },
			attributes: ["id", "title","role_id"],
			order: [["created_at", "ASC"]],
			include: [
				{
					model: ServiceChecklist,
					as: "service_checklists",
					attributes: ["task"],
				},
			],
		});
		if (!serviceDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Service"
			);
		}
		return serviceDoc;
	} catch (error) {
		throw ApiError.from(error);
	}
};

const findServiceChecklistById = async (id) => {
	try {
		const serviceDoc = await ServiceChecklistHeading.findByPk(id, {
			include: [
				{
					model: ServiceChecklist,
					as: "service_checklists",
					attributes: ["task"],
				},
			],
		});
		return serviceDoc ? serviceDoc : [];
	} catch (error) {
		throw ApiError.from(error);
	}
};

const updateServiceChecklist = async (reqBody, headingId) => {
	try {
		const heading = await ServiceChecklistHeading.findByPk(headingId);
		if (!heading) {
			throw new ApiError(httpStatus.NOT_FOUND, "Heading not found");
		}

		// Prepare fields to update
		const updateFields = {};
		if (reqBody.heading) {
			updateFields.title = reqBody.heading;
		}
		if (reqBody.role_id) {
			updateFields.role_id = reqBody.role_id;
		}

		// Update heading title and/or role_id
		if (Object.keys(updateFields).length > 0) {
			await heading.update(updateFields);
		}

		// Track updated/added task IDs
		const incomingTaskIds = [];

		// Process tasks
		if (reqBody.tasks && reqBody.tasks.length > 0) {
			for (const task of reqBody.tasks) {
				if (task.id) {
					// Update existing
					await ServiceChecklist.update(
						{ task: task.task },
						{ where: { id: task.id, heading_id: headingId } }
					);
					incomingTaskIds.push(task.id);
				} else {
					// Add new
					const newTask = await ServiceChecklist.create({
						heading_id: headingId,
						task: task.task,
					});
					incomingTaskIds.push(newTask.id);
				}
			}
		}

		// Delete tasks removed in the frontend
		await ServiceChecklist.destroy({
			where: {
				heading_id: headingId,
				id: { [Op.notIn]: incomingTaskIds },
			},
		});

		return { message: "Checklist updated successfully" };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Failed to update checklist"
		);
	}
};


const deleteServiceChecklist = async (body) => {
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
		const users = await ServiceChecklistHeading.findAll({
			where: {
				id: userIds,
			},
		});

		if (users.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No users found");
		}
		await ServiceChecklist.destroy({
			where: { heading_id: body.heading_id },
		});

		// Send email notifications and delete users
		await Promise.all(
			users.map(async (user) => {
				// Delete the user
				await user.destroy();
			})
		);
	} catch (error) {
		throw ApiError.from(error);
	}
};

module.exports = {
	createServiceChecklist,
	getAllServiceChecklist,
	findServiceChecklistById,
	updateServiceChecklist,
	deleteServiceChecklist,
};
