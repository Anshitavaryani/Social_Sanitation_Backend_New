/** @format */

const { status: httpStatus } = require("http-status");
const Attendance = require("../../models/attendance.model");
const ApiError = require("../../utils/ApiError");
const { leaveStatusTypes } = require("../../config/types");
const { Op, Sequelize } = require("sequelize");
const {
	User,
	Profile,
	Role,
	Break,
	BookingAssignment,
	Booking,
} = require("../../models");
const {
	sendLeaveStatusEmail,
	sendAutoClockOutEmail,
} = require("./email.service");
const convertToEST = require("../../config/timeManagement");
const moment = require("moment");
const { getDatabase } = require("firebase-admin/database");

// attendce apis
// const clockIn = async (reqBody, headers,files) => {
// 	try {
// 		const { user } = reqBody;
// 		const { role_id } = headers;

// 		console.log(reqBody,"reqBody")

// 		const nowUTC = new Date();
// 		const nowEST = moment
// 			.tz(nowUTC, "America/New_York")
// 			.format("YYYY-MM-DD HH:mm:ss");

// 		// Get today's start and end time
// 		const todayStart = new Date();
// 		todayStart.setHours(0, 0, 0, 0);

// 		const todayEnd = new Date();
// 		todayEnd.setHours(23, 59, 59, 999);

// 		console.log(nowUTC,nowEST,todayStart,todayEnd,"hllooo")

// 		const todaysBookings = await Booking.findAll({
// 			where: {
// 				is_active: true,
// 				date: { [Op.between]: [todayStart, todayEnd] },
// 			},
// 			include: [
// 				{
// 					model: BookingAssignment,
// 					as: "booking_employee_details",
// 					where: { employee_id: user.id }, // Employee assignment check
// 				},
// 			],
// 		});

// 		if (!todaysBookings || todaysBookings.length === 0) {
// 			throw new ApiError(
// 				httpStatus.BAD_REQUEST,
// 				"You do not have any assigned task for today, so you cannot clock in."
// 			);
// 		}

// 		// Check if user has already clocked in today
// 		const existingClockIn = await Attendance.findOne({
// 			where: {
// 				user_id: user.id,
// 				role_id,
// 				clock_out: null,
// 				// clock_in: { [Op.between]: [todayStart, todayEnd] }, // Checks today's clock-in
// 			},
// 		});

// 		if (existingClockIn) {
// 			throw new ApiError(
// 				httpStatus.BAD_REQUEST,
// 				"Already clocked in for today."
// 			);
// 		}

// 		// If logout image is required but not provided
// 		if (user.logout_image_required === true) {
// 			const hasImage =
// 				files &&
// 				Object.keys(files).length !== 0 &&
// 				files.images &&
// 				files.images.length !== 0;

// 			if (!hasImage) {
// 				throw new ApiError(
// 					httpStatus.BAD_REQUEST,
// 					"Clock-in image is required but not provided."
// 				);
// 			}
// 		}

// 		// Create a new clock-in entry
// 		const newClockIn = await Attendance.create({
// 			user_id: user.id,
// 			role_id,
// 			clock_in: new Date(),
// 			clock_in_est: nowEST,
// 			clock_out: null,
// 			total_hours: 0,
// 		});

// 		// Handle optional clock-out image
// 		if (
// 			files &&
// 			Object.keys(files).length !== 0 &&
// 			files.images &&
// 			files.images.length !== 0
// 		) {
// 			const image = files.images[0];
// 			newClockIn.clock_in_image_uri = `${image.filename}`;
// 			newClockIn.clock_in_image_name = image.originalname; // optional
// 			newClockIn.clock_in_image_size = image.size; // optional
// 		}

// 		await newClockIn.save();

// 		return newClockIn;

// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message || "An unexpected error occurred."
// 		);
// 	}
// };

