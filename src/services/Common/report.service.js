/** @format */

const { status: httpStatus } = require("http-status");

const ApiError = require("../../utils/ApiError");
const { reportTypes } = require("../../config/types");
const {
	Booking,
	Report,
	User,
	Profile,
	BookingAttachment,
	Service,
} = require("../../models");

const reportBooking = async (body, files, id) => {
	try {
		const { user, reason } = body;

		// Find the appointment document
		const appointmentDoc = await Booking.findOne({
			where: { is_active: true, id: id },
		});
		if (!appointmentDoc)
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Appointment Id.");

		// Create the report and get the report ID
		const reportDoc = await Report.create({
			reported_by: user.id,
			reported_to: appointmentDoc.counselor_id,
			booking_id: id,
			reporter_role_id: user.role_id,
			reported_role_id: null,
			report_reason: reason || null,
			report_type: "Booking Report",
		});

		// Save report_id along with images
		if (files && files.images && files.images.length !== 0) {
			for (let i = 0; i < files.images.length; i++) {
				let currImage = files.images[i];
				const bookingAttachmentObj = {
					booking_id: id,
					report_id: reportDoc.id, // ✅ Save report_id here
					user_id: user.id,
					title: "REPORT BOOKING",
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				};
				await BookingAttachment.create(bookingAttachmentObj);
			}
		}

		await appointmentDoc.save();

		return { message: "Report created successfully", report_id: reportDoc.id };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAllReport = async () => {
	try {
		let result = "";

		result = await Report.findAll({
			include: [
				{
					model: User,
					as: "report_user",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
				{
					model: User,
					as: "report_counselor",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
				{
					model: Booking,
					as: "report_booking",
					include: [
						{
							model: Service,
							as: "service_booking",
							attributes: ["name", "price"],
						},
						{
							model: BookingAttachment,
							as: "booking_attachment",
						},
					],
				},
			],
			where: { is_active: true },
			order: [["id", "DESC"]],
		});
		if (!result)
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Failed to Get All Fess Change List.",
			);
		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const getAllUserReport = async (reqBody, headers) => {
	try {
		const { user } = reqBody;
		const { role_id } = headers;
		let whereCondition = { is_active: true, reported_by: user.id };

		// Fetch reports with the appropriate filters
		const result = await Report.findAll({
			include: [
				{
					model: User,
					as: "report_user",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
				{
					model: User,
					as: "report_counselor",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
				{
					model: Booking,
					as: "report_booking",
				},
				{
					model: BookingAttachment,
					as: "report_booking_attachment",
				},
			],
			where: whereCondition,
			order: [["id", "DESC"]],
		});

		if (!result.length) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"No reports found matching the criteria.",
			);
		}

		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

const updateReportStatus = async (reqBody) => {
	try {
		const { reportId, action } = reqBody;

		// Validate the action type
		if (![reportTypes.COMPLETED, reportTypes.PENDING].includes(action)) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Invalid action. Action must be either 'COMPLETED' or 'PENDING'.",
			);
		}

		// Fetch the report and validate its existence and current status
		let reportDoc = await Report.findOne({
			where: {
				id: reportId,
				is_active: true,
			},
		});

		if (!reportDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Report Id.");
		}

		// Update the status of the report
		reportDoc.status = action;
		await reportDoc.save();

		return {
			message: `Report status updated to ${action} successfully.`,
			report: reportDoc,
		};
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message,
		);
	}
};

module.exports = {
	reportBooking,
	getAllReport,
	getAllUserReport,
	updateReportStatus,
};
