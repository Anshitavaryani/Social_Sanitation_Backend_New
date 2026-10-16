/** @format */

const { status: httpStatus } = require("http-status");

const {
	DailyChecklist,
	DailyChecklistHeading,
	DailySupervisorChecklist,
	User,
	Profile,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Sequelize, Op } = require("sequelize");
const { dayjs, dateInTz, dayBoundsUtc, zonedTimeToUtc, isoWeekStart, addDays } = require("../../utils/time");

const createDailyChecklist = async (reqBody) => {
	try {
		// Check if heading already exists
		let heading = await DailyChecklistHeading.findOne({
			where: { title: reqBody.heading },
		});

		if (!heading) {
			heading = await DailyChecklistHeading.create({
				title: reqBody.heading,
				role_id: reqBody.role_id,
			});
		}

		// Create tasks under the heading
		const taskEntries = reqBody.tasks.map((task) => ({
			heading_id: heading.id,
			task,
		}));

		const tasks = await DailyChecklist.bulkCreate(taskEntries);

		return { heading, tasks };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const createOrUpdateChecklistMainTitle = async (reqBody) => {
	try {
		const { old_main_title, new_main_title } = reqBody;

		if (!new_main_title) {
			throw new ApiError(httpStatus.BAD_REQUEST, "New main_title is required");
		}

		let updatedRows;

		if (old_main_title) {
			// Update all existing rows with the old main title
			updatedRows = await DailyChecklistHeading.update(
				{ main_title: new_main_title },
				{ where: { main_title: old_main_title } }
			);
		}

		return {
			success: true,
			message: "Main title processed successfully",
			updated_count: updatedRows[0] || updatedRows,
		};
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getChecklistMainTitle = async () => {
	try {
		const service = await DailyChecklistHeading.findOne({
			where: { is_active: true },
			attributes: ["main_title"],
			raw: true,
		});

		return service ? service.main_title : null;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getDailyChecklist = async () => {
	try {
		// Fetch headings with their tasks
		const headings = await DailyChecklistHeading.findAll({
			include: [
				{
					model: DailyChecklist,
					as: "daily_task",
					attributes: ["task"],
				},
			],
			order: [["id", "DESC"]],
		});

		// Transform response format

		return headings;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const findDailyChecklistById = async (id) => {
	try {
		const serviceDoc = await DailyChecklistHeading.findByPk(id, {
			include: [
				{
					model: DailyChecklist,
					as: "daily_task",
					attributes: ["task", "id"],
				},
			],
		});
		return serviceDoc ? serviceDoc : [];
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateDailyChecklist = async (reqBody, headingId) => {
	try {
		const heading = await DailyChecklistHeading.findByPk(headingId);
		if (!heading) {
			throw new ApiError(httpStatus.NOT_FOUND, "Heading not found");
		}

		// Update heading title and role_id
		const updateData = {};
		if (reqBody.heading) updateData.title = reqBody.heading;
		if (reqBody.role_id) updateData.role_id = reqBody.role_id;

		if (Object.keys(updateData).length > 0) {
			await heading.update(updateData);
		}

		// Track updated/added task IDs
		const incomingTaskIds = [];

		// Process tasks
		if (reqBody.tasks && reqBody.tasks.length > 0) {
			for (const task of reqBody.tasks) {
				if (task.id) {
					// Update existing task
					await DailyChecklist.update(
						{ task: task.task },
						{ where: { id: task.id, heading_id: headingId } }
					);
					incomingTaskIds.push(task.id);
				} else {
					// Add new task
					const newTask = await DailyChecklist.create({
						heading_id: headingId,
						task: task.task,
					});
					incomingTaskIds.push(newTask.id);
				}
			}
		}

		// Delete removed tasks
		await DailyChecklist.destroy({
			where: {
				heading_id: headingId,
				id: { [Op.notIn]: incomingTaskIds },
			},
		});

		return { message: "Checklist updated successfully" };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};


const deleteDailyChecklist = async (body) => {
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
		const users = await DailyChecklistHeading.findAll({
			where: {
				id: userIds,
			},
		});

		if (users.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No users found");
		}
		await DailyChecklist.destroy({
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
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const markDailyChecklistItemAsCompleted = async (reqBody, id) => {
	try {
		const { user } = reqBody;
		// Start of today in New York (not UTC midnight, which is 8 pm ET)
		const today = dayBoundsUtc().start;

		// Step 1: Check if the checklist item exists
		const checklistItem = await DailyChecklist.findByPk(id);
		if (!checklistItem) {
			throw new ApiError(httpStatus.NOT_FOUND, "Checklist item not found.");
		}

		// Step 2: Check if today's entry exists
		let userChecklistItem = await DailySupervisorChecklist.findOne({
			where: {
				employee_id: user.id,
				service_checklist_id: id,
				created_at: {
					[Op.gte]: today,
				},
			},
		});

		if (userChecklistItem) {
			// Toggle is_completed and update completed_at accordingly
			const newStatus = !userChecklistItem.is_completed;
			userChecklistItem.is_completed = newStatus;
			userChecklistItem.completed_at = newStatus ? new Date() : null;
			await userChecklistItem.save();
		} else {
			// Create a new entry for today
			userChecklistItem = await DailySupervisorChecklist.create({
				employee_id: user.id,
				service_checklist_id: id,
				is_completed: true,
				completed_at: new Date(),
			});
		}

		return {
			success: true,
			message: `Checklist item marked as ${
				userChecklistItem.is_completed ? "completed" : "incomplete"
			} for today.`,
			data: {
				employee_id: user.id,
				service_checklist_id: id,
				is_completed: userChecklistItem.is_completed,
				completed_at: userChecklistItem.completed_at,
			},
		};
	} catch (error) {
		console.error("Error marking checklist item:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal server error."
		);
	}
};

const getDailyChecklistWithTodayStatus = async (reqBody) => {
	try {
		const { user } = reqBody;

		// Today's start and end in New York
		const { start: todayStartDate, end: todayEndDate } = dayBoundsUtc();

		const headings = await DailyChecklistHeading.findAll({
			where: {
				role_id: user.sub_role_id,
			},
			include: [
				{
					model: DailyChecklist,
					as: "daily_task",
					attributes: ["id", "task"],
					include: [
						{
							model: DailySupervisorChecklist,
							as: "supervisor_checklist",
							where: {
								employee_id: user.id,
								created_at: {
									[Op.between]: [todayStartDate, todayEndDate],
								},
							},
							required: false,
							attributes: ["is_completed"],
						},
					],
				},
			],
			order: [["id", "ASC"]],
		});

		const mainTitle = headings.length > 0 ? headings[0].main_title : null;

		const formattedChecklist = headings.map((heading) => ({
			heading: heading.title,
			tasks: heading.daily_task.map((task) => ({
				id: task.id,
				task: task.task,
				is_completed:
					task.supervisor_checklist.length > 0 &&
					task.supervisor_checklist[0].is_completed,
			})),
		}));

		return {
			success: true,
			message: "Checklist for today fetched.",
			main_title: mainTitle,
			data: formattedChecklist,
		};
	} catch (error) {
		console.error("Error fetching daily checklist:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal server error"
		);
	}
};

const getWeeklyChecklistWithStatus = async (reqBody) => {
	try {
		const { user_id } = reqBody;

		const user = await User.findByPk(user_id);

		// Monday 12:00 AM to next Monday 12:00 AM in New York (Sunday belongs to the week that started on Monday)
		const weekStartDate = isoWeekStart(dateInTz());
		const weekStart = zonedTimeToUtc(weekStartDate);
		const weekEnd = zonedTimeToUtc(addDays(weekStartDate, 7));

		// Fetch all checklist headings and tasks with user status for the week
		const headings = await DailyChecklistHeading.findAll({
			where: { role_id: user.sub_role_id },
			include: [
				{
					model: DailyChecklist,
					as: "daily_task",
					attributes: ["id", "task"],
					include: [
						{
							model: DailySupervisorChecklist,
							as: "supervisor_checklist",
							where: {
								employee_id: user_id,
								created_at: {
									[Op.between]: [weekStart.toDate(), weekEnd.toDate()],
								},
							},
							required: false,
							attributes: ["is_completed", "created_at"],
						},
					],
				},
			],
			order: [["id", "ASC"]],
		});

		// Preprocess all tasks with heading and their checklist records
		const allTasks = [];
		headings.forEach((heading) => {
			heading.daily_task.forEach((task) => {
				allTasks.push({
					id: task.id,
					task: task.task,
					heading: heading.title,
					checklist: task.supervisor_checklist || [],
				});
			});
		});

		// Build the weekly grouped response
		const result = {};

		for (let i = 0; i < 7; i++) {
			const dateKey = addDays(weekStartDate, i);
			const { start: dayStart, end: dayEnd } = dayBoundsUtc(dateKey);

			const grouped = {};

			// Group tasks under their heading
			allTasks.forEach((task) => {
				const isCompleted = task.checklist.some((entry) => {
					const entryTime = dayjs(entry.created_at);
					return (
						entryTime.isSameOrAfter(dayStart) &&
						entryTime.isSameOrBefore(dayEnd) &&
						entry.is_completed === true
					);
				});

				if (!grouped[task.heading]) {
					grouped[task.heading] = [];
				}

				grouped[task.heading].push({
					id: task.id,
					task: task.task,
					is_completed: isCompleted,
				});
			});

			// Convert grouped object into array format
			result[dateKey] = Object.keys(grouped).map((heading) => ({
				heading,
				tasks: grouped[heading],
			}));
		}

		return {
			success: true,
			message: "Weekly checklist by date with headings fetched successfully.",
			data: result,
		};
	} catch (error) {
		console.error("Error fetching weekly checklist by date:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal server error"
		);
	}
};

const getJanitors = async (reqBody) => {
	try {
		const userDoc = await User.findAll({
			where: {
				role_id: {
					[Sequelize.Op.in]: [9],
				},
				is_active: true,
			},
				order: [['created_at', 'DESC']],
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["name", "mobile"],
				},
			],
		});

		if (!userDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"|=> Failed to get all Drivers <=|"
			);
		}

		return userDoc;
	} catch (error) {
		throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
	}
};

// 	try {

// 	} catch (error) {

module.exports = {
	createDailyChecklist,
	createOrUpdateChecklistMainTitle,
	getDailyChecklist,
	findDailyChecklistById,
	updateDailyChecklist,
	deleteDailyChecklist,
	markDailyChecklistItemAsCompleted,
	getDailyChecklistWithTodayStatus,
	getChecklistMainTitle,
	getWeeklyChecklistWithStatus,
	getJanitors
};