const clockIn = async (reqBody, headers, files) => {
	try {
		const { user, clock_in_time } = reqBody;
		const { role_id } = headers;

		if (!clock_in_time) {
			throw new ApiError(400, "Clock-in time is required.");
		}

		// Parse employee time as EST
		const employeeClockIn = moment
			.tz(clock_in_time, "America/New_York")
			.toDate();

		if (isNaN(employeeClockIn.getTime())) {
			throw new ApiError(400, "Invalid clock-in time format.");
		}

		const employeeClockInEST = moment(employeeClockIn)
			.tz("America/New_York")
			.format("YYYY-MM-DD HH:mm:ss");

		const employeeDateEST = moment(employeeClockIn)
			.tz("America/New_York")
			.format("YYYY-MM-DD");

		console.log({
			raw_time_sent: clock_in_time,
			parsed_utc: employeeClockIn,
			clock_in_est_string: employeeClockInEST,
			employeeDateEST,
		});

		// Fetch all bookings for this employee
		const bookings = await Booking.findAll({
			where: {
				is_active: true,
				time_zone: "America/New_York",
			},
			include: [
				{
					model: BookingAssignment,
					as: "booking_employee_details",
					where: { employee_id: user.id },
				},
			],
		});

		// ⚡ FIXED: Correct booking date matching using date_in_utc + time_in_utc
		const todaysBookings = bookings.filter((b) => {
			// Combine date + time_in_utc into full UTC datetime
			const bookingStartUTC = moment.tz(
				`${moment(b.date_in_utc).format("YYYY-MM-DD")}T${b.time_in_utc}`,
				"UTC",
			);

			// Convert that UTC to EST
			const bookingStartEST = bookingStartUTC.clone().tz("America/New_York");

			const bookingDateEST = bookingStartEST.format("YYYY-MM-DD");

			console.log("Booking Match Check:", {
				booking_id: b.id,
				booking_date_in_utc: b.date_in_utc,
				booking_time_in_utc: b.time_in_utc,
				bookingStartUTC: bookingStartUTC.format(),
				bookingStartEST: bookingStartEST.format(),
				bookingDateEST,
				employeeDateEST,
			});

			return bookingDateEST === employeeDateEST;
		});

		if (todaysBookings.length === 0) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"You do not have any assigned task for today.",
			);
		}

		// Check if already clocked in
		const existingClockIn = await Attendance.findOne({
			where: {
				user_id: user.id,
				role_id,
				clock_out: null,
			},
		});

		if (existingClockIn) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Already clocked in. Please clock out before clocking in again.",
			);
		}

		// 🔒 KEEP YOUR IMAGE REQUIREMENT BLOCK EXACTLY
		if (user.logout_image_required === true) {
			const hasImage =
				files &&
				Object.keys(files).length !== 0 &&
				files.images &&
				files.images.length !== 0;

			if (!hasImage) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					"Clock-in image is required but not provided.",
				);
			}
		}

		// Save attendance
		const newClockIn = await Attendance.create({
			user_id: user.id,
			role_id,
			clock_in: employeeClockIn, // UTC
			clock_in_est: employeeClockInEST, // EST string
			clock_out: null,
			total_hours: 0,
		});

		// Save image if provided
		if (files && files.images && files.images.length > 0) {
			const image = files.images[0];

			newClockIn.clock_in_image_uri = image.filename;
			newClockIn.clock_in_image_name = image.originalname;
			newClockIn.clock_in_image_size = image.size;

			await newClockIn.save();
		}

		return newClockIn;
	} catch (error) {
		console.error("Clock-In Error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

const clockOut = async (reqBody, headers, files) => {
	try {
		const { user, clock_out_time } = reqBody;
		const { role_id } = headers;

		if (!clock_out_time) {
			throw new ApiError(400, "Clock-out time is required.");
		}

		// FIX: Interpret employee device time as EST
		const employeeClockOut = moment
			.tz(clock_out_time, "America/New_York")
			.toDate();

		if (isNaN(employeeClockOut.getTime())) {
			throw new ApiError(400, "Invalid clock-out time format.");
		}

		// Convert for EST-readable logs
		const employeeClockOutEST = moment(employeeClockOut)
			.tz("America/New_York")
			.format("YYYY-MM-DD HH:mm:ss");

		// Find active attendance
		const attendance = await Attendance.findOne({
			where: {
				user_id: user.id,
				role_id,
				clock_out: null,
				is_on_leave: false,
			},
			order: [["created_at", "DESC"]],
		});

		if (!attendance) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No active clock-in found.");
		}

		if (!attendance.clock_in) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Clock-in time missing.");
		}

		// Image requirement
		if (user.logout_image_required === true) {
			const hasImage = files && files.images && files.images.length > 0;

			if (!hasImage) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					"Clock-out image is required but not provided.",
				);
			}
		}

		// Save proper UTC + EST versions
		attendance.clock_out = employeeClockOut; // UTC
		attendance.clock_out_est = employeeClockOutEST; // EST string

		// Total-hours calculation
		const clockInUTC = new Date(attendance.clock_in);

		const diffInMinutes = Math.floor(
			(employeeClockOut - clockInUTC) / (1000 * 60),
		);

		if (diffInMinutes < 0) {
			throw new ApiError(400, "Clock-out cannot be earlier than clock-in.");
		}

		const hours = Math.floor(diffInMinutes / 60);
		const minutes = diffInMinutes % 60;
		attendance.total_hours = `${hours} hours ${minutes} minutes`;

		// Save image if present
		if (files && files.images && files.images.length > 0) {
			const image = files.images[0];
			attendance.clock_out_image_uri = image.filename;
			attendance.clock_out_image_name = image.originalname;
			attendance.clock_out_image_size = image.size;
		}

		await attendance.save();

		console.log(`Clock-out saved: ${attendance.total_hours}`);
		return attendance;
	} catch (error) {
		console.error("Clock-out error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

const applyBreak = async (reqBody, headers) => {
	try {
		const { user, duration, break_start_lat, break_start_lng } = reqBody;
		const { role_id } = headers;

		// Optional: re-enable if you want to restrict allowed durations
		// if (![15, 30, 45, 60, 90].includes(duration)) {
		// 	throw new ApiError(400, "Invalid break duration.");
		// }

		// Use current UTC time as break start
		const nowUTC = new Date();
		const nowEST = moment
			.tz(nowUTC, "America/New_York")
			.format("YYYY-MM-DD HH:mm:ss");

		const breakEndUTC = new Date(nowUTC.getTime() + duration * 60000);
		const breakEndEST = moment
			.tz(breakEndUTC, "America/New_York")
			.format("YYYY-MM-DD HH:mm:ss");

		// 🔑 Find active attendance (clocked in, not clocked out, not on leave)
		const attendance = await Attendance.findOne({
			where: {
				user_id: user.id,
				role_id,
				clock_out: null,
				is_on_leave: false,
			},
			order: [["created_at", "DESC"]],
		});

		if (!attendance) {
			throw new ApiError(400, "You must clock in before taking a break.");
		}

		// Check for existing active break on this attendance
		const activeBreak = await Break.findOne({
			where: {
				user_id: user.id,
				attendance_id: attendance.id,
				status: "active",
			},
		});

		if (activeBreak) {
			throw new ApiError(400, "You already have an active break.");
		}

		const newBreak = await Break.create({
			user_id: user.id,
			role_id,
			attendance_id: attendance.id,
			break_start: nowUTC,
			break_start_est: nowEST,
			break_end: breakEndUTC,
			break_end_est: breakEndEST,
			duration_minutes: duration,
			status: "active",
			break_start_lng: break_start_lng || null,
			break_start_lat: break_start_lat || null,
		});

		return newBreak;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

const checkIfOnBreak = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;

		// 🔑 Get active attendance (no need for date logic)
		const attendance = await Attendance.findOne({
			where: {
				user_id: user.id,
				role_id,
				clock_out: null,
				is_on_leave: false,
			},
			order: [["created_at", "DESC"]],
		});

		if (!attendance) {
			return { onBreak: false };
		}

		// Check for active break linked to this attendance
		const activeBreak = await Break.findOne({
			where: {
				user_id: user.id,
				attendance_id: attendance.id,
				status: "active",
			},
			attributes: [
				"id",
				"break_start",
				"break_start_est",
				"break_end",
				"break_end_est",
				"duration_minutes",
			],
		});

		if (activeBreak) {
			return {
				onBreak: true,
				breakDetails: {
					id: activeBreak.id,
					break_start: activeBreak.break_start,
					break_start_est: activeBreak.break_start_est,
					break_end: activeBreak.break_end,
					break_end_est: activeBreak.break_end_est,
					duration_minutes: activeBreak.duration_minutes,
				},
			};
		}

		return { onBreak: false };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error checking break status.",
		);
	}
};

const checkClockInStatus = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;

		// 🔑 Simply check if there's an active attendance
		const attendance = await Attendance.findOne({
			where: {
				user_id: user.id,
				role_id,
				clock_out: null,
				is_on_leave: false,
			},
			order: [["created_at", "DESC"]],
		});

		if (attendance) {
			return {
				isClockedIn: true,
				clockInTime: attendance.clock_in_est || attendance.clock_in,
			};
		}

		return { isClockedIn: false };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

// const clockOut = async (reqBody, headers, files) => {

// 	try {

// 		const { user } = reqBody;
// 		const { role_id } = headers;

// 		// Find the latest active clock-in record
// 		const attendance = await Attendance.findOne({
// 			where: {
// 				user_id: user.id,
// 				role_id,
// 				clock_out: null,
// 				is_on_leave: false,
// 			},
// 			order: [["created_at", "DESC"]],
// 		});

// 		if (!attendance) {
// 			throw new ApiError(httpStatus.BAD_REQUEST, "No active clock-in found.");
// 		}

// 		// Ensure clock-in time exists
// 		if (!attendance.clock_in) {
// 			throw new ApiError(httpStatus.BAD_REQUEST, "Clock-in time is missing.");
// 		}

// 		// If logout image is required but not provided
// 		if (user.logout_image_required === true) {
// 			const hasImage =
// 				files &&
// 				Object.keys(files).length !== 0 &&
// 				files.images &&
// 				files.images.length !== 0;

// 			if (!hasImage) {
// 				throw new ApiError(
// 					httpStatus.BAD_REQUEST,
// 					"Clock-out image is required but not provided."
// 				);
// 			}
// 		}

// 		const nowUTC = new Date();
// 		const nowEST = moment
// 			.tz(nowUTC, "America/New_York")
// 			.format("YYYY-MM-DD HH:mm:ss");

// 		// Update clock-out time
// 		attendance.clock_out = nowUTC;
// 		attendance.clock_out_est = nowEST;

// 		// Calculate total working hours in hours and minutes format
// 		const clockInTime = new Date(attendance.clock_in);
// 		const clockOutTime = new Date(attendance.clock_out);

// 		if (isNaN(clockInTime) || isNaN(clockOutTime)) {
// 			throw new ApiError(
// 				httpStatus.INTERNAL_SERVER_ERROR,
// 				"Invalid clock-in or clock-out time."
// 			);
// 		}

// 		const diffInMinutes = Math.floor(
// 			(clockOutTime - clockInTime) / (1000 * 60)
// 		); // Convert ms to minutes
// 		const hours = Math.floor(diffInMinutes / 60);
// 		const minutes = diffInMinutes % 60;
// 		attendance.total_hours = `${hours} hours ${minutes} minutes`;

// 		// Handle optional clock-out image
// 		if (
// 			files &&
// 			Object.keys(files).length !== 0 &&
// 			files.images &&
// 			files.images.length !== 0
// 		) {
// 			const image = files.images[0];
// 			attendance.clock_out_image_uri = `${image.filename}`;
// 			attendance.clock_out_image_name = image.originalname; // optional
// 			attendance.clock_out_image_size = image.size; // optional
// 		}

// 		await attendance.save();
// 		console.log(`Clock-out saved: ${attendance.total_hours}`);
// 	} catch (error) {
// 		console.error("Clock-out error:", error);
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message || "An unexpected error occurred."
// 		);
// 	}
// };

// const applyBreak = async (reqBody, headers) => {
// 	try {
// 		const { user, duration, break_start_lat, break_start_lng } = reqBody;
// 		const { role_id } = headers;

// 		// if (![15, 30, 45, 60, 90].includes(duration)) {
// 		// 	throw new ApiError(400, "Invalid break duration.");
// 		// }

// 		const nowUTC = new Date();
// 		const nowEST = moment
// 			.tz(nowUTC, "America/New_York")
// 			.format("YYYY-MM-DD HH:mm:ss");
// 		const breakEndUTC = new Date(nowUTC.getTime() + duration * 60000);
// 		const breakEndEST = moment
// 			.tz(breakEndUTC, "America/New_York")
// 			.format("YYYY-MM-DD HH:mm:ss");

// 		// Check today's attendance using UTC clock_in
// 		const todayStart = new Date(
// 			Date.UTC(
// 				nowUTC.getUTCFullYear(),
// 				nowUTC.getUTCMonth(),
// 				nowUTC.getUTCDate(),
// 				0,
// 				0,
// 				0
// 			)
// 		);
// 		const todayEnd = new Date(
// 			Date.UTC(
// 				nowUTC.getUTCFullYear(),
// 				nowUTC.getUTCMonth(),
// 				nowUTC.getUTCDate(),
// 				23,
// 				59,
// 				59,
// 				999
// 			)
// 		);
// 		console.log(todayStart, todayEnd, "data");

// 		const attendance = await Attendance.findOne({
// 			where: {
// 				user_id: user.id,
// 				role_id: role_id,
// 				clock_in: { [Op.between]: [todayStart, todayEnd] },
// 			},
// 		});
// 		console.log(attendance, "attendance");

// 		if (!attendance) {
// 			throw new ApiError(400, "You must clock in before taking a break.");
// 		}

// 		// Check for existing active break
// 		const activeBreak = await Break.findOne({
// 			where: {
// 				user_id: user.id,
// 				attendance_id: attendance.id,
// 				status: "active",
// 			},
// 		});

// 		if (activeBreak) {
// 			throw new ApiError(400, "You already have an active break.");
// 		}

// 		const newBreak = await Break.create({
// 			user_id: user.id,
// 			role_id,
// 			attendance_id: attendance.id,
// 			break_start: nowUTC,
// 			break_start_est: nowEST,
// 			break_end: breakEndUTC,
// 			break_end_est: breakEndEST,
// 			duration_minutes: duration,
// 			status: "active",
// 			break_start_lng: break_start_lng || null,
// 			break_start_lat: break_start_lat || null,
// 		});

// 		return newBreak;
// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message || "An unexpected error occurred."
// 		);
// 	}
// };

// const checkIfOnBreak = async (reqBody, headers) => {
// 	try {
// 		const { user } = reqBody;
// 		const { role_id } = headers;

// 		const todayStart = new Date();
// 		todayStart.setHours(0, 0, 0, 0);

// 		const todayEnd = new Date();
// 		todayEnd.setHours(23, 59, 59, 999);

// 		// Find today's attendance
// 		const attendance = await Attendance.findOne({
// 			where: {
// 				user_id: user.id,
// 				role_id,
// 				clock_in: { [Op.between]: [todayStart, todayEnd] },
// 			},
// 		});

// 		if (!attendance) {
// 			return { onBreak: false };
// 		}

// 		// Check for active break
// 		const activeBreak = await Break.findOne({
// 			where: {
// 				user_id: user.id,
// 				attendance_id: attendance.id,
// 				status: "active",
// 			},
// 			attributes: [
// 				"id",
// 				"break_start",
// 				"break_start_est",
// 				"break_end",
// 				"break_end_est",
// 				"duration_minutes",
// 			],
// 		});

// 		if (activeBreak) {
// 			return {
// 				onBreak: true,
// 				breakDetails: {
// 					id: activeBreak.id,
// 					break_start: activeBreak.break_start,
// 					break_start_est: activeBreak.break_start_est,
// 					break_end: activeBreak.break_end,
// 					break_end_est: activeBreak.break_end_est,
// 					duration_minutes: activeBreak.duration_minutes,
// 				},
// 			};
// 		}

// 		return { onBreak: false };
// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message || "Error checking break status."
// 		);
// 	}
// };

// const checkClockInStatus = async (reqBody, headers) => {
// 	try {
// 		const { user } = reqBody;
// 		const { role_id } = headers;

// 		// Get today's date in EST
// 		const estNow = new Date(
// 			new Date().toLocaleString("en-US", { timeZone: "America/New_York" })
// 		);
// 		const estStart = new Date(estNow);
// 		estStart.setHours(0, 0, 0, 0);

// 		const estEnd = new Date(estNow);
// 		estEnd.setHours(23, 59, 59, 999);

// 		// Query using clock_in_est (which is already in EST)
// 		const attendance = await Attendance.findOne({
// 			where: {
// 				user_id: user.id,
// 				role_id,
// 				clock_in_est: {
// 					[Op.between]: [estStart, estEnd],
// 				},
// 				clock_out_est: null,
// 			},
// 		});

// 		if (attendance) {
// 			return { isClockedIn: true, clockInTime: attendance.clock_in_est };
// 		}

// 		return { isClockedIn: false };
// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message || "An unexpected error occurred."
// 		);
// 	}
// };

const getAttendance = async (reqBody, headers) => {
	try {
		const { user, start_date, end_date } = reqBody;
		const { role_id } = headers;

		let whereClause = {
			is_active: true,
			is_on_leave: false,
			user_id: user.id,
			role_id: role_id,
		};

		if (start_date && end_date) {
			whereClause.clock_in_est = {
				[Op.between]: [new Date(start_date), new Date(end_date)],
			};
		}

		const attendanceDocs = await Attendance.findAll({
			where: whereClause,
			order: [["created_at", "DESC"]],
		});

		// Convert timestamps to IST with the same keys and structure
		const attendanceWithIST = attendanceDocs.map((att) => {
			const a = att.dataValues;
			return {
				...a,
				clock_in: a.clock_in,
				clock_out: a.clock_out,
				leave_date: a.leave_date,
				created_at: a.created_at,
				updated_at: a.updated_at,
				deleted_at: a.deleted_at,
			};
		});

		return attendanceWithIST;
	} catch (error) {
		return {
			success: false,
			status: error.statusCode || 500,
			message: error.message || "Failed to fetch attendance records.",
		};
	}
};

// leave apis
const applyForLeave = async (reqBody, headers) => {
	try {
		const { user, leave_reason, start_date, end_date } = reqBody;
		const { role_id } = headers;

		const startDate = new Date(start_date);
		const endDate = new Date(end_date);

		// Validate dates
		if (isNaN(startDate) || isNaN(endDate)) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid start or end date.");
		}

		if (startDate > endDate) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Start date cannot be after end date.",
			);
		}

		// Generate date range array
		let currentDate = new Date(startDate);
		const leaveDates = [];
		while (currentDate <= endDate) {
			leaveDates.push(new Date(currentDate));
			currentDate.setDate(currentDate.getDate() + 1);
		}

		// Check if any of the selected dates already have leave applied
		const existingLeaves = await Attendance.findAll({
			where: {
				user_id: user.id,
				is_on_leave: true,
				leave_date: leaveDates, // Check if any selected date is already in DB
			},
		});

		if (existingLeaves.length > 0) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"You have already applied for leave on one or more selected dates.",
			);
		}

		// Prepare leave requests
		const leaveRequests = leaveDates.map((date) => ({
			user_id: user.id,
			role_id,
			is_on_leave: true,
			leave_reason,
			leave_status: leaveStatusTypes.PENDING,
			leave_date: date,
			leave_date_est: convertToEST(date),
		}));

		// Insert new leave requests
		await Attendance.bulkCreate(leaveRequests);

		console.log(`Leave applied from ${start_date} to ${end_date}`);
		return { success: true, message: "Leave request submitted successfully." };
	} catch (error) {
		console.error("Leave application error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

const getAllUserLeaves = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;
		const attendanceDocs = await Attendance.findAll({
			where: {
				is_active: true,
				user_id: user.id,
				role_id: role_id,
				is_on_leave: true,
			},
			order: [["created_at", "DESC"]],
		});

		if (!attendanceDocs) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to get all Record",
			);
		}

		return attendanceDocs;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

