/** @format */

const { status: httpStatus } = require("http-status");
const moment = require("moment");
const { Booking, Service, Profile, User, UserAttachment, ServiceAttachment, UserAddress, BookingAssignment, Country, State, City, BDMUser, Admin, BookingAttachment, ServiceChecklist, BookingServiceChecklist, ServiceChecklistMapping, Notification, ServiceChecklistHeading, GuestBookingAddress } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");
const {
  sendPushNotification,
  getUserActiveFCMTokens,
} = require("./notification.service");
const { sendEmailToAdmin } = require("./email.service");
const { notificationTypes } = require("../../config/types");
const convertToEST = require("../../config/timeManagement");

const createBooking = async (reqBody, files, headers) => {
  const { user, address_id, service_id, date, time, type, notes } = reqBody;
  const { timezone } = headers;

  try {
    const receiverUniqueFCMTokensArray = await getUserActiveFCMTokens(user);

    // let fcmTokenDocs = await UserToken.findAll({
    // 	where: {
    // 		user_id: user.id,
    // 		role_id: user.role_id,
    // 		is_active: true,
    // 		fcm_token: {
    // 			[Op.ne]: null,
    // 		},
    // 	},
    // 	attributes: ["fcm_token"],
    // });
    // if (!fcmTokenDocs) {
    // 	throw new ApiError(httpStatus.BAD_REQUEST, "This Fcm doesn't exist");
    // }

    // const receiverUniqueFCMTokensSet = new Set(
    // 	fcmTokenDocs.map((token) => token.fcm_token)
    // );
    // const receiverUniqueFCMTokensArray = Array.from(receiverUniqueFCMTokensSet);
    // Validate service_id
    const serviceDoc = await Service.findOne({
      where: { id: service_id },
    });
    if (!serviceDoc) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Service Id doesn't exist");
    }

    // Optional: Validate address_id if provided
    let addressDoc = null;
    if (address_id) {
      addressDoc = await UserAddress.findOne({
        where: { id: address_id },
      });
      if (!addressDoc) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Address Id");
      }
    }

    // Fetch BDM ID from BDMUser table for the user
    const bdmUser = await BDMUser.findOne({
      where: { user_id: user.id },
    });

    // Function to compute UTC date and time
    const computeUTCDateAndTime = (date, time) => {
      const localDateTime = moment.tz(
        `${date} ${time}`,
        "YYYY-MM-DD HH:mm:ss",
        timezone,
      );
      return {
        date_in_utc: localDateTime.utc().format("YYYY-MM-DD"),
        time_in_utc: localDateTime.utc().format("HH:mm:ss"),
      };
    };

    // Generate booking ID
    const bookingId = await generateBookingId(serviceDoc.id, date);
    const { date_in_utc, time_in_utc } = computeUTCDateAndTime(date, time);

    // Prepare booking object
    const bookingObj = {
      user_id: user.id,
      service_id,
      address_id: address_id || null,
      notes,
      type,
      booking_unique_id: bookingId,
      date,
      time,
      time_zone: timezone,
      date_in_utc,
      time_in_utc,
      bdm_id: bdmUser ? bdmUser.bdm_id : null,
      payment_status: "SUCCESS",
    };

    if (type === "Recurring Booking") {
      bookingObj.payment_status = "SUCCESS";
      bookingObj.is_recurring = true;
    }

    // Include address coordinates only if `addressDoc` is available
    if (addressDoc) {
      bookingObj.address_lat = addressDoc.address_lat;
      bookingObj.address_long = addressDoc.address_long;
    }

    // Create booking
    const bookingDoc = await Booking.create(bookingObj);
    if (!bookingDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create new Booking",
      );
    }

    // Save report_id along with images
    if (files && files.images && files.images.length !== 0) {
      for (let i = 0; i < files.images.length; i++) {
        let currImage = files.images[i];
        const bookingAttachmentObj = {
          booking_id: bookingDoc.id,
          user_id: user.id,
          title: "BEFORE SERVICE",
          file_type: "Image",
          file_name: currImage.filename,
          file_uri: "/images",
          file_size: currImage.size,
        };
        await BookingAttachment.create(bookingAttachmentObj);
      }
    }

    await sendBookingNotification(user, receiverUniqueFCMTokensArray);

    // Send email notifications to admin and user
    await sendEmailToAdmin(user, bookingDoc, serviceDoc);

    
    // await sendEmailToUser(user, bookingDoc, serviceDoc);

    return {
      booking_id: bookingDoc.id,
      // booking: bookingDoc,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

async function generateBookingId(serviceId, date) {
  const serviceDoc = await Service.findOne({ where: { id: serviceId } });
  if (!serviceDoc) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Service Id doesn't exist");
  }

  const dateStr =
    typeof date === "string" ? date : date.toISOString().split("T")[0];
  const parts = dateStr.split("-"); // [YYYY, MM, DD]

  const formattedDate = new Date(parts[0], parts[1] - 1, parts[2]);

  const bookingCount = await Booking.count({
    where: {
      service_id: serviceId,
      date: formattedDate,
    },
  });

  const day = parts[2].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[0].slice(2);

  const formattedDateString = `${day}${month}${year}`;
  const paddedCount = (bookingCount + 1).toString().padStart(2, "0");

  return `${serviceDoc.abbreviation}${formattedDateString}${paddedCount}`;
}

