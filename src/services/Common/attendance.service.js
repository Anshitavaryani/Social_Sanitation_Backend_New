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
const {
	dayjs,
	inZone,
	BUSINESS_TZ,
	dateInTz,
	dayBoundsUtc,
	calendarDateUtc,
	nowWallClock,
	toCalendarDate,
	addDays,
	isoWeekStart,
} = require("../../utils/time");
const { getDatabase } = require("firebase-admin/database");

// attendce apis
// 	try {

// 	} catch (error) {

const clockIn = async (reqBody, headers, files) => {
	try {
		const { user, clock_in_time } = reqBody;
		const { role_id } = headers;

		if (!clock_in_time) {
			throw new ApiError(400, "Clock-in time is required.");
		}

		// Parse employee time as EST
		const employeeClockIn = inZone(clock_in_time, BUSINESS_TZ).toDate();

		if (isNaN(employeeClockIn.getTime())) {
			throw new ApiError(400, "Invalid clock-in time format.");
		}

		const employeeClockInEST = dayjs(employeeClockIn)
			.tz(BUSINESS_TZ)
			.format("YYYY-MM-DD HH:mm:ss");

		const employeeDateEST = dayjs(employeeClockIn)
			.tz(BUSINESS_TZ)
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
			const bookingStartUTC = dayjs.utc(
				`${toCalendarDate(b.date_in_utc)}T${b.time_in_utc}`,
			);

			// Convert that UTC to EST
			const bookingStartEST = bookingStartUTC.tz(BUSINESS_TZ);

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
		const employeeClockOut = inZone(clock_out_time, BUSINESS_TZ).toDate();

		if (isNaN(employeeClockOut.getTime())) {
			throw new ApiError(400, "Invalid clock-out time format.");
		}

		// Convert for EST-readable logs
		const employeeClockOutEST = dayjs(employeeClockOut)
			.tz(BUSINESS_TZ)
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

		// Use current UTC time as break start
		const nowUTC = new Date();
		const nowEST = dayjs(nowUTC).tz(BUSINESS_TZ).format("YYYY-MM-DD HH:mm:ss");

		const breakEndUTC = new Date(nowUTC.getTime() + duration * 60000);
		const breakEndEST = dayjs(breakEndUTC)
			.tz(BUSINESS_TZ)
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

// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

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
			leave_date_est: `${toCalendarDate(date)} 00:00:00`,
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

		// Range as New York calendar days; no or unknown filter means today
		const today = dateInTz();
		let startDay = today;
		let endDay = today;

		if (filterType === "YESTERDAY") {
			startDay = addDays(today, -1);
			endDay = startDay;
		} else if (filterType === "THIS_WEEK") {
			// Monday to Sunday (a Sunday belongs to the week that started the Monday before)
			startDay = isoWeekStart(today);
			endDay = addDays(startDay, 6);
		} else if (filterType === "THIS_MONTH") {
			startDay = dayjs(today).startOf("month").format("YYYY-MM-DD");
			endDay = dayjs(today).endOf("month").format("YYYY-MM-DD");
		} else if (filterType === "PREVIOUS_MONTH") {
			const previousMonth = dayjs(today).startOf("month").subtract(1, "month");
			startDay = previousMonth.format("YYYY-MM-DD");
			endDay = previousMonth.endOf("month").format("YYYY-MM-DD");
		} else if (filterType === "CUSTOM" && start_date && end_date) {
			startDay = toCalendarDate(start_date) || today;
			endDay = toCalendarDate(end_date) || today;
		}

		// 🔹 Fetch clock-in records (PRESENT): created_at is a UTC instant
		const presentRecords = await Attendance.findAll({
			where: {
				user_id: id,
				is_active: true,
				clock_in: { [Op.ne]: null },
				created_at: {
					[Op.between]: [dayBoundsUtc(startDay).start, dayBoundsUtc(endDay).end],
				},
			},
			order: [["created_at", "ASC"]],
		});

		// 🔹 Fetch leave records: leave_date is a calendar date at UTC midnight
		const leaveRecords = await Attendance.findAll({
			where: {
				user_id: id,
				is_active: true,
				is_on_leave: true,
				[Op.and]: Sequelize.where(
					Sequelize.fn("DATE", Sequelize.col("leave_date")),
					{
						[Op.between]: [startDay, endDay],
					},
				),
			},
			order: [["leave_date", "ASC"]],
		});

		// 🔹 Initialize all dates in range as ABSENT
		const attendanceMap = {};
		for (let dateKey = startDay; dateKey <= endDay; dateKey = addDays(dateKey, 1)) {
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
		}

		// 🔹 Populate PRESENT records with EST conversion
		presentRecords.forEach((record) => {
			const clockInEST = record.clock_in
				? dayjs(record.clock_in).tz(BUSINESS_TZ)
				: null;
			const clockOutEST = record.clock_out
				? dayjs(record.clock_out).tz(BUSINESS_TZ)
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
			const dateKey = toCalendarDate(record.leave_date);

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
		// Today's New York date at UTC midnight (getFullYear/getMonth/toISOString read it as-is)
		const today = calendarDateUtc().toDate();

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
								Sequelize.col("leave_date"),
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
									((att.clock_in_est &&
										new Date(att.clock_in_est).toISOString().startsWith(day)) ||
										(att.is_on_leave && toCalendarDate(att.leave_date) === day)),
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

		// attendanceRecords.forEach((rec) => {

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
						toCalendarDate(date),
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
	// booking.time and clock_in_est are New York wall time; compare everything in that convention
	const bookingStart = dayjs.utc(
		`${toCalendarDate(date)} ${booking.time}`,
		"YYYY-MM-DD HH:mm:ss",
	);

	const lateThreshold = bookingStart.add(1, "hours");
	const absentThreshold = bookingStart.add(2, "hours");

	const now = dayjs.utc(nowWallClock());

	// ✅ If clock-in exists
	if (attendanceRecord?.clock_in_est) {
		const clockIn = dayjs.utc(attendanceRecord.clock_in_est);

		if (clockIn.isAfter(lateThreshold)) return "LATE";
		return "PRESENT";
	}

	// ❌ No clock-in
	if (now.isAfter(absentThreshold)) return "ABSENT";
	if (now.isAfter(lateThreshold)) return "LATE";

	return "PENDING";
};

// 	try {

// 		} else if (date) {
// 		} else {

// 			const result = users.map((user) => {

// 				const attendanceArray = monthDates.map((day) => {

// 				});

// 			});

// 		users.forEach((user) => {

// 		});

// 		leaveRecords.forEach((rec) => {

// 		});

// 	} catch (error) {

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
		const day = (date && toCalendarDate(date)) || dateInTz();
		const { start: dayStart, end: dayEnd } = dayBoundsUtc(day);
		const baseDate = calendarDateUtc(day).toDate();
		const nextDate = calendarDateUtc(addDays(day, 1)).toDate();

		// Step 3: Get attendance records for the given date
		const presentRecords = await Attendance.findAll({
			where: {
				user_id: { [Op.in]: userIds },
				is_active: true,
				clock_in: { [Op.ne]: null },
				created_at: {
					[Op.between]: [dayStart, dayEnd],
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
			const date = dayjs.utc(rec.clock_in).tz(BUSINESS_TZ).format("YYYY-MM-DD");
			if (dateWiseMap[date]) {
				const userName = userMap[rec.user_id];
				if (userName) {
					const clockInEST = dayjs.utc(rec.clock_in).tz(BUSINESS_TZ).toISOString();
					const clockOutEST = rec.clock_out
						? dayjs.utc(rec.clock_out).tz(BUSINESS_TZ).toISOString()
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
		const now = new Date();

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
				const autoClockOut = dayjs(clockIn).add(12, "hours").toDate();

				if (now >= autoClockOut) {
					// Calculate total hours
					const diffMs = autoClockOut - clockIn;
					const diffMins = Math.floor(diffMs / 60000);
					const hours = Math.floor(diffMins / 60);
					const minutes = diffMins % 60;
					const total_hours = `${hours} hours ${minutes} minutes`;

					const clock_out_est = dayjs(autoClockOut)
						.tz(BUSINESS_TZ)
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
				date: dateInTz(),
				employees: employeesWithoutClockOut,
			});
		}
	} catch (error) {
		console.error("❌ Auto clock-out failed:", error);
	}
};

// 	try {

// 		await Promise.all(
// 			incomplete.map(async (record) => {

// 			})
// 		);

// 	} catch (error) {

const syncClockInData = async () => {
	try {
		const driversSnapshot = await getDatabase().ref("drivers").once("value");
		const driversData = driversSnapshot.val();

		if (!driversData) {
			console.log("❌ No drivers data found in Firebase");
			return;
		}

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

			await b.update({
				status: "completed",
				break_end_lat: userLocations?.latitude ?? null,
				break_end_lng: userLocations?.longitude ?? null,
			});

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
		const dayKey = (date && toCalendarDate(date)) || dateInTz();

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

			const attendanceDay = dayjs
				.utc(b.attendence_break.clock_in_est)
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

		if (!employee_id || !date) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"employee_id and date are required.",
			);
		}

		// Convert EST time to UTC Date object
		const toUTC = (time) =>
			time ? inZone(time, BUSINESS_TZ).utc().toDate() : null;
		const toESTString = (time) =>
			time
				? inZone(time, BUSINESS_TZ).format("YYYY-MM-DD HH:mm:ss")
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
				clockOutUTC = toUTC(`${addDays(toCalendarDate(date), 1)} ${clock_out}`);
			}

			const diffMins = Math.floor((clockOutUTC - clockInUTC) / (1000 * 60));
			const hours = Math.floor(diffMins / 60);
			const minutes = diffMins % 60;
			totalHours = `${hours} hours ${minutes} minutes`;
		}


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
					// Overnight shift against the stored clock-in: move clock-out to the next day and save that
					clockOutUTC = toUTC(`${addDays(toCalendarDate(date), 1)} ${clock_out}`);
					record.clock_out = clockOutUTC;
					record.clock_out_est = toESTString(clockOutUTC);
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
				clock_in_est: toESTString(clockInUTC),
				clock_out: clockOutUTC,
				// from the corrected instant, so an overnight clock-out shows the next day
				clock_out_est: toESTString(clockOutUTC),
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