// admin apis
const updateLeaveStatus = async (reqBody, id) => {
	try {
		const { status } = reqBody;

		// Ensure status is valid
		if (!Object.values(leaveStatusTypes).includes(status)) {
			return {
				status: 400,
				message: `Invalid status value. Use '${leaveStatusTypes.ACCEPTED}', '${leaveStatusTypes.REJECTED}'.`,
			};
		}

		// Find leave request with user details
		const leaveRequest = await Attendance.findOne({
			where: { id: id, is_on_leave: true },
			include: [
				{
					model: User,
					as: "attendence_user",
					attributes: ["email"], // Fetch user's email
				},
			],
		});

		if (!leaveRequest) {
			return { status: 404, message: "Leave request not found." };
		}

		// Update leave status
		leaveRequest.leave_status = status;
		if (status === leaveStatusTypes.REJECTED) {
			leaveRequest.is_on_leave = false;
		}
		await leaveRequest.save();

		// Send email notification
		if (leaveRequest.attendence_user?.email) {
			await sendLeaveStatusEmail(leaveRequest.attendence_user.email, status);
		}

		return {
			status: 200,
			message: `Leave request ${status.toLowerCase()}.`,
			leaveRequest,
		};
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAllLeaveRequest = async () => {
	try {
		const attendanceDocs = await Attendance.findAll({
			where: {
				is_active: true,
				is_on_leave: true,
				leave_status: "PENDING",
			},
			order: [["created_at", "DESC"]],
			include: [
				{
					model: User,
					as: "attendence_user",
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

		if (!attendanceDocs) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to get all Record",
			);
		}

		return attendanceDocs;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAttendanceByUserId = async (reqBody, id) => {
	try {
		const { filterType, start_date, end_date } = reqBody;

		let whereCondition = {
			user_id: id,
			is_active: true,
		};

		let dateStart, dateEnd;

		if (filterType === "TODAY") {
			dateStart = moment().tz("America/New_York").startOf("day").toDate();
			dateEnd = moment().tz("America/New_York").endOf("day").toDate();
		} else if (filterType === "YESTERDAY") {
			dateStart = moment()
				.tz("America/New_York")
				.subtract(1, "day")
				.startOf("day")
				.toDate();
			dateEnd = moment()
				.tz("America/New_York")
				.subtract(1, "day")
				.endOf("day")
				.toDate();
		} else if (filterType === "THIS_WEEK") {
			// Monday to Sunday in EST
			dateStart = moment()
				.tz("America/New_York")
				.startOf("week")
				.add(1, "day")
				.startOf("day")
				.toDate(); // Monday
			dateEnd = moment(dateStart).add(6, "days").endOf("day").toDate(); // Sunday
		} else if (filterType === "THIS_MONTH") {
			dateStart = moment().tz("America/New_York").startOf("month").toDate();
			dateEnd = moment().tz("America/New_York").endOf("month").toDate();
		} else if (filterType === "PREVIOUS_MONTH") {
			dateStart = moment()
				.tz("America/New_York")
				.subtract(1, "month")
				.startOf("month")
				.toDate();
			dateEnd = moment()
				.tz("America/New_York")
				.subtract(1, "month")
				.endOf("month")
				.toDate();
		} else if (filterType === "CUSTOM" && start_date && end_date) {
			dateStart = new Date(start_date);
			dateEnd = new Date(end_date);
		}

		// 🔹 Fetch clock-in records (PRESENT)
		const presentRecords = await Attendance.findAll({
			where: {
				user_id: id,
				is_active: true,
				clock_in: { [Op.ne]: null },
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE", Sequelize.col("created_at")),
					{
						[Op.between]: [
							moment(dateStart).format("YYYY-MM-DD"),
							moment(dateEnd).format("YYYY-MM-DD"),
						],
					},
				),
			},
			order: [["created_at", "ASC"]],
		});

		// 🔹 Fetch leave records
		const leaveRecords = await Attendance.findAll({
			where: {
				user_id: id,
				is_active: true,
				is_on_leave: true,
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE", Sequelize.col("leave_date")),
					{
						[Op.between]: [
							moment(dateStart).format("YYYY-MM-DD"),
							moment(dateEnd).format("YYYY-MM-DD"),
						],
					},
				),
			},
			order: [["leave_date", "ASC"]],
		});

		// 🔹 Initialize all dates in range as ABSENT
		const attendanceMap = {};
		let currentDate = moment(dateStart);
		const finalDate = moment(dateEnd);

		while (currentDate <= finalDate) {
			const dateKey = currentDate.format("YYYY-MM-DD");
			attendanceMap[dateKey] = {
				date: dateKey,
				status: "ABSENT",
				clock_in: null,
				clock_out: null,
				clock_in_est: null,
				clock_out_est: null,
				leave_reason: null,
				total_hours: null,
				clock_in_image_uri: null,
				clock_out_image_uri: null,
			};
			currentDate.add(1, "day");
		}

		// 🔹 Populate PRESENT records with EST conversion
		presentRecords.forEach((record) => {
			const clockInEST = record.clock_in
				? moment(record.clock_in).tz("America/New_York")
				: null;
			const clockOutEST = record.clock_out
				? moment(record.clock_out).tz("America/New_York")
				: null;

			const dateKey = clockInEST ? clockInEST.format("YYYY-MM-DD") : null;

			if (dateKey && attendanceMap[dateKey]) {
				attendanceMap[dateKey] = {
					date: dateKey,
					status: "PRESENT",
					clock_in: record.clock_in_est,
					clock_out: record.clock_out_est,
					clock_in_est: clockInEST.toISOString(),
					clock_out_est: clockOutEST ? clockOutEST.toISOString() : null,
					leave_reason: null,
					total_hours: record.total_hours || "0",
					clock_in_image_uri: record.clock_in_image_uri || null,
					clock_out_image_uri: record.clock_out_image_uri || null,
				};
			}
		});

		// 🔹 Populate ON LEAVE if no clock-in found that day
		leaveRecords.forEach((record) => {
			const leaveDateEST = moment(record.leave_date).tz("America/New_York");
			const dateKey = leaveDateEST.format("YYYY-MM-DD");

			if (
				attendanceMap[dateKey] &&
				attendanceMap[dateKey].status === "ABSENT"
			) {
				attendanceMap[dateKey] = {
					date: dateKey,
					status: "ON LEAVE",
					clock_in: null,
					clock_out: null,
					clock_in_est: null,
					clock_out_est: null,
					leave_reason: record.leave_reason || "No reason provided",
					total_hours: null,
					clock_in_image_uri: null,
					clock_out_image_uri: null,
				};
			}
		});

		return Object.values(attendanceMap);
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAllAttendance = async (reqBody) => {
	try {
		const { date, month, year } = reqBody;
		const today = new Date();

		let selectedDate;
		let selectedMonth;
		let selectedYear;

		/* ================= DATE HANDLING ================= */
		if (month) {
			if (!year) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					"Year is required when month is provided.",
				);
			}

			selectedMonth = parseInt(month);
			selectedYear = parseInt(year);

			if (
				isNaN(selectedMonth) ||
				isNaN(selectedYear) ||
				selectedMonth < 1 ||
				selectedMonth > 12
			) {
				throw new ApiError(httpStatus.BAD_REQUEST, "Invalid month or year.");
			}

			selectedDate = new Date(selectedYear, selectedMonth - 1, 1);
		} else if (date) {
			selectedDate = new Date(date);
			selectedMonth = selectedDate.getMonth() + 1;
			selectedYear = selectedDate.getFullYear();
		} else {
			selectedDate = new Date(today.getFullYear(), today.getMonth(), 1);
			selectedMonth = today.getMonth() + 1;
			selectedYear = today.getFullYear();
		}

		selectedDate.setHours(0, 0, 0, 0);
		const dateKey = selectedDate.toISOString().split("T")[0];
		const monthIndex = selectedMonth - 1;

		const daysInMonth = new Date(selectedYear, monthIndex + 1, 0).getDate();
		const monthDates = Array.from(
			{ length: daysInMonth },
			(_, i) =>
				new Date(selectedYear, monthIndex, i + 1).toISOString().split("T")[0],
		);

		/* ================= USERS ================= */
		const users = await User.findAll({
			where: { is_active: true, role_id: [7, 8, 9] },
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["name"],
				},
			],
			attributes: ["id", "email", "role_id"],
		});

		/* ================= MONTHLY ATTENDANCE ================= */
		if (month || (!month && !date)) {
			const allAttendance = await Attendance.findAll({
				where: {
					is_active: true,
					[Op.or]: [
						Sequelize.where(
							Sequelize.fn(
								"DATE_FORMAT",
								Sequelize.col("clock_in_est"),
								"%Y-%m",
							),
							`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`,
						),
						Sequelize.where(
							Sequelize.fn(
								"DATE_FORMAT",
								Sequelize.col("leave_date_est"),
								"%Y-%m",
							),
							`${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}`,
						),
					],
				},
			});

			return users
				.map((user) => {
					const name = user.user_profile?.name || "";

					return {
						user_name: name,
						role_id: user.role_id,
						monthly_attendance: monthDates.map((day) => {
							const rec = allAttendance.find(
								(att) =>
									att.user_id === user.id &&
									(new Date(att.clock_in_est).toISOString().startsWith(day) ||
										new Date(att.leave_date_est || "")
											.toISOString()
											.startsWith(day)),
							);

							if (!rec) {
								return {
									date: day,
									status:
										day > today.toISOString().split("T")[0] ? "--" : "ABSENT",
									clock_in: null,
									clock_out: null,
									total_hours: null,
								};
							}

							if (rec.clock_in) {
								return {
									date: day,
									status: "PRESENT",
									clock_in: rec.clock_in_est,
									clock_out: rec.clock_out_est,
									total_hours: rec.total_hours || "0",
									clock_in_location: {
										lat: rec.clock_in_lat || null,
										lng: rec.clock_in_lng || null,
									},
									clock_out_location: {
										lat: rec.clock_out_lat || null,
										lng: rec.clock_out_lng || null,
									},
								};
							}

							if (rec.is_on_leave) {
								return {
									date: day,
									status:
										rec.leave_status === "PENDING"
											? "APPLIED LEAVE"
											: "ON LEAVE",
									leave_reason: rec.leave_reason || null,
								};
							}

							return { date: day, status: "ABSENT" };
						}),
					};
				})
				.sort((a, b) => a.user_name.localeCompare(b.user_name));
		}

		/* ================= DAILY ATTENDANCE ================= */
		const attendanceRecords = await Attendance.findAll({
			where: {
				is_active: true,
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE", Sequelize.col("clock_in_est")),
					dateKey,
				),
			},
		});

		const attendanceMap = {};

		for (const user of users) {
			const rec = attendanceRecords.find((r) => r.user_id === user.id);

			const status = await getAttendanceStatusWithBooking({
				userId: user.id,
				date: dateKey,
				attendanceRecord: rec,
			});

			attendanceMap[user.id] = {
				user_id: user.id,
				user_name: user.user_profile?.name || "",
				role_id: user.role_id,
				date: dateKey,

				// ✅ SMART STATUS
				status,

				clock_in: rec?.clock_in_est || null,
				clock_out: rec?.clock_out_est || null,
				total_hours: rec?.total_hours || null,

				clock_in_location: rec
					? {
							lat: rec.clock_in_lat || null,
							lng: rec.clock_in_lng || null,
						}
					: null,

				clock_out_location: rec
					? {
							lat: rec.clock_out_lat || null,
							lng: rec.clock_out_lng || null,
						}
					: null,
			};
		}

		// const attendanceMap = {};

		// users.forEach((user) => {
		// 	attendanceMap[user.id] = {
		// 		user_id: user.id,
		// 		user_name: user.user_profile?.name || "",
		// 		role_id: user.role_id,
		// 		date: dateKey,
		// 		status: "ABSENT",
		// 		clock_in: null,
		// 		clock_out: null,
		// 		total_hours: null,
		// 		clock_in_location: null,
		// 		clock_out_location: null,
		// 	};
		// });

		// attendanceRecords.forEach((rec) => {
		// 	const user = users.find((u) => u.id === rec.user_id);
		// 	if (!attendanceMap[rec.user_id]) return;

		// 	if (rec.clock_in) {
		// 		attendanceMap[rec.user_id] = {
		// 			user_id: rec.user_id,
		// 			user_name: user?.user_profile?.name || "",
		// 			role_id: user?.role_id || null,
		// 			date: dateKey,
		// 			status: "PRESENT",
		// 			clock_in: rec.clock_in_est,
		// 			clock_out: rec.clock_out_est,
		// 			total_hours: rec.total_hours || "0",
		// 			clock_in_location: {
		// 				lat: rec.clock_in_lat || null,
		// 				lng: rec.clock_in_lng || null,
		// 			},
		// 			clock_out_location: {
		// 				lat: rec.clock_out_lat || null,
		// 				lng: rec.clock_out_lng || null,
		// 			},
		// 		};
		// 	}
		// });

		return Object.values(attendanceMap).sort((a, b) =>
			a.user_name.localeCompare(b.user_name),
		);
	} catch (error) {
		console.error("Attendance Fetch Error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAttendanceStatusWithBooking = async ({
	userId,
	date,
	attendanceRecord,
}) => {
	// 🔍 Find booking where this employee is assigned
	const bookingAssignment = await BookingAssignment.findOne({
		where: { employee_id: userId },
		include: [
			{
				model: Booking,
				as: "employee_details_booking",
				where: {
					is_active: true,
					[Op.and]: Sequelize.where(
						Sequelize.fn(
							"DATE",
							Sequelize.col("employee_details_booking.date"),
						),
						moment(date).format("YYYY-MM-DD"),
					),
				},
				attributes: ["id", "time", "date"],
			},
		],
	});

	// ❌ No booking → fallback to old logic
	if (!bookingAssignment || !bookingAssignment.employee_details_booking) {
		if (attendanceRecord?.clock_in) return "PRESENT";
		return "ABSENT";
	}

	const booking = bookingAssignment.employee_details_booking;

	// 🕐 Build booking start time
	const bookingStart = moment(
		`${moment(date).format("YYYY-MM-DD")} ${booking.time}`,
		"YYYY-MM-DD HH:mm:ss",
	);

	const lateThreshold = bookingStart.clone().add(1, "hours");
	const absentThreshold = bookingStart.clone().add(2, "hours");

	const now = moment();

	// ✅ If clock-in exists
	if (attendanceRecord?.clock_in_est) {
		const clockIn = moment(attendanceRecord.clock_in_est);

		if (clockIn.isAfter(lateThreshold)) return "LATE";
		return "PRESENT";
	}

	// ❌ No clock-in
	if (now.isAfter(absentThreshold)) return "ABSENT";
	if (now.isAfter(lateThreshold)) return "LATE";

	return "PENDING";
};

// const getAllAttendance = async (reqBody) => {
// 	try {
// 		const { date, month, year } = reqBody;

// 		const today = new Date();

// 		let selectedDate;
// 		let selectedMonth;
// 		let selectedYear;

// 		// Determine date/month/year
// 		if (month) {
// 			if (!year) {
// 				throw new ApiError(
// 					httpStatus.BAD_REQUEST,
// 					"Year is required when month is provided."
// 				);
// 			}
// 			selectedMonth = parseInt(month);
// 			selectedYear = parseInt(year);

// 			if (
// 				isNaN(selectedMonth) ||
// 				isNaN(selectedYear) ||
// 				selectedMonth < 1 ||
// 				selectedMonth > 12
// 			) {
// 				throw new ApiError(httpStatus.BAD_REQUEST, "Invalid month or year.");
// 			}

// 			selectedDate = new Date(selectedYear, selectedMonth - 1, 1);
// 		} else if (date) {
// 			selectedDate = new Date(date);
// 			selectedMonth = selectedDate.getMonth() + 1;
// 			selectedYear = selectedDate.getFullYear();
// 		} else {
// 			selectedDate = new Date(today.getFullYear(), today.getMonth(), 1);
// 			selectedMonth = today.getMonth() + 1;
// 			selectedYear = today.getFullYear();
// 		}

// 		selectedDate.setHours(0, 0, 0, 0);
// 		const dateKey = selectedDate.toISOString().split("T")[0];
// 		const monthIndex = selectedMonth - 1;

// 		const getDaysInMonth = (year, month) => {
// 			return new Date(year, month + 1, 0).getDate();
// 		};

// 		const daysInMonth = getDaysInMonth(selectedYear, monthIndex);
// 		const monthDates = Array.from({ length: daysInMonth }, (_, i) => {
// 			const d = new Date(selectedYear, monthIndex, i + 1);
// 			return d.toISOString().split("T")[0];
// 		});

// 		const users = await User.findAll({
// 			where: { is_active: true, role_id: [7, 8, 9] },
// 			include: [
// 				{
// 					model: Profile,
// 					as: "user_profile",
// 					attributes: ["name"],
// 				},
// 			],
// 			attributes: ["id", "email", "role_id"],
// 		});

// 		// If month is passed, return monthly attendance
// 		if (month || (!month && !date)) {
// 			const allAttendance = await Attendance.findAll({
// 				where: {
// 					is_active: true,
// 					[Op.or]: [
// 						Sequelize.where(
// 							Sequelize.fn(
// 								"DATE_FORMAT",
// 								Sequelize.col("clock_in_est"),
// 								"%Y-%m"
// 							),
// 							`${selectedYear}-${(monthIndex + 1).toString().padStart(2, "0")}`
// 						),
// 						Sequelize.where(
// 							Sequelize.fn(
// 								"DATE_FORMAT",
// 								Sequelize.col("leave_date_est"),
// 								"%Y-%m"
// 							),
// 							`${selectedYear}-${(monthIndex + 1).toString().padStart(2, "0")}`
// 						),
// 					],
// 				},
// 			});

// 			const result = users.map((user) => {
// 				const name = user.user_profile?.name || "";
// 				const roleId = user.role_id;

// 				const attendanceArray = monthDates.map((day) => {
// 					const dayRec = allAttendance.find(
// 						(att) =>
// 							att.user_id === user.id &&
// 							(new Date(att.clock_in_est).toISOString().startsWith(day) ||
// 								new Date(att.leave_date_est)?.toISOString()?.startsWith(day))
// 					);

// 					const todayDateOnly = today.toISOString().split("T")[0];

// 					if (!dayRec) {
// 						if (day > todayDateOnly) {
// 							return {
// 								date: day,
// 								status: "--", // Future date
// 								clock_in: null,
// 								clock_out: null,
// 								total_hours: null,
// 								leave_reason: null,
// 								clock_in_image_uri: null,
// 								clock_out_image_uri: null,
// 							};
// 						}

// 						return {
// 							date: day,
// 							status: "ABSENT",
// 							clock_in: null,
// 							clock_out: null,
// 							total_hours: null,
// 							leave_reason: null,
// 						};
// 					}

// 					if (dayRec.clock_in) {
// 						return {
// 							date: day,
// 							status: "PRESENT",
// 							clock_in: dayRec.clock_in_est,
// 							clock_out: dayRec.clock_out_est,
// 							total_hours: dayRec.total_hours || "0",
// 							leave_reason: null,
// 							clock_out_image_uri: dayRec.clock_out_image_uri || null,
// 							clock_in_image_uri: dayRec.clock_in_image_uri || null,
// 						};
// 					} else if (dayRec.is_on_leave) {
// 						return {
// 							date: day,
// 							status:
// 								dayRec.leave_status === "PENDING"
// 									? "APPLIED LEAVE"
// 									: "ON LEAVE",
// 							clock_in: null,
// 							clock_out: null,
// 							total_hours: null,
// 							leave_reason: dayRec.leave_reason || "No reason provided",
// 							clock_out_image_uri: null,
// 							clock_in_image_uri: null,
// 						};
// 					}

// 					return {
// 						date: day,
// 						status: "ABSENT",
// 						clock_in: null,
// 						clock_out: null,
// 						total_hours: null,
// 						leave_reason: null,
// 						clock_out_image_uri: null,
// 						clock_in_image_uri: null,
// 					};
// 				});

// 				return {
// 					user_name: name,
// 					role_id: roleId,
// 					monthly_attendance: attendanceArray,
// 				};
// 			});

// 			// Sort by user_name ascending
// 			const sortedResult = result.sort((a, b) =>
// 				a.user_name.localeCompare(b.user_name)
// 			);
// 			return sortedResult;
// 		}

// 		// Daily attendance
// 		const presentRecords = await Attendance.findAll({
// 			where: {
// 				is_active: true,
// 				clock_in: { [Op.ne]: null },
// 				[Op.and]: Sequelize.where(
// 					Sequelize.fn("DATE", Sequelize.col("clock_in_est")),
// 					dateKey
// 				),
// 			},
// 		});

// 		const leaveRecords = await Attendance.findAll({
// 			where: {
// 				is_active: true,
// 				is_on_leave: true,
// 				[Op.and]: Sequelize.where(
// 					Sequelize.fn("DATE", Sequelize.col("leave_date_est")),
// 					dateKey
// 				),
// 			},
// 		});

// 		const attendanceMap = {};

// 		users.forEach((user) => {
// 			const userName = user.user_profile?.name || "";
// 			const roleId = user.role_id;

// 			attendanceMap[user.id] = {
// 				user_id: user.id,
// 				user_name: userName,
// 				role_id: roleId,
// 				date: dateKey,
// 				status: "ABSENT",
// 				clock_in: null,
// 				clock_out: null,
// 				total_hours: null,
// 				leave_reason: null,
// 				clock_out_image_uri: null,
// 				clock_in_image_uri: null,
// 			};
// 		});

// 		presentRecords.forEach((rec) => {
// 			const user = users.find((u) => u.id === rec.user_id);
// 			if (attendanceMap[rec.user_id]) {
// 				attendanceMap[rec.user_id] = {
// 					user_id: rec.user_id,
// 					user_name: user?.user_profile?.name || "",
// 					role_id: user?.role_id || null,
// 					date: dateKey,
// 					status: "PRESENT",
// 					clock_in: rec.clock_in_est,
// 					clock_out: rec.clock_out_est,
// 					clock_out_image_uri: rec.clock_out_image_uri || null,
// 					clock_in_image_uri: rec.clock_in_image_uri || null,
// 					total_hours: rec.total_hours || "0",
// 					leave_reason: null,
// 				};
// 			}
// 		});

// 		leaveRecords.forEach((rec) => {
// 			const user = users.find((u) => u.id === rec.user_id);
// 			if (
// 				attendanceMap[rec.user_id] &&
// 				attendanceMap[rec.user_id].status === "ABSENT"
// 			) {
// 				const leaveStatus =
// 					rec.leave_status === "PENDING" ? "APPLIED LEAVE" : "ON LEAVE";

// 				attendanceMap[rec.user_id] = {
// 					user_id: rec.user_id,
// 					user_name: user?.user_profile?.name || "",
// 					role_id: user?.role_id || null,
// 					date: dateKey,
// 					status: leaveStatus,
// 					clock_in: null,
// 					clock_out: null,
// 					total_hours: null,
// 					leave_reason: rec.leave_reason || "No reason provided",
// 					clock_out_image_uri: null,
// 					clock_in_image_uri: null,
// 				};
// 			}
// 		});

// 		const finalResult = Object.values(attendanceMap);
// 		const sortedFinalResult = finalResult.sort((a, b) =>
// 			a.user_name.localeCompare(b.user_name)
// 		);

// 		return sortedFinalResult;
// 	} catch (error) {
// 		console.error("Attendance Fetch Error:", error);
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message
// 		);
// 	}
// };

const getTodayAttendanceStats = async (reqBody) => {
	try {
		const { date } = reqBody;

		// Step 1: Get all users with role_id 7, 8, 9
		const roleIds = [7, 8, 9];
		const users = await User.findAll({
			where: {
				role_id: { [Op.in]: roleIds },
				is_active: true,
			},
			attributes: ["id"],
		});
		const userIds = users.map((u) => u.id);

		// Step 2: Parse date from request body or use today's date
		const baseDate = date ? new Date(date) : new Date();
		baseDate.setHours(0, 0, 0, 0);

		const nextDate = new Date(baseDate);
		nextDate.setDate(baseDate.getDate() + 1);

		// Step 3: Get attendance records for the given date
		const presentRecords = await Attendance.findAll({
			where: {
				user_id: { [Op.in]: userIds },
				is_active: true,
				clock_in: { [Op.ne]: null },
				created_at: {
					[Op.gte]: baseDate,
					[Op.lt]: nextDate,
				},
			},
		});

		const leaveRecords = await Attendance.findAll({
			where: {
				user_id: { [Op.in]: userIds },
				is_active: true,
				is_on_leave: true,
				leave_date: {
					[Op.gte]: baseDate,
					[Op.lt]: nextDate,
				},
			},
		});

		// Step 4: Calculate counts
		const presentIds = new Set(presentRecords.map((rec) => rec.user_id));
		const leaveIds = new Set(leaveRecords.map((rec) => rec.user_id));

		let presentCount = presentIds.size;
		let leaveCount = 0;

		leaveIds.forEach((userId) => {
			if (!presentIds.has(userId)) {
				leaveCount++;
			}
		});

		const totalUsers = userIds.length;
		const absentCount = totalUsers - presentCount - leaveCount;

		// Step 5: Respond
		return {
			success: true,
			message: `Attendance statistics for ${date || "today"}`,
			data: {
				total_employees: totalUsers,
				present: presentCount,
				on_leave: leaveCount,
				absent: absentCount,
			},
		};
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getDailyPresenceForMonth = async (reqBody) => {
	try {
		const { month, year } = reqBody;

		if (!month || !year) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Month and year are required.",
			);
		}

		const selectedMonth = parseInt(month);
		const selectedYear = parseInt(year);

		if (
			isNaN(selectedMonth) ||
			isNaN(selectedYear) ||
			selectedMonth < 1 ||
			selectedMonth > 12
		) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid month or year.");
		}

		const monthIndex = selectedMonth - 1;
		const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

		const allDates = Array.from({ length: daysInMonth }, (_, i) => {
			const d = new Date(selectedYear, monthIndex, i + 1);
			return d.toISOString().split("T")[0]; // Format: yyyy-mm-dd
		});

		const users = await User.findAll({
			where: { is_active: true, role_id: [7, 8, 9] },
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["name"],
				},
			],
			attributes: ["id"],
		});

		const userMap = {};
		users.forEach((u) => {
			userMap[u.id] = u.user_profile?.name || "";
		});

		// Attendance using clock_in date (not created_at)
		const attendanceRecords = await Attendance.findAll({
			where: {
				is_active: true,
				clock_in: { [Op.ne]: null },
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE_FORMAT", Sequelize.col("clock_in"), "%Y-%m"),
					`${selectedYear}-${selectedMonth.toString().padStart(2, "0")}`,
				),
			},
			attributes: [
				"user_id",
				"role_id",
				"clock_in",
				"clock_out",
				"clock_in_est",
				"clock_out_est",
				"total_hours",
			],
		});

		const dateWiseMap = {};
		allDates.forEach((date) => {
			dateWiseMap[date] = [];
		});

		attendanceRecords.forEach((rec) => {
			const date = moment
				.utc(rec.clock_in)
				.tz("America/New_York")
				.format("YYYY-MM-DD"); // ✅ FIXED
			if (dateWiseMap[date]) {
				const userName = userMap[rec.user_id];
				if (userName) {
					const clockInEST = moment
						.utc(rec.clock_in)
						.tz("America/New_York")
						.toISOString();
					const clockOutEST = rec.clock_out
						? moment.utc(rec.clock_out).tz("America/New_York").toISOString()
						: null;

					dateWiseMap[date].push({
						id: rec.id,
						user_id: rec.user_id, // ✅ REQUIRED
						role_id: rec.role_id,
						name: userName,
						clock_in: rec.clock_in_est,
						clock_out: rec.clock_out_est,
						total_hours: rec.total_hours,
						clock_in_est: clockInEST,
						clock_out_est: clockOutEST,
					});
				}
			}
		});

		const result = Object.keys(dateWiseMap).map((date) => ({
			date,
			present_users: dateWiseMap[date],
		}));

		return result;
	} catch (error) {
		console.error("Fetch Monthly Presence Error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const autoClockOutEmployees = async () => {
	try {
		console.log("helloo this is working fine");
		const now = moment().tz("America/New_York").toDate();

		const incomplete = await Attendance.findAll({
			where: {
				is_on_leave: false,
				clock_out: null,
			},
			include: [
				{
					model: User,
					as: "attendence_user",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["name"],
						},
						{
							model: Role,
							as: "user_role",
							attributes: ["id"],
						},
					],
				},
			],
		});


		if (!incomplete.length) {
			console.log("✅ No pending clock-outs found.");
			return;
		}

		const employeesWithoutClockOut = [];

		await Promise.all(
			incomplete.map(async (record) => {
				const clockIn = new Date(record.clock_in);
				const autoClockOut = moment(clockIn).add(12, "hours").toDate();

				if (now >= autoClockOut) {
					// Calculate total hours
					const diffMs = autoClockOut - clockIn;
					const diffMins = Math.floor(diffMs / 60000);
					const hours = Math.floor(diffMins / 60);
					const minutes = diffMins % 60;
					const total_hours = `${hours} hours ${minutes} minutes`;

					const clock_out_est = moment(autoClockOut)
						.tz("America/New_York")
						.format("YYYY-MM-DD HH:mm:ss");

					await record.update({
						clock_out: autoClockOut,
						clock_out_est,
						clock_out_lat: null,
						clock_out_lng: null,
						total_hours,
					});

					// collect for email
					const emp = record.attendence_user;
					const name = emp?.user_profile?.name || "N/A";
					const roleId = emp?.user_role?.id;

					const getRoleName = (roleId) => {
						switch (roleId) {
							case 7:
								return "Supervisor";
							case 8:
								return "Quality Inspector";
							case 9:
								return "Janitor";
							case 11:
								return "Housekeeper";
							default:
								return "Team Member";
						}
					};

					employeesWithoutClockOut.push(`${name} – ${getRoleName(roleId)}`);
				}
			}),
		);

		if (employeesWithoutClockOut.length) {
			console.log(
				`✅ Auto clocked-out ${employeesWithoutClockOut.length} employees.`,
			);

			// 🔔 Send Email
			await sendAutoClockOutEmail({
				date: moment().tz("America/New_York").format("YYYY-MM-DD"),
				employees: employeesWithoutClockOut,
			});
		}
	} catch (error) {
		console.error("❌ Auto clock-out failed:", error);
	}
};