const sendBookingNotification = async (user, receiverUniqueFCMTokensArray) => {
  if (!receiverUniqueFCMTokensArray) {
    return;
  }
  console.log("receiverUniqueFCMTokensArray", receiverUniqueFCMTokensArray);
  let clickAction = `anc`;
  let notificationObj = {
    title: "SERVICE BOOKED",
    body: "Your Service has been booked successfully",
    notification_types: notificationTypes.SERVICE_BOOKED,
    // android: { // Specify android-specific properties
    //     notification: {
    //         clickAction: clickAction // Include click_action here
    //     }
    // }
  };

  condition: clickAction;

  console.log("notificationObj", notificationObj);

  await sendPushNotification(notificationObj, receiverUniqueFCMTokensArray);

  const savenotificationObj = {
    user_id: user.id,
    role_id: user.role_id,
    notification: notificationObj.body,
    title: notificationObj.title,
    notification_types: notificationObj.notification_types,
    is_active: true,
  };

  const saveNotificationDoc = await Notification.create(savenotificationObj);
  if (!saveNotificationDoc) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Error in saving Notifications",
    );
  }
};

const getAllUserBooking = async (body, booking_status) => {
  try {
    const { booking_status, user } = body;
    let whereCondition = {};

    if (booking_status === "UPCOMING") {
      whereCondition = {
        booking_status: ["PENDING", "ACCEPTED", "ONGOING"],
        is_active: 1,
        user_id: user.id,
        payment_status: "SUCCESS",
      };
    } else if (booking_status === "COMPLETED") {
      whereCondition = {
        booking_status: ["SUCCESS", "REJECTED", "CANCELLED"],
        is_active: 1,
        user_id: user.id,
        payment_status: "SUCCESS",
      };
    } else if (booking_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    const bookingDoc = await Booking.findAll({
      where: whereCondition,
      include: [
        {
          model: Service,
          as: "service_booking",
          attributes: ["name", "price", "abbreviation"],
          include: [
            {
              model: ServiceAttachment,
              as: "service_attachments",
              attributes: [
                "id",
                "file_type",
                "file_name",
                "file_uri",
                "service_id",
                "title",
              ],
            },
          ],
        },
        {
          model: Admin,
          as: "bdm_details",
          attributes: ["id", "email", "name"],
        },
        {
          model: BookingAttachment,
          as: "booking_attachment",
          where: {
            title: ["BEFORE SERVICE", "AFTER SERVICE"],
          },
          required: false,
        },
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          // where: { booking_id: true },
          required: false,
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email", "role_id"],
              required: false,
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id"],
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
            },
          ],
        },
        // {
        // 	model: BookingAssignment,
        // 	as: "booking_employee_details",
        // 	required: false,
        // 	include: [
        // 		{
        // 			model: User,
        // 			as: "employee_profile",
        // 			attributes: ["id", "email"],
        // 			required: false,
        // 			include: [
        // 				{
        // 					model: Profile,
        // 					as: "user_profile",
        // 					attributes: ["name", "user_id"],
        // 				},
        // 				{
        // 					model: UserAttachment,
        // 					as: "user_attachments",
        // 					attributes: [
        // 						"id",
        // 						"title",
        // 						"file_type",
        // 						"file_name",
        // 						"file_uri",
        // 						"role_id",
        // 					],
        // 					order: [["id", "desc"]],
        // 					limit: 1,
        // 				},
        // 			],
        // 		},
        // 	],
        // },
        {
          model: UserAddress,
          as: "booking_address",
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
        },
      ],
      order: [["date", "ASC"]],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      return [];
    }

    return bookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getBookingById = async (id) => {
  try {
    const bookingDoc = await Booking.findByPk(id, {
      include: [
        {
          model: Service,
          as: "service_booking",
          attributes: ["name", "price", "abbreviation"],
          include: [
            {
              model: ServiceAttachment,
              as: "service_attachments",
              attributes: [
                "id",
                "file_type",
                "file_name",
                "file_uri",
                "service_id",
                "title",
              ],
            },
          ],
        },
        {
          model: Admin,
          as: "bdm_details",
          attributes: ["id", "email", "name"],
        },
        {
          model: BookingAttachment,
          as: "booking_attachment",
          where: {
            title: ["BEFORE SERVICE", "AFTER SERVICE"],
          },
          required: false,
        },
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          // where: { booking_id: true },
          required: false,
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email", "role_id"],
              required: false,
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id"],
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
            },
          ],
        },
        {
          model: UserAddress,
          as: "booking_address",
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
        },
      ],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "No bookings found");
    }

    return bookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const cancelBookingbyUser = async (reqBody) => {
  const { booking_id, user, reason } = reqBody;

  try {
    // Validate booking existence
    const bookingDoc = await Booking.findOne({
      where: { id: booking_id, user_id: user.id, is_active: true },
    });

    if (!bookingDoc) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Booking not found or already inactive",
      );
    }

    // Check if the booking is already ongoing or canceled
    if (["ONGOING", "CANCELLED"].includes(bookingDoc.booking_status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Booking cannot be canceled as it is already ${bookingDoc.booking_status}`,
      );
    }

    // Update the cancellation reason and status
    bookingDoc.cancellation_reason_by_user = reason;
    bookingDoc.booking_status = "CANCELLED";

    await bookingDoc.save();
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateBookingStatusByEmployee = async (reqBody) => {
  try {
    const bookingDoc = await Booking.findOne({
      where: { id: reqBody.booking_id },
    });
    if (!bookingDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking Id not found");
    }

    // const userDoc = await User.findByPk(bookingDoc.user_id);
    // if (!userDoc) {
    // 	throw new ApiError(httpStatus.BAD_REQUEST, "User not found");
    // }

    // console.log(userDoc, "userDoc");
    if (
      reqBody.booking_status &&
      typeof reqBody.booking_status !== "undefined" &&
      reqBody.booking_status !== ""
    ) {
      bookingDoc["booking_status"] = reqBody.booking_status;

      // Set start_time if the booking_status is "ONGOING"
      if (reqBody.booking_status === "ONGOING") {
        bookingDoc["start_time"] = new Date();
        // await sendStartedNotification(userDoc);
      }

      // Set end_time if the booking_status is "SUCCESS"
      if (reqBody.booking_status === "SUCCESS") {
        bookingDoc["end_time"] = new Date();
        // await sendSuccessNotification(userDoc);
      }
    }

    await bookingDoc.save();
    return "Booking status updated successfully";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};



const uploadImages = async (reqBody, files) => {
  const { user } = reqBody;
  try {
    const bookingDoc = await Booking.findOne({
      where: { id: reqBody.booking_id },
    });
    if (!bookingDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking Id not found");
    }

    // Upload image with title COMPLETED
    if (files && files.images && files.images.length !== 0) {
      for (let i = 0; i < files.images.length; i++) {
        let currImage = files.images[i];
        const bookingAttachmentObj = {
          booking_id: reqBody.booking_id,
          user_id: bookingDoc.user_id,
          supervisor_id: user.id,
          title: "AFTER SERVICE",
          file_type: "Image",
          file_name: currImage.filename,
          file_uri: "/images",
          file_size: currImage.size,
        };
        await BookingAttachment.create(bookingAttachmentObj);
      }
    }
    await bookingDoc.save();
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllServiceCheckList = async (reqBody, booking_id) => {
  try {
    const { user } = reqBody;
    // Step 1: Get service_id from the Booking Table
    const booking = await Booking.findByPk(booking_id, {
      attributes: ["service_id"],
    });

    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    // Step 2: Get all active checklist headings with their tasks
    const headings = await ServiceChecklistHeading.findAll({
      where: { is_active: true, role_id: user.role_id },
      attributes: ["id", "title"],
      order: [["created_at", "ASC"]],
      include: [
        {
          model: ServiceChecklist,
          as: "service_checklists",
          required: true,
          attributes: ["id", "task"],
          include: [
            {
              model: ServiceChecklistMapping,
              as: "service_mapping",
              where: { service_id: booking.service_id },
              attributes: [],
              required: true,
            },
            {
              model: BookingServiceChecklist,
              as: "booking_checklist",
              where: { booking_id },
              attributes: ["is_completed"],
              required: false,
            },
          ],
        },
      ],
    });

    // Step 3: Format the response
    const formatted = headings.map((heading) => ({
      heading_id: heading.id,
      heading_title: heading.title,
      tasks: heading.service_checklists.map((checklist) => ({
        id: checklist.id,
        task: checklist.task,
        booking_id: booking_id,
        is_completed: checklist.booking_checklist
          ? checklist.booking_checklist.is_completed
          : false,
      })),
    }));

    return formatted;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve service checklist with headings.",
    );
  }
};

const getAllServiceCheckListByUserForBookingId = async (booking_id) => {
  try {
    // Step 1: Get service_id from the Booking Table
    const booking = await Booking.findByPk(booking_id, {
      attributes: ["service_id"],
    });

    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    // Step 2: Get all active checklist headings with their tasks
    const headings = await ServiceChecklistHeading.findAll({
      where: { is_active: true, role_id: "7" },
      attributes: ["id", "title"],
      order: [["created_at", "ASC"]],
      include: [
        {
          model: ServiceChecklist,
          as: "service_checklists",
          required: true,
          attributes: ["id", "task"],
          include: [
            {
              model: ServiceChecklistMapping,
              as: "service_mapping",
              where: { service_id: booking.service_id },
              attributes: [],
              required: true,
            },
            {
              model: BookingServiceChecklist,
              as: "booking_checklist",
              where: { booking_id },
              attributes: ["is_completed"],
              required: false,
            },
          ],
        },
      ],
    });

    console.log(headings, "headings");

    // Step 3: Format the response
    const formatted = headings.map((heading) => ({
      heading_id: heading.id,
      heading_title: heading.title,
      tasks: heading.service_checklists.map((checklist) => ({
        id: checklist.id,
        task: checklist.task,
        booking_id: booking_id,
        is_completed: checklist.booking_checklist
          ? checklist.booking_checklist.is_completed
          : false,
      })),
    }));

    return formatted;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve service checklist with headings.",
    );
  }
};

const getAllServiceCheckListByBookingId = async (booking_id) => {
  try {
    // Step 1: Get service_id from the Booking Table
    const booking = await Booking.findByPk(booking_id, {
      attributes: ["service_id"],
    });

    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    // Step 2: Get all headings with tasks filtered by service_id via mapping
    const headings = await ServiceChecklistHeading.findAll({
      where: { is_active: true },
      attributes: ["id", "title"],
      order: [["created_at", "ASC"]],
      include: [
        {
          model: ServiceChecklist,
          as: "service_checklists",
          required: true,
          attributes: ["id", "task"],
          include: [
            {
              model: ServiceChecklistMapping,
              as: "service_mapping",
              where: { service_id: booking.service_id },
              required: true,
              attributes: [],
            },
            {
              model: BookingServiceChecklist,
              as: "booking_checklist",
              where: { booking_id },
              required: false,
              attributes: ["is_completed", "created_at"],
            },
          ],
        },
      ],
    });

    // Step 3: Collect unique created_at dates to group by Day 1 / Day 2 etc.
    const uniqueDates = new Set();

    // Step 4: Format the headings and tasks
    const formattedHeadings = headings.map((heading) => {
      const tasks = heading.service_checklists.map((checklist) => {
        let estDateString = null;
        let dateKey = null;

        if (checklist.booking_checklist?.created_at) {
          estDateString = convertToEST(checklist.booking_checklist.created_at); // Implement your timezone logic
          dateKey = estDateString.split(" ")[0]; // 'YYYY-MM-DD'
          uniqueDates.add(dateKey);
        }

        return {
          id: checklist.id,
          task: checklist.task,
          booking_id: booking_id,
          is_completed: checklist.booking_checklist
            ? checklist.booking_checklist.is_completed
            : false,
          date: estDateString,
          _dayValue: dateKey,
        };
      });

      return {
        heading_id: heading.id,
        heading_title: heading.title,
        tasks,
      };
    });

    // Step 5: Generate Day 1, Day 2 labels
    const sortedDates = Array.from(uniqueDates).sort();
    const dateToDayMap = {};
    sortedDates.forEach((date, idx) => {
      dateToDayMap[date] = `Day ${idx + 1}`;
    });

    // Step 6: Final pass to add day label
    const checklistGrouped = formattedHeadings.map((heading) => ({
      heading_id: heading.heading_id,
      heading_title: heading.heading_title,
      tasks: heading.tasks.map((task) => ({
        ...task,
        day: task._dayValue ? dateToDayMap[task._dayValue] : null,
      })),
    }));

    return checklistGrouped;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to retrieve checklist headings and tasks",
    );
  }
};

const markChecklistItemAsCompleted = async (reqBody, id) => {
  try {
    const { booking_id } = reqBody;

    if (!booking_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Booking ID is required.");
    }

    console.log("Booking ID:", booking_id);
    console.log("Checklist ID:", id);

    // Step 1: Check if the checklist item exists
    const serviceChecklistItem = await ServiceChecklist.findByPk(id);
    if (!serviceChecklistItem) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Service checklist item not found.",
      );
    }

    // Step 2: Check if checklist is already marked for the booking
    let bookingChecklistItem = await BookingServiceChecklist.findOne({
      where: { booking_id: booking_id, service_checklist_id: id },
    });

    console.log("Found item in DB:", bookingChecklistItem?.toJSON());

    if (bookingChecklistItem) {
      // Toggle `is_completed` if the entry exists
      bookingChecklistItem.is_completed = !bookingChecklistItem.is_completed;
      await bookingChecklistItem.save();
    } else {
      // If no entry exists, create a new one with `is_completed = true`
      bookingChecklistItem = await BookingServiceChecklist.create({
        booking_id,
        service_checklist_id: id,
        is_completed: true,
      });
    }

    // ✅ Return Success Response
    return {
      success: true,
      message: `Checklist item marked as ${
        bookingChecklistItem.is_completed ? "completed" : "incomplete"
      }`,
      data: {
        booking_id,
        service_checklist_id: id,
        is_completed: bookingChecklistItem.is_completed,
      },
    };
  } catch (error) {
    console.error("Error marking checklist item:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal server error.",
    );
  }
};

const getAllEmployeeBooking = async (body, booking_status) => {
  try {
    const { user } = body;
    let whereCondition = {};

    if (booking_status === "UPCOMING") {
      whereCondition = {
        booking_status: ["PENDING", "ACCEPTED", "ONGOING"],
        is_active: true,
      };
    } else if (booking_status === "COMPLETED") {
      whereCondition = {
        booking_status: ["SUCCESS", "REJECTED", "DELETED"],
        is_active: true,
      };
    } else if (booking_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    // Fetch bookings assigned to the employee from BookingAssignment
    const bookingAssignments = await BookingAssignment.findAll({
      where: { employee_id: user.id }, // Get only bookings assigned to the employee
      attributes: ["booking_id"],
    });

    // Extract booking IDs
    const assignedBookingIds = bookingAssignments.map(
      (assignment) => assignment.booking_id,
    );

    if (assignedBookingIds.length === 0) {
      return [];
    }

    // Fetch booking details based on the assigned booking IDs
    const bookingDoc = await Booking.findAll({
      where: {
        ...whereCondition,
        id: assignedBookingIds, // Filter bookings that match assigned booking IDs
      },
      include: [
        {
          model: Service,
          as: "service_booking",
          attributes: ["name", "price", "abbreviation"],
          include: [
            {
              model: ServiceAttachment,
              as: "service_attachments",
              attributes: [
                "id",
                "file_type",
                "file_name",
                "file_uri",
                "service_id",
                "title",
              ],
            },
          ],
        },
        {
          model: UserAddress,
          as: "booking_address",
        },
        {
          model: GuestBookingAddress,
          as: "booking_non_client_address",
          // include: [
          // 	{
          // 		model: Country,
          // 		as: "non_client_user_country",
          // 		attributes: ["id", "name", "iso3"],
          // 	},
          // 	{
          // 		model: State,
          // 		as: "non_client_user_state",
          // 		attributes: ["id", "name", "country_id", "iso2"],
          // 	},
          // 	{
          // 		model: City,
          // 		as: "non_client_user_city",
          // 		attributes: ["id", "name", "country_id", "state_id"],
          // 	},
          // ],
        },
        {
          model: Admin,
          as: "bdm_details",
          attributes: ["id", "email", "name"],
        },
        {
          model: User,
          as: "booking_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: [
                "name",
                "dialing_code",
                "mobile",
                "is_active",
                "created_at",
                "address",
                "dob",
              ],
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
        },
        {
          model: BookingAttachment,
          as: "booking_attachment",
          where: {
            title: ["BEFORE SERVICE", "AFTER SERVICE"],
          },
          required: false,
        },
        // {
        // 	model: BookingAssignment,
        // 	as: "booking_employee_details",
        // 	attributes: ["employee_id", "role_id"],
        // 	include: [
        // 		{
        // 			model: User,
        // 			as: "employee_profile",
        // 			attributes: ["id", "email"],
        // 			include: [
        // 				{
        // 					model: Profile,
        // 					as: "user_profile",
        // 					attributes: ["name", "mobile"],
        // 				},
        // 			],
        // 		},
        // 	],
        // },
      ],

      order: [["date", "DESC"]],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      return [];
    }

    return bookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getTodaysBooking = async (body) => {
  try {
    const { user } = body;

    // Get the current date range (start & end of today)
    const todayStart = moment().startOf("day").format("YYYY-MM-DD");
    const todayEnd = moment().endOf("day").format("YYYY-MM-DD");

    // Fetch today's bookings assigned to the service provider (employee)
    const bookingDoc = await Booking.findAndCountAll({
      where: {
        booking_status: {
          [Op.in]: ["ACCEPTED", "ONGOING"], // Include accepted and ongoing bookings
        },
        date: {
          [Op.between]: [todayStart, todayEnd], // Filter bookings for today
        },
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          where: {
            employee_id: user.id, // Fetch only assigned bookings for this employee
          },
          include: [
            {
              model: User,
              as: "employee_profile",
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
        },
      ],
    });

    return bookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getCompletedBooking = async (body) => {
  try {
    const { user } = body;

    // Fetch completed bookings assigned to the employee
    const completedBookingDoc = await Booking.findAndCountAll({
      where: {
        booking_status: "SUCCESS",
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          where: {
            employee_id: user.id, // Fetch only assigned bookings for this employee
          },
          include: [
            {
              model: User,
              as: "employee_profile",
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
        },
      ],
    });

    return completedBookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  createBooking,
  getAllUserBooking,
  generateBookingId,
  getBookingById,
  cancelBookingbyUser,

  updateBookingStatusByEmployee,
  uploadImages,
  getAllServiceCheckList,
  getAllServiceCheckListByBookingId,
  getAllServiceCheckListByUserForBookingId,
  markChecklistItemAsCompleted,
  getAllEmployeeBooking,
  getTodaysBooking,
  getCompletedBooking,
};
