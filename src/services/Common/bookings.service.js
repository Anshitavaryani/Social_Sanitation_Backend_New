/** @format */

const { status: httpStatus } = require("http-status");
const { inZone, dateInTz, DATETIME_FORMAT, DATE_FORMAT, TIME_FORMAT, toBusinessDateTime, utcDate } = require("../../utils/time");
const { Booking, Service, Profile, User, UserAttachment, ServiceAttachment, UserAddress, BookingAssignment, Country, State, City, BDMUser, Admin, BookingAttachment, ServiceChecklist, BookingServiceChecklist, ServiceChecklistMapping, Notification, ServiceChecklistHeading, GuestBookingAddress } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { ROLE } = require("../../config/roles");
const { Op } = require("sequelize");
const {
  sendPushNotification,
  getUserActiveFCMTokens,
} = require("./notification.service");
const { sendEmailToAdmin } = require("./email.service");
const { notificationTypes, bookingListFilterTypes, bookingTypes, paymentStatusTypes } = require("../../config/types");

const createBooking = async (reqBody, files, headers) => {
  const { user, address_id, service_id, date, time, type, notes } = reqBody;
  const { timezone } = headers;

  try {
    const receiverUniqueFCMTokensArray = await getUserActiveFCMTokens(user);

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
      const localDateTime = inZone(
        `${date} ${time}`,
        timezone,
        DATETIME_FORMAT,
      );
      return {
        date_in_utc: localDateTime.utc().format(DATE_FORMAT),
        time_in_utc: localDateTime.utc().format(TIME_FORMAT),
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
      payment_status: paymentStatusTypes.SUCCESS,
    };

    if (type === "Recurring Booking") {
      bookingObj.payment_status = paymentStatusTypes.SUCCESS;
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
    typeof date === "string" ? date : utcDate(date);
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

// The booking is already saved: the push is skipped when the user has no push tokens and a
// failed push is logged; the in-app notification is saved either way
const sendBookingNotification = async (user, receiverUniqueFCMTokensArray) => {
  let clickAction = `anc`;
  let notificationObj = {
    title: "SERVICE BOOKED",
    body: "Your Service has been booked successfully",
    notification_types: notificationTypes.SERVICE_BOOKED,
  };

  condition: clickAction;

  if (receiverUniqueFCMTokensArray?.length) {
    try {
      // FCM's notification object only takes title, body and image: an extra key fails the push
      const { title, body } = notificationObj;
      await sendPushNotification({ title, body }, receiverUniqueFCMTokensArray);
    } catch (error) {
      console.error("Booking push notification not sent:", error.message);
    }
  }

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

    if (booking_status === bookingListFilterTypes.UPCOMING) {
      whereCondition = {
        booking_status: [bookingTypes.PENDING, bookingTypes.ACCEPTED, bookingTypes.ONGOING],
        is_active: 1,
        user_id: user.id,
        payment_status: paymentStatusTypes.SUCCESS,
      };
    } else if (booking_status === bookingListFilterTypes.COMPLETED) {
      whereCondition = {
        booking_status: [bookingTypes.SUCCESS, bookingTypes.REJECTED, bookingTypes.CANCELLED],
        is_active: 1,
        user_id: user.id,
        payment_status: paymentStatusTypes.SUCCESS,
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
    if ([bookingTypes.ONGOING, bookingTypes.CANCELLED].includes(bookingDoc.booking_status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Booking cannot be canceled as it is already ${bookingDoc.booking_status}`,
      );
    }

    // Update the cancellation reason and status
    bookingDoc.cancellation_reason_by_user = reason;
    bookingDoc.booking_status = bookingTypes.CANCELLED;

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

    if (
      reqBody.booking_status &&
      typeof reqBody.booking_status !== "undefined" &&
      reqBody.booking_status !== ""
    ) {
      bookingDoc["booking_status"] = reqBody.booking_status;

      // Set start_time if the booking_status is "ONGOING"
      if (reqBody.booking_status === bookingTypes.ONGOING) {
        bookingDoc["start_time"] = new Date();
      }

      // Set end_time if the booking_status is "SUCCESS"
      if (reqBody.booking_status === bookingTypes.SUCCESS) {
        bookingDoc["end_time"] = new Date();
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
      where: { is_active: true, role_id: ROLE.SUPERVISOR },
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
          estDateString = toBusinessDateTime(checklist.booking_checklist.created_at);
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

    if (booking_status === bookingListFilterTypes.UPCOMING) {
      whereCondition = {
        booking_status: [bookingTypes.PENDING, bookingTypes.ACCEPTED, bookingTypes.ONGOING],
        is_active: true,
      };
    } else if (booking_status === bookingListFilterTypes.COMPLETED) {
      whereCondition = {
        booking_status: [bookingTypes.SUCCESS, bookingTypes.REJECTED, bookingTypes.DELETED],
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
    const todayStart = dateInTz();
    const todayEnd = todayStart;

    // Fetch today's bookings assigned to the service provider (employee)
    const bookingDoc = await Booking.findAndCountAll({
      where: {
        booking_status: {
          [Op.in]: [bookingTypes.ACCEPTED, bookingTypes.ONGOING], // Include accepted and ongoing bookings
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
        booking_status: bookingTypes.SUCCESS,
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