// const autoClockOutEmployees = async () => {
// 	try {
// 		const now = moment().tz("America/New_York");
// 		const todayNY = now.format("YYYY-MM-DD");

// 		const startOfDayNY_UTC = moment
// 			.tz(`${todayNY} 00:00`, "America/New_York")
// 			.utc()
// 			.toDate();
// 		const endOfDayNY_UTC = moment
// 			.tz(`${todayNY} 23:59:59`, "America/New_York")
// 			.utc()
// 			.toDate();
// 		console.log(
// 			startOfDayNY_UTC,
// 			endOfDayNY_UTC,
// 			"startOfDayNY_UTC and endOfDayNY_UTC"
// 		);

// 		const autoClockOutUTC = moment
// 			.tz(`${todayNY} 00:00`, "America/New_York")
// 			.add(1, "day")
// 			.utc()
// 			.toDate();

// 		// const autoClockOutUTC = moment
// 		// 	.tz(`${todayNY} 23:59:59`, "America/New_York") // OR
// 		// 	.add(0, "day")
// 		// 	.utc()
// 		// 	.toDate();

// 		console.log(autoClockOutUTC, "autoClockOutUTC");

// 		const incomplete = await Attendance.findAll({
// 			where: {
// 				is_on_leave: false,
// 				clock_out: null,
// 				clock_in: {
// 					[Op.between]: [startOfDayNY_UTC, endOfDayNY_UTC],
// 				},
// 			},
// 			include: [
// 				{
// 					model: User,
// 					as: "attendence_user",
// 					attributes: ["id", "email"],
// 					include: [
// 						{
// 							model: Profile,
// 							as: "user_profile",
// 							attributes: ["name"],
// 						},
// 						{
// 							model: Role, // assuming role model is associated
// 							as: "user_role",
// 							attributes: ["id"],
// 						},
// 					],
// 				},
// 			],
// 		});
// 		console.log(incomplete, "incomplete");

// 		if (!incomplete.length) {
// 			console.log("✅ No pending clock-outs found.");
// 			return;
// 		}

// 		const employeesWithoutClockOut = [];

// 		await Promise.all(
// 			incomplete.map(async (record) => {
// 				const clockIn = new Date(record.clock_in);
// 				const diffMs = autoClockOutUTC - clockIn;

// 				const diffMins = Math.floor(diffMs / 60000);
// 				const hours = Math.floor(diffMins / 60);
// 				const minutes = diffMins % 60;
// 				const total_hours = `${hours} hours ${minutes} minutes`;

// 				const clock_out_est = moment(autoClockOutUTC)
// 					.tz("America/New_York")
// 					.format("YYYY-MM-DD HH:mm:ss");

// 				await record.update({
// 					clock_out: autoClockOutUTC,
// 					clock_out_est: clock_out_est,
// 					clock_out_lat: null,
// 					clock_out_lng: null,
// 					total_hours,
// 				});

// 				// collect for email
// 				const emp = record.attendence_user;
// 				const name = emp?.user_profile?.name || "N/A";
// 				const roleId = emp?.user_role?.id;

// 				const getRoleName = (roleId) => {
// 					switch (roleId) {
// 						case 7:
// 							return "Supervisor";
// 						case 8:
// 							return "Quality Inspector";
// 						case 9:
// 							return "Janitor";
// 						case 11:
// 							return "Housekeeper";
// 						default:
// 							return "Team Member";
// 					}
// 				};

// 				employeesWithoutClockOut.push(`${name} – ${getRoleName(roleId)}`);
// 			})
// 		);

// 		console.log(
// 			`✅ Auto clocked-out ${incomplete.length} employees at ${autoClockOutUTC}`
// 		);

// 		// 🔔 Send Email
// 		await sendAutoClockOutEmail({
// 			date: todayNY,
// 			employees: employeesWithoutClockOut,
// 		});
// 	} catch (error) {
// 		console.error("❌ Auto clock-out failed:", error);
// 	}
// };

const syncClockInData = async () => {
	try {
		const driversSnapshot = await getDatabase().ref("drivers").once("value");
		const driversData = driversSnapshot.val();

		if (!driversData) {
			console.log("❌ No drivers data found in Firebase");
			return;
		}

		const startOfDay = moment.utc().startOf("day").toDate();
		const endOfDay = moment.utc().endOf("day").toDate();

		console.log(
			`🔍 Looking for attendance between ${startOfDay} and ${endOfDay}`,
		);

		for (const userId in driversData) {
			const { clockIn } = driversData[userId];

			console.log(`\n➡️ Checking user: ${userId}`);

			if (!clockIn?.timestamp || !clockIn?.latitude || !clockIn?.longitude) {
				console.log("⚠️ Missing clockIn data, skipping...");
				continue;
			}

			console.log(`🕒 Firebase clockIn: ${new Date(clockIn.timestamp)}`);

			// Attempt to find today's unclocked-out attendance record
			const attendance = await Attendance.findOne({
				where: {
					user_id: userId,
					is_on_leave: false,
					clock_out: null,
					// total_hours: null,
					clock_in: {
						[Op.not]: null,
					},
					// clock_in: {
					// 	[Op.between]: [startOfDay, endOfDay],
					// },
				},
				order: [["created_at", "DESC"]],
			});

			if (!attendance) {
				console.log(`❌ No matching attendance found in DB for user ${userId}`);
				continue;
			}

			// Skip if clock_in_lat and clock_in_lng are already set
			if (attendance.clock_in_lat && attendance.clock_in_lng) {
				console.log("✅ Lat/Lng already set, skipping update.");
				continue;
			}
			console.log(
				`Updating lat/lng → lat: ${clockIn.latitude}, lng: ${clockIn.longitude}`,
			);

			await attendance.update({
				clock_in_lat: clockIn.latitude,
				clock_in_lng: clockIn.longitude,
			});
		}

		console.log("🎉 Clock-in sync completed.");
	} catch (error) {
		console.error("❌ Error syncing clock-in data:", error);
	}
};

const syncClockOutData = async () => {
	try {
		const driversSnapshot = await getDatabase().ref("drivers").once("value");
		const driversData = driversSnapshot.val();

		if (!driversData) {
			console.log("❌ No drivers data found in Firebase");
			return;
		}

		for (const userId in driversData) {
			const { clockOut } = driversData[userId];

			console.log(`\n➡️ Checking user: ${userId}`);

			if (!clockOut?.timestamp || !clockOut?.latitude || !clockOut?.longitude) {
				console.log("⚠️ Missing clockOut data, skipping...");
				continue;
			}

			const clockOutDate = new Date(Number(clockOut.timestamp));
			console.log(`🕒 Firebase clockOut: ${clockOutDate}`);

			// Find latest attendance record that hasn't been clocked out yet
			const attendance = await Attendance.findOne({
				where: {
					user_id: userId,
					is_on_leave: false,
					clock_out: { [Op.not]: null },
				},
				order: [["created_at", "DESC"]],
			});

			if (!attendance) {
				console.log(`❌ No matching attendance found in DB for user ${userId}`);
				continue;
			}

			// Skip if clock_out_lat and clock_out_lng are already set
			if (attendance.clock_out_lat && attendance.clock_out_lng) {
				console.log("✅ Clock-out Lat/Lng already set, skipping update.");
				continue;
			}

			console.log(
				`✅ Found attendance ID ${attendance.id} — Updating clock-out lat/lng`,
			);

			await attendance.update({
				clock_out_lat: clockOut.latitude,
				clock_out_lng: clockOut.longitude,
			});

			console.log(`🎯 Clock-out synced for user ${userId}`);
		}

		console.log("🎉 Clock-out sync completed.");
	} catch (error) {
		console.error("❌ Error syncing clock-out data:", error);
	}
};

const autoCompleteExpiredBreaks = async () => {
	try {
		const now = new Date();

		// find all expired active breaks
		const activeBreaks = await Break.findAll({
			where: {
				status: "active",
				break_end: { [Op.lte]: now },
			},
		});

		console.log(`Found ${activeBreaks.length} expired active breaks`);

		if (activeBreaks.length === 0) return;

		// fetch all drivers snapshot at once for performance
		const driversSnapshot = await getDatabase().ref("drivers").once("value");
		const driversData = driversSnapshot.val();

		for (const b of activeBreaks) {
			const userId = b.user_id;

			console.log(`Processing break ID ${b.id} for user ${userId}`);

			const userLocations = driversData?.[userId]?.locations;
			console.log(userLocations, "userLocations");

			if (!userLocations) {
				console.log(`⚠️ No location data found for user ${userId}`);
			}

			//   let latestLocation = null;
			//   if (userLocations) {
			//     const keys = Object.keys(userLocations);
			//     const lastKey = keys[keys.length - 1];
			//     latestLocation = userLocations[lastKey];
			//   }

			await b.update({
				status: "completed",
				break_end_lat: userLocations?.latitude ?? null,
				break_end_lng: userLocations?.longitude ?? null,
			});

			//   console.log(`✅ Completed break ID ${b.id} with lat/lng → ${latestLocation?.latitude}, ${latestLocation?.longitude}`);
		}

		console.log(`✅ Breaks auto-completed: ${activeBreaks.length}`);
	} catch (error) {
		console.error("❌ Error in auto-completing breaks:", error);
	}
};

const getAllBreaks = async (reqBody) => {
	try {
		const { date } = reqBody;

		// ---- STEP 1: Determine selected date in EST ----
		let selectedDateEST = date
			? moment.tz(date, "America/New_York")
			: moment.tz("America/New_York");

		const dayStartEST = selectedDateEST.clone().startOf("day");
		const dayEndEST = selectedDateEST.clone().endOf("day");

		const dayKey = dayStartEST.format("YYYY-MM-DD");

		// ---- STEP 2: Fetch users ----
		const users = await User.findAll({
			where: { is_active: true, role_id: [7, 8, 9] },
			include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
			attributes: ["id", "role_id", "email"],
		});

		// ---- STEP 3: Fetch breaks with their attendance ----
		const allBreaks = await Break.findAll({
			include: [
				{
					model: Attendance,
					as: "attendence_break",
					attributes: ["id", "clock_in_est", "clock_out_est", "total_hours"],
				},
			],
			order: [["break_start_est", "ASC"]],
		});

		// ---- STEP 4: Filter breaks based on attendance clock-in EST date ----
		const filteredBreaks = allBreaks.filter((b) => {
			if (!b.attendence_break || !b.attendence_break.clock_in_est) return false;

			const attendanceDay = moment
				.tz(b.attendence_break.clock_in_est, "America/New_York")
				.format("YYYY-MM-DD");

			return attendanceDay === dayKey;
		});

		// ---- STEP 5: Map breaks to users ----
		const result = users.map((user) => {
			const userBreaks = filteredBreaks.filter((b) => b.user_id === user.id);

			return {
				user_id: user.id,
				user_name: user.user_profile?.name || "",
				role_id: user.role_id,
				break_count: userBreaks.length,
				breaks: userBreaks.map((b) => ({
					break_start_est: b.break_start_est,
					break_end_est: b.break_end_est,
					duration_minutes: b.duration_minutes,
					status: b.status,
					attendance: b.attendence_break
						? {
								clock_in: b.attendence_break.clock_in_est,
								clock_out: b.attendence_break.clock_out_est,
								total_hours: b.attendence_break.total_hours,
							}
						: null,
				})),
			};
		});

		return result.sort((a, b) => a.user_name.localeCompare(b.user_name));
	} catch (error) {
		console.error("Breaks Fetch Error:", error);
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Something went wrong while fetching breaks",
		);
	}
};

const manualClockInOut = async (reqBody) => {
	try {
		const { employee_id, role_id, date, clock_in, clock_out } = reqBody;
		console.log(reqBody, "manualClockInOut reqBody");

		if (!employee_id || !date) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"employee_id and date are required.",
			);
		}

		// Convert EST time to UTC Date object
		const toUTC = (time) =>
			time ? moment.tz(time, "America/New_York").utc().toDate() : null;
		const toESTString = (time) =>
			time
				? moment.tz(time, "America/New_York").format("YYYY-MM-DD HH:mm:ss")
				: null;

		// Combine date + time into EST datetime strings
		const clockInEST = clock_in ? `${date} ${clock_in}` : null;
		const clockOutEST = clock_out ? `${date} ${clock_out}` : null;

		let clockInUTC = toUTC(clockInEST);
		let clockOutUTC = toUTC(clockOutEST);

		let totalHours = null;

		if (clockInUTC && clockOutUTC) {
			// Handle overnight shift (clock-out next day)
			if (clockOutUTC < clockInUTC) {
				clockOutUTC = moment(clockOutUTC).add(1, "day").toDate();
			}

			const diffMins = Math.floor((clockOutUTC - clockInUTC) / (1000 * 60));
			const hours = Math.floor(diffMins / 60);
			const minutes = diffMins % 60;
			totalHours = `${hours} hours ${minutes} minutes`;
		}

		// Define start/end of day in UTC for search
		const startOfDayUTC = moment
			.tz(date, "America/New_York")
			.utc()
			.startOf("day")
			.toDate();
		const endOfDayUTC = moment
			.tz(date, "America/New_York")
			.utc()
			.endOf("day")
			.toDate();

		// Find existing record
		let record = await Attendance.findOne({
			where: {
				user_id: employee_id,
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE", Sequelize.col("clock_in_est")),
					date, // "YYYY-MM-DD"
				),
			},
		});

		console.log(record, "record");

		if (record) {
			// If no clock_in passed, use existing one from DB
			if (!clockInUTC && record.clock_in) {
				clockInUTC = new Date(record.clock_in);
			}

			if (clockInUTC && !record.clock_in_est) {
				record.clock_in_est = toESTString(clockInUTC);
			}

			if (clockInUTC) {
				record.clock_in = clockInUTC;
				record.clock_in_est = toESTString(clockInUTC);
			}

			if (clockOutUTC) {
				record.clock_out = clockOutUTC;
				record.clock_out_est = toESTString(clockOutUTC);
			}

			// Now calculate total_hours
			if (clockInUTC && clockOutUTC) {
				if (clockOutUTC < clockInUTC) {
					clockOutUTC = moment(clockOutUTC).add(1, "day").toDate();
				}
				const diffMins = Math.floor((clockOutUTC - clockInUTC) / (1000 * 60));
				const hours = Math.floor(diffMins / 60);
				const minutes = diffMins % 60;
				record.total_hours = `${hours} hours ${minutes} minutes`;
			}

			await record.save();
			return { message: "Attendance updated successfully", record };
		} else {
			// Create new record
			const newRecord = await Attendance.create({
				user_id: employee_id,
				role_id: role_id || null,
				clock_in: clockInUTC,
				clock_in_est: toESTString(clockInEST),
				clock_out: clockOutUTC,
				clock_out_est: toESTString(clockOutEST),
				total_hours: totalHours || "0 hours 0 minutes",
				added_by_admin: true,
			});
			return { message: "Attendance created successfully", record: newRecord };
		}
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "An unexpected error occurred.",
		);
	}
};

module.exports = {
	clockIn,
	clockOut,
	applyBreak,
	checkIfOnBreak,
	checkClockInStatus,
	getAttendance,
	applyForLeave,
	getAllUserLeaves,
	updateLeaveStatus,
	getAllLeaveRequest,
	getAttendanceByUserId,
	getAllAttendance,
	getTodayAttendanceStats,
	getDailyPresenceForMonth,
	syncClockInData,
	autoClockOutEmployees,
	syncClockOutData,
	autoCompleteExpiredBreaks,
	getAllBreaks,
	manualClockInOut,
};
