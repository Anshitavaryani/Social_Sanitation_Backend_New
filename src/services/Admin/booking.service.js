/** @format */

const { status: httpStatus } = require("http-status");
const logger = require("../../config/logger");
const { attendanceStatusTypes, bookingListFilterTypes, bookingTypes, paymentStatusTypes } = require("../../config/types");
const {
  dayjs,
  inZone,
  BUSINESS_TZ,
  dateInTz,
  nowWallClock,
  calendarDateUtc,
  toCalendarDate,
  bookingUtcParts,
  addDays,
  isoWeekStart,
  DATETIME_FORMAT,
  DATE_FORMAT,
  SHORT_TIME_FORMAT,
  TIME_FORMAT,
  formatDisplayDate,
  formatTime12h,
  isValidDate,
  utcDate,
} = require("../../utils/time");
const { randomUUID: uuidv4 } = require("crypto");

const { Booking, Service, Profile, User, UserAttachment, ServiceAttachment, UserAddress, BookingAssignment, Country, State, City, BookingAttachment, BDMUser, Admin, Attendance, GuestBookingAddress, Break, AttendancePayroll } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { ATTENDANCE, BOOKING, PAGINATION } = require("../../config/rules");
const { parsePagination } = require("../../utils/pagination");
const { distanceInKm } = require("../../utils/geo");
const { attendanceStatus } = require("../../utils/attendanceStatus");
const toBoolean = require("../../utils/toBoolean");
const { ROLE, EMPLOYEE_ROLE_IDS } = require("../../config/roles");
const { Sequelize, Op } = require("sequelize");
const config = require("../../config/config");
const { sendEmailToAdmin, sendClockOutDistanceEmail, sendGroupedAttendanceEmail, sendTwoWeekScheduleEmail } = require("../Common/email.service");
const { generateBookingId } = require("../Common/bookings.service");
const { firstAttendanceByUser, breaksByAttendance, payrollByAttendance, profileNamesByUserId } = require("../Common/batchLookup");
const getCoordinatesFromGoogleMapLink = require("../../config/getCoordinatesFromGoogleMapLink");
const { getDatabase, ServerValue } = require("firebase-admin/database");

const getAllBookings = async (reqBody) => {
  try {
    const today = calendarDateUtc().toDate();

    const { booking_status, period } = reqBody;

    // ─── Pagination — defaults kept generous so existing frontend calls
    // that don't send these yet still work, but no longer unbounded. ───
    const { page, limit, offset } = parsePagination(reqBody, PAGINATION.ADMIN_BOOKINGS_PAGE_SIZE);

    let whereCondition = {};

    if (booking_status === bookingTypes.ONGOING) {
      whereCondition = {
        booking_status: bookingTypes.ONGOING,
        is_active: true,
        payment_status: paymentStatusTypes.SUCCESS,
      };
    } else if (booking_status === bookingListFilterTypes.COMPLETED) {
      const today = calendarDateUtc();
      if (period === "today") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING, bookingTypes.RESCHEDULED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.toDate(),
            [Op.lt]: today.clone().add(1, "days").toDate(),
          },
        };
      } else if (period === "past_30_days") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING, bookingTypes.RESCHEDULED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.clone().subtract(30, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "past_90_days") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING, bookingTypes.RESCHEDULED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.clone().subtract(90, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "all") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING, bookingTypes.RESCHEDULED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.lt]: today.toDate(),
          },
        };
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid period parameter for COMPLETED bookingStatus",
        );
      }
    } else if (booking_status === bookingTypes.CANCELLED) {
      whereCondition = {
        booking_status: [bookingTypes.REJECTED, bookingTypes.DELETED, bookingTypes.CANCELLED],
        is_active: true,
        payment_status: paymentStatusTypes.SUCCESS,
      };
    } else if (booking_status === bookingListFilterTypes.UPCOMING) {
      if (period === "today") {
        const today = calendarDateUtc();
        whereCondition = {
          booking_status: [bookingTypes.ACCEPTED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.toDate(),
            [Op.lt]: today.clone().add(1, "days").toDate(),
          },
        };
      } else if (period === "current_week") {
        const endOfWeek = calendarDateUtc(addDays(isoWeekStart(), 6)).endOf("day");
        whereCondition = {
          booking_status: [bookingTypes.ACCEPTED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today,
            [Op.lt]: endOfWeek.toDate(),
          },
        };
      } else if (period === "current_month") {
        const endOfMonth = calendarDateUtc().endOf("month");
        whereCondition = {
          booking_status: [bookingTypes.ACCEPTED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today,
            [Op.lt]: endOfMonth.toDate(),
          },
        };
      } else if (period === "all") {
        whereCondition = {
          booking_status: [bookingTypes.ACCEPTED],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today,
          },
        };
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid period parameter for UPCOMING bookingStatus",
        );
      }
    } else if (booking_status === bookingTypes.PENDING) {
      whereCondition = {
        booking_status: [bookingTypes.PENDING, bookingTypes.RESCHEDULED],
        is_active: true,
        payment_status: paymentStatusTypes.SUCCESS,
        date: {
          [Op.gte]: today,
        },
      };
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    // ─── NEW: search across ALL bookings of this tab (not just one page) ───
    const searchText =
      typeof reqBody.search === "string" ? reqBody.search.trim() : "";
    if (searchText) {
      const escaped = searchText.replace(/[\\%_]/g, "\\$&");
      const like = { [Op.like]: `%${escaped}%` };
      whereCondition = {
        ...whereCondition,
        [Op.or]: [
          { booking_name: like },
          { client_name: like }, // remove this line if Booking has no client_name column
          { "$booking_user.user_profile.name$": like },
        ],
      };
    }

    const { count, rows: bookingDoc } = await Booking.findAndCountAll({
      attributes: [
        "id",
        "booking_status",
        "user_id",
        "date",
        "booking_name",
        "type",
      ],

      where: whereCondition,
      distinct: true, // count distinct Booking.id, not joined row count
      subQuery: false, // NEW: lets $booking_user.user_profile.name$ work with limit/offset
      limit,
      offset,
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          attributes: ["id", "booking_id", "employee_id", "role_id"],
          separate: true, // fetch via a second query instead of a JOIN —
          // prevents the main bookings query from multiplying rows per
          // assignment, which was the main cause of the slow ACCEPTED query
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "booking_user",
          attributes: ["id"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["date", "ASC"]],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      return { data: [], total: count, page, limit };
    }

    return { data: bookingDoc, total: count, page, limit };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getBookingById = async (id) => {
  try {
    const bookingDoc = await Booking.findByPk(id, {
      include: [
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
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id", "mobile"],
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
          model: Service,
          as: "service_booking",
          attributes: ["name", "price"],
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
          model: BookingAttachment,
          as: "booking_attachment",
          where: {
            title: ["BEFORE SERVICE", "AFTER SERVICE"],
          },
          required: false,
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
              attributes: ["id", "name", "country_id", "iso2"],
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name", "country_id", "state_id"],
            },
          ],
        },
        {
          model: GuestBookingAddress,
          as: "booking_non_client_address",
          include: [
            {
              model: Country,
              as: "non_client_user_country",
              attributes: ["id", "name", "iso3"],
            },
            {
              model: State,
              as: "non_client_user_state",
              attributes: ["id", "name", "country_id", "iso2"],
            },
            {
              model: City,
              as: "non_client_user_city",
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
    throw ApiError.from(error);
  }
};





const checkBookingRequest = async () => {
  try {
    // Define the condition for fetching pending and active bookings
    const whereCondition = {
      booking_status: bookingTypes.PENDING,
      is_active: true,
      payment_status: paymentStatusTypes.SUCCESS,
    };

    // Check the count of bookings matching the condition
    const bookingCount = await Booking.count({
      where: whereCondition,
    });

    // Return an object with presence status and count
    return {
      hasBookings: bookingCount > 0,
      count: bookingCount,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};


async function updateRecurringBookingWithEditMode(
  bookingId,
  updateData,
  edit_mode,
  createRecurringBookings, // ✅ passed as a dependency
) {
  try {
    const bookingDoc = await Booking.findByPk(bookingId);
    if (!bookingDoc) throw new Error("Booking not found");

    const recurrenceId = bookingDoc.recurrence_id;

    if (!recurrenceId || edit_mode === "this") {
      // 🛡️ Filter allowed fields
      const allowedKeys = [
        "booking_name",
        "client_name",
        "date",
        "time",
        "end_time_by_admin",
        "booking_status",
        "google_map_link",
      ];
      const filteredUpdate = Object.fromEntries(
        Object.entries(updateData).filter(([key]) => allowedKeys.includes(key)),
      );

      await bookingDoc.update(filteredUpdate);

      return {
        success: true,
        message: `Single booking updated (${edit_mode})`,
      };
    }

    if (edit_mode === "following" || edit_mode === "all") {
      // Pure YYYY-MM-DD string – avoids timezone shift when comparing DATE columns
      const bookingDateStr =
        typeof bookingDoc.date === "string"
          ? bookingDoc.date.split("T")[0]
          : toCalendarDate(bookingDoc.date);

      // 1. Decide delete condition
      const whereCondition =
        edit_mode === "following"
          ? { recurrence_id: recurrenceId, date: { [Op.gt]: bookingDateStr } }
          : { recurrence_id: recurrenceId }; // 🔥 delete ALL in series

      // 2. Stop the existing recurrence chain
      await Booking.update(
        { recurrence_end_value: updateData.recurrence_end_value },
        { where: whereCondition },
      );

      // 3. Delete bookings as per edit mode
      await Booking.destroy({ where: whereCondition });

      // 4. Generate new recurrence_id
      const newRecurrenceId = uuidv4();

      // 5. Update current booking with new recurrence_id and values
      await bookingDoc.update({
        ...updateData,
        recurrence_id: newRecurrenceId,
        parent_id: bookingDoc.id,
      });

      // 6. Convert date & time to UTC
      const { date_in_utc, time_in_utc } = bookingUtcParts(
        bookingDoc.date,
        bookingDoc.time,
        bookingDoc.time_zone, // assume you store timezone
      );

      await bookingDoc.update({
        date_in_utc,
        time_in_utc,
      });

      // 7. Create new recurring bookings
      await createRecurringBookings({
        baseBooking: bookingDoc.get({ plain: true }),
        user_id: bookingDoc.user_id,
        booking_name: updateData.booking_name,
        client_name: updateData.client_name,
        recurring_every: updateData.recurring_every,
        recurring_type: updateData.recurring_type,
        repeat_on_days: updateData.repeat_on_days,
        recurrence_end_type: updateData.recurrence_end_type,
        recurrence_end_value: updateData.recurrence_end_value,
        recurrence_id: newRecurrenceId,
      });

      return {
        success: true,
        message: `Recurring series updated (${edit_mode})`,
      };
    }

    throw new Error("Unknown edit_mode");
  } catch (err) {
    logger.error("Error in updateRecurringBookingWithEditMode:", err);
    return {
      success: false,
      status: 500,
      message: err.message || "Something went wrong",
      data: "",
    };
  }
}

const updateBookingStatus = async (reqBody) => {
  let {
    booking_id,
    date,
    time,
    end_time_by_admin,
    booking_name,
    client_name,
    google_map_link,
    booking_status,
    cleaners,
    supervisors,
    quality_inspectors,
    remove_employees,
    recurring_every,
    recurring_type,
    repeat_on_days,
    recurrence_end_type,
    recurrence_end_value,
  } = reqBody;


  let is_recurring = reqBody.is_recurring;

  if (typeof is_recurring === "string") {
    is_recurring = toBoolean(is_recurring);
  }


  try {
    const bookingDoc = await Booking.findByPk(booking_id);
    if (!bookingDoc) {
      logger.error("Booking not found with ID:", booking_id);
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    // If date & time are being updated, compute UTC versions
    let updateData = {
      booking_status,
      google_map_link,
      time,
      booking_name,
      end_time_by_admin,
    };


    const formatDate = (inputDate) => toCalendarDate(inputDate);

    let effectiveDate =
      date || (bookingDoc.date ? formatDate(bookingDoc.date) : null);
    let effectiveTime = time || bookingDoc.time;


    if (effectiveDate && effectiveTime && bookingDoc.time_zone) {
      const { date_in_utc, time_in_utc } = bookingUtcParts(
        effectiveDate,
        effectiveTime,
        bookingDoc.time_zone,
      );


      updateData = {
        ...updateData,
        date,
        time,
        date_in_utc,
        time_in_utc,
      };

      // ensure we still include end_time_by_admin if it was provided earlier
      if (typeof end_time_by_admin !== "undefined") {
        updateData.end_time_by_admin = end_time_by_admin;
      }
    }

    // ✅ Add booking_name if it's provided
    if (booking_name) {
      updateData.booking_name = booking_name;
    }


    // 🧹 Prepare update payload
    let updatePayload = {
      booking_name,
      client_name,
      date,
      time,
      booking_status,
      google_map_link,
      end_time_by_admin,
    };

    // 🔁 Handle recurrence fields only if provided
    if (typeof repeat_on_days !== "undefined") {
      let parsedRepeatDays = repeat_on_days;

      if (typeof repeat_on_days === "string") {
        try {
          parsedRepeatDays = JSON.parse(repeat_on_days);
        } catch (e) {
          logger.warn(
            "Failed to parse repeat_on_days, defaulting to empty array",
          );
          parsedRepeatDays = [];
        }
      }

      if (Array.isArray(parsedRepeatDays)) {
        updatePayload.repeat_on_days = parsedRepeatDays;
      }
    }

    if (typeof recurring_type !== "undefined") {
      updatePayload.recurring_type = recurring_type;
    }

    if (typeof recurring_every !== "undefined") {
      updatePayload.recurring_every = recurring_every;
    }

    if (typeof recurrence_end_type !== "undefined") {
      updatePayload.recurrence_end_type = recurrence_end_type;
    }

    if (typeof recurrence_end_value !== "undefined") {
      updatePayload.recurrence_end_value = recurrence_end_value;
    }

    const editMode = reqBody.edit_mode || "this";


    if (!bookingDoc.recurrence_id || editMode === "this") {
      await Booking.update(updatePayload, { where: { id: booking_id } });
    } else {
      // Use the new, correct logic for recurring edits
      const result = await updateRecurringBookingWithEditMode(
        booking_id,
        updatePayload,
        editMode,
        createRecurringBookings,
      );
      // Handle success/error as needed
      return result;
    }

    await Booking.update(updateData, { where: { id: booking_id } });

    if (google_map_link) {
      const coordinates = await getCoordinatesFromGoogleMapLink(
        google_map_link,
        config.GOOGLE_API_KEY,
      );
      if (coordinates) {
        await UserAddress.update(
          {
            address_lat: coordinates.latitude,
            address_long: coordinates.longitude,
            google_map_link: google_map_link,
          },
          { where: { id: bookingDoc.address_id } },
        );
      }
    }

    if (booking_status === bookingTypes.REJECTED) {
      await Booking.update(
        {
          booking_status: bookingTypes.REJECTED,
          is_active: false,
        },
        { where: { id: booking_id } },
      );
      return {
        success: true,
        message: "Booking marked as rejected",
      };
    }

    if (Array.isArray(remove_employees) && remove_employees.length > 0) {
      await BookingAssignment.destroy({
        where: {
          booking_id,
          employee_id: remove_employees,
        },
      });
    }

    if (
      booking_status === bookingTypes.ACCEPTED ||
      bookingDoc.booking_status === bookingTypes.ACCEPTED
    ) {
      const assignments = [];

      if (Array.isArray(cleaners) && cleaners.length > 0) {
        cleaners.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: ROLE.CLEANER }),
        );
      }
      if (Array.isArray(supervisors) && supervisors.length > 0) {
        supervisors.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: ROLE.SUPERVISOR }),
        );
      }
      if (Array.isArray(quality_inspectors) && quality_inspectors.length > 0) {

        quality_inspectors.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: ROLE.QUALITY_INSPECTOR }),
        );
      }

      if (assignments.length > 0) {

        // Remove duplicates inside the same request
        const uniqueAssignments = assignments.filter(
          (obj, index, self) =>
            index ===
            self.findIndex(
              (t) =>
                t.booking_id === obj.booking_id &&
                t.employee_id === obj.employee_id &&
                t.role_id === obj.role_id,
            ),
        );

        // Fetch existing assignments from DB
        const existingAssignments = await BookingAssignment.findAll({
          where: { booking_id },
          attributes: ["employee_id", "role_id"],
          raw: true,
        });

        const existingSet = new Set(
          existingAssignments.map((a) => `${a.employee_id}-${a.role_id}`),
        );

        // Filter out already existing
        const newAssignments = uniqueAssignments.filter(
          (a) => !existingSet.has(`${a.employee_id}-${a.role_id}`),
        );

        if (newAssignments.length > 0) {
          await BookingAssignment.bulkCreate(newAssignments);
          logger.debug("Saved new assignments:", newAssignments.length);
        }
      }

      // Firebase group chat creation
      const allMembers = new Set([
        ...(cleaners || []).map((id) => `employee_${id}`),
        ...(supervisors || []).map((id) => `employee_${id}`),
        ...(quality_inspectors || []).map((id) => `employee_${id}`),
      ]);

      const admins = await Admin.findAll({
        where: { role_id: [1], is_active: true },
      });
      admins.forEach((admin) => allMembers.add(`admin_${admin.id}`));
      if (bookingDoc.bdm_id) {
        allMembers.add(`bdm_${bookingDoc.bdm_id}`);
      }

      const groupName = `${bookingDoc.booking_name || "Booking"} - ${effectiveDate || formatDate(bookingDoc.date)}`;

      const groupRef = getDatabase().ref(`GroupChats/booking_${booking_id}`);
      const snapshot = await groupRef.once("value");

      if (snapshot.exists()) {
        // Update members
        let existingMembers = snapshot.val().members || {};

        // Add new
        [...allMembers].forEach((id) => {
          if (!existingMembers[id]) existingMembers[id] = true;
        });

        // Remove
        if (Array.isArray(remove_employees) && remove_employees.length > 0) {
          remove_employees.forEach((empId) => {
            const empKey = `employee_${empId}`;
            if (existingMembers[empKey]) delete existingMembers[empKey];
          });
        }

        await groupRef.update({ members: existingMembers });
      } else {
        // Create new group
        await groupRef.set({
          name: groupName,
          created_at: ServerValue.TIMESTAMP,
          members: Object.fromEntries([...allMembers].map((id) => [id, true])),
          messages: {},
        });
        await groupRef.child("messages").push({
          sender: "System",
          message: "Welcome to the group for this booking!",
          timestamp: ServerValue.TIMESTAMP,
        });
      }

      const isRecurringBooking =
        is_recurring === true && bookingDoc.type === "Recurring Booking";


      if (typeof is_recurring === "string") {
        is_recurring = toBoolean(is_recurring);
      }

      if (typeof is_recurring !== "boolean") {
        return {
          success: false,
          message: "Invalid 'is_recurring' type",
        };
      }

      if (isRecurringBooking) {

        const isRecurrenceInputMissing =
          recurring_every === undefined &&
          recurring_type === undefined &&
          (repeat_on_days === undefined || repeat_on_days.length === 0) &&
          recurrence_end_type === undefined &&
          recurrence_end_value === undefined;

        if (isRecurrenceInputMissing) {
          // Skip everything
        } else {
          const recurrence_id = uuidv4();


          await Booking.update(
            {
              is_recurring: true,
              recurring_every,
              recurring_type,
              repeat_on_days: Array.isArray(repeat_on_days)
                ? repeat_on_days
                : null,
              recurrence_end_type,
              recurrence_end_value,
              recurrence_id,
              client_name,
            },
            { where: { id: booking_id } },
          );

          if (bookingDoc.user_id === null) {
            await createRecurringGuestBookings({
              baseBooking: bookingDoc,
              recurring_every,
              recurring_type,
              repeat_on_days: repeat_on_days || [],
              recurrence_end_type,
              recurrence_end_value,
              recurrence_id,
            });
          } else {
            await createRecurringBookings({
              baseBooking: bookingDoc,
              user_id: bookingDoc.user_id,
              recurring_every,
              recurring_type,
              repeat_on_days: repeat_on_days || [],
              recurrence_end_type,
              recurrence_end_value,
              recurrence_id,
            });
          }
        }
      } else {
        // Not a recurring booking anymore – clear fields
        await Booking.update(
          {
            is_recurring: false,
            recurring_every: null,
            recurring_type: null,
            repeat_on_days: null,
            recurrence_end_type: null,
            recurrence_end_value: null,
            recurrence_id: null,
          },
          { where: { id: booking_id } },
        );
      }

      return {
        success: true,
        message:
          "Booking status updated to accepted, employees assigned/removed successfully",
      };
    }
  } catch (error) {
    logger.error("Exception caught in updateBookingStatus:", error);
    throw ApiError.orInternal(error);
  }
};

const createRecurringBookings = async ({
  baseBooking,
  recurring_every,
  recurring_type,
  repeat_on_days = [],
  recurrence_end_type,
  recurrence_end_value,
  user_id,
  recurrence_id,
}) => {
  try {
    const recurrenceList = [];

    // ── CRITICAL FIX: pure UTC calendar dates.
    // Native Date getDate/setDate/getDay are local-timezone methods and
    // shift the day by −1 when the server runs in any TZ west of UTC.
    const originalMoment = calendarDateUtc(toCalendarDate(baseBooking.date));

    recurring_every = parseInt(recurring_every, 10) || 1;

    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const repeatOnIndexes = (repeat_on_days || [])
      .map((day) => weekdayMap[day])
      .filter((v) => typeof v === "number");

    let endMoment = null;
    if (recurrence_end_type === "on_date") {
      endMoment = calendarDateUtc(toCalendarDate(recurrence_end_value)).endOf("day");
    } else if (recurrence_end_type === "never") {
      endMoment = dayjs.utc().add(10, "years").endOf("day");
    }

    let count = 0;
    let parentBookingId = null;

    async function createOneBooking(dateMoment) {
      const nextDateStr = dateMoment.format(DATE_FORMAT);

      const newBookingId = await generateBookingId(
        baseBooking.service_id,
        nextDateStr,
      );

      const { date_in_utc, time_in_utc } = bookingUtcParts(
        nextDateStr,
        baseBooking.time,
        baseBooking.time_zone,
      );

      const newBooking = await Booking.create({
        booking_name: baseBooking.booking_name,
        client_name: baseBooking.client_name,
        user_id,
        service_id: baseBooking.service_id,
        address_id: baseBooking.address_id,
        notes: baseBooking.notes,
        type: baseBooking.type,
        booking_unique_id: newBookingId,
        date: nextDateStr,
        time: baseBooking.time,
        google_map_link: baseBooking.google_map_link,
        time_zone: baseBooking.time_zone,
        date_in_utc,
        time_in_utc,
        bdm_id: baseBooking.bdm_id || null,
        payment_status: paymentStatusTypes.SUCCESS,
        booking_status: bookingTypes.ACCEPTED,
        is_recurring: true,
        recurring_every,
        recurring_type,
        repeat_on_days,
        recurrence_end_type,
        recurrence_end_value,
        recurrence_id,
        parent_booking_id: parentBookingId,
      });

      if (parentBookingId === null) {
        parentBookingId = newBooking.id;
        await newBooking.update({ parent_booking_id: newBooking.id });
      }

      recurrenceList.push(newBooking);
    }

    // ---------------------------
    // WEEKLY
    // ---------------------------
    if (recurring_type === "week" && repeatOnIndexes.length > 0) {

      let cursor = originalMoment.clone().add(1, "day");
      let weekCounter = 0;

      while (true) {

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          break;
        }
        if (endMoment && cursor.isAfter(endMoment)) {
          break;
        }

        const weekStart = cursor.clone().startOf("week"); // Sunday

        for (const dayIdx of repeatOnIndexes) {
          const candidate = weekStart.clone().add(dayIdx, "days");

          if (candidate.isSameOrBefore(originalMoment, "day")) continue;
          if (endMoment && candidate.isAfter(endMoment)) continue;

          await createOneBooking(candidate);
          count++;

          if (recurrence_end_type === "after" && count >= recurrence_end_value)
            break;
          if (recurrence_end_type === "never" && count >= 100) break;
        }

        cursor = cursor.add(7 * recurring_every, "days");
        weekCounter++;

        if (endMoment && cursor.isAfter(endMoment)) break;
        if (weekCounter > 10000) {
          logger.warn("Week loop exceeded safe iteration count, breaking");
          break;
        }
      }

      return {
        success: true,
        message: `${recurrenceList.length} recurring bookings created.`,
        firstBookingId: recurrenceList[0]?.id || null,
      };
    }

    // ---------------------------
    // DAY / MONTH / YEAR
    // ---------------------------
    if (
      recurring_type === "day" ||
      recurring_type === "month" ||
      recurring_type === "year"
    ) {
      let candidate = originalMoment.clone();
      let iter = 0;

      while (true) {
        iter++;

        if (recurring_type === "day") {
          candidate = candidate.add(recurring_every, "days");
        } else if (recurring_type === "month") {
          candidate = candidate.add(recurring_every, "months");
        } else if (recurring_type === "year") {
          candidate = candidate.add(recurring_every, "years");
        }


        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          break;
        }
        if (endMoment && candidate.isAfter(endMoment)) {
          break;
        }

        if (candidate.isAfter(originalMoment, "day")) {
          await createOneBooking(candidate.clone());
          count++;
        }

        if (iter > 20000) {
          logger.warn(
            "Exceeded safe iterations for date generation, breaking",
          );
          break;
        }
      }
    }

    return {
      success: true,
      message: `${recurrenceList.length} recurring bookings created.`,
      firstBookingId: recurrenceList[0]?.id || null,
    };
  } catch (error) {
    logger.error("Error in createRecurringBookings:", error);
    return {
      success: false,
      message: error.message || "Something went wrong",
      firstBookingId: null,
    };
  }
};


const adminCreateBooking = async (reqBody, headers) => {
  const {
    user_id,
    address_id,
    service_id,
    date,
    time,
    end_time_by_admin,
    type,
    notes,
    timezone,
    booking_name,
    is_recurring,
  } = reqBody;

  try {
    const user = await User.findOne({
      where: { id: user_id },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });
    if (!user) throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user_id");

    const serviceDoc = await Service.findOne({ where: { id: service_id } });
    if (!serviceDoc)
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service_id");

    let addressDoc = null;
    if (address_id) {
      addressDoc = await UserAddress.findOne({ where: { id: address_id } });
      if (!addressDoc)
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid address_id");
    }

    const bdmUser = await BDMUser.findOne({ where: { user_id } });

    const bookingId = await generateBookingId(serviceDoc.id, date);
    const { date_in_utc, time_in_utc } = bookingUtcParts(date, time, timezone);

    const bookingObj = {
      user_id,
      booking_name,
      service_id,
      address_id: address_id || null,
      notes,
      type,
      booking_unique_id: bookingId,
      date,
      time,
      end_time_by_admin,
      time_zone: timezone,
      date_in_utc,
      time_in_utc,
      bdm_id: bdmUser ? bdmUser.bdm_id : null,
      payment_status: paymentStatusTypes.SUCCESS,
      booking_status: bookingTypes.ACCEPTED,
    };

    // 🧠 Decide if we skip base booking creation
    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    let skipInitialBooking = false;
    if (
      type === "Recurring Booking" &&
      is_recurring &&
      reqBody.repeat_on_days?.length
    ) {
      const repeatOnIndexes = reqBody.repeat_on_days.map(
        (day) => weekdayMap[day],
      );
      // Use UTC day-of-week so it is independent of server timezone
      const baseDay = calendarDateUtc(toCalendarDate(date)).day();
      if (!repeatOnIndexes.includes(baseDay)) {
        skipInitialBooking = true;
      }
    }

    let bookingDoc = null;
    if (!skipInitialBooking) {
      bookingDoc = await Booking.create(bookingObj);
      if (!bookingDoc) {
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to create booking",
        );
      }
    }

    if (type === "Recurring Booking" && is_recurring) {
      const recurrence_id = uuidv4();

      // ✅ Validate recurrence_end_type + recurrence_end_value
      if (
        reqBody.recurrence_end_type === "on_date" &&
        !reqBody.recurrence_end_value
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "recurrence_end_value is required when recurrence_end_type is 'on_date'",
        );
      }
      if (bookingDoc?.id) {
        await Booking.update(
          {
            is_recurring: true,
            recurring_every: reqBody.recurring_every,
            recurring_type: reqBody.recurring_type,
            repeat_on_days: reqBody.repeat_on_days || [],
            recurrence_end_type: reqBody.recurrence_end_type,
            recurrence_end_value: reqBody.recurrence_end_value,
            recurrence_id: recurrence_id,
          },
          { where: { id: bookingDoc.id } },
        );
      } else {
        // booking was skipped, assign fake ID
        bookingDoc = {
          ...bookingObj,
          id: -1, // use a temporary ID
          is_recurring: true,
          recurring_every: reqBody.recurring_every,
          recurring_type: reqBody.recurring_type,
          repeat_on_days: reqBody.repeat_on_days || [],
          recurrence_end_type: reqBody.recurrence_end_type,
          recurrence_end_value: reqBody.recurrence_end_value,
          recurrence_id: recurrence_id,
        };
      }

      const recurringResult = await createRecurringBookings({
        baseBooking: bookingDoc,
        user_id: bookingObj.user_id,
        recurring_every: reqBody.recurring_every,
        recurring_type: reqBody.recurring_type,
        repeat_on_days: reqBody.repeat_on_days || [],
        recurrence_end_type: reqBody.recurrence_end_type,
        recurrence_end_value: reqBody.recurrence_end_value,
        recurrence_id: recurrence_id,
      });

      // 🟢 Fix bookingDoc id when base booking was skipped
      if (bookingDoc.id === -1 && recurringResult?.firstBookingId) {
        bookingDoc.id = recurringResult.firstBookingId;
      }
    }

    await sendEmailToAdmin(user, bookingDoc, serviceDoc);

    return {
      // id is still -1 only when no recurring booking could be created
      booking_id: bookingDoc?.id !== -1 ? bookingDoc?.id : null,
      message: "Booking created successfully by admin",
    };
  } catch (error) {
    logger.error("Admin Booking Error:", error);
    throw ApiError.from(error);
  }
};

const adminCreateBookingForGuest = async (reqBody) => {
  const {
    client_name,
    booking_name,
    service_id,
    date,
    time,
    type,
    notes,
    timezone,
    is_recurring,
    end_time_by_admin,
  } = reqBody;

  try {
    const serviceDoc = await Service.findOne({ where: { id: service_id } });
    if (!serviceDoc) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid service_id");
    }

    const bookingId = await generateBookingId(serviceDoc.id, date);
    const { date_in_utc, time_in_utc } = bookingUtcParts(date, time, timezone);

    const bookingObj = {
      client_name,
      booking_name,
      service_id,
      notes,
      type,
      booking_unique_id: bookingId,
      date,
      time,
      time_zone: timezone,
      date_in_utc,
      time_in_utc,
      payment_status: paymentStatusTypes.SUCCESS,
      end_time_by_admin,
    };

    // 🔍 Determine if base booking should be skipped
    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    // Use UTC day-of-week so it is independent of server timezone
    const baseDay = calendarDateUtc(toCalendarDate(date)).day();
    const repeatOnIndexes = (reqBody.repeat_on_days || []).map(
      (day) => weekdayMap[day],
    );
    let skipInitialBooking = false;

    if (
      type === "Recurring Booking" &&
      is_recurring &&
      repeatOnIndexes.length
    ) {
      if (!repeatOnIndexes.includes(baseDay)) {
        skipInitialBooking = true;
      }
    }
    const recurrence_id = uuidv4();
    let bookingDoc = null;
    if (!skipInitialBooking) {
      bookingDoc = await Booking.create(bookingObj);
      if (!bookingDoc)
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to create booking",
        );

      const userAddressObj = {
        address: reqBody.address,
        state_id: reqBody.state_id,
        city_id: reqBody.city_id,
        address_lat: reqBody.address_lat,
        address_long: reqBody.address_long,
        booking_id: bookingDoc.id,
      };

      const userAddressDoc = await GuestBookingAddress.create(userAddressObj);
      if (!userAddressDoc)
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to create address.",
        );
    } else {
      // Fake bookingDoc to use in recurrence
      bookingDoc = {
        ...bookingObj,
        id: null, // use a temporary ID
        is_recurring: true,
        recurring_every: reqBody.recurring_every,
        recurring_type: reqBody.recurring_type,
        repeat_on_days: reqBody.repeat_on_days || [],
        recurrence_end_type: reqBody.recurrence_end_type,
        recurrence_end_value: reqBody.recurrence_end_value,
        recurrence_id: recurrence_id,
      };
    }

    let parentBookingId = bookingDoc?.id;

    if (type === "Recurring Booking" && is_recurring) {
      const recurrence_id = uuidv4();

      if (bookingDoc?.id) {
        await Booking.update(
          {
            is_recurring: true,
            recurring_every: reqBody.recurring_every,
            recurring_type: reqBody.recurring_type,
            repeat_on_days: reqBody.repeat_on_days || [],
            recurrence_end_type: reqBody.recurrence_end_type,
            recurrence_end_value: reqBody.recurrence_end_value,
            recurrence_id: recurrence_id,
          },
          { where: { id: bookingDoc.id } },
        );
      }

      const result = await createRecurringGuestBookings({
        baseBooking: bookingDoc,
        recurring_every: reqBody.recurring_every,
        recurring_type: reqBody.recurring_type,
        repeat_on_days: reqBody.repeat_on_days || [],
        recurrence_end_type: reqBody.recurrence_end_type,
        recurrence_end_value: reqBody.recurrence_end_value,
        recurrence_id: recurrence_id,
      });

      // ✅ ensure we have a real parent booking ID from children
      if (!parentBookingId && result.parentBookingId) {
        parentBookingId = result.parentBookingId;
      }
    }

    return {
      booking_id: parentBookingId,
      message: "Booking created successfully by admin",
    };
  } catch (error) {
    logger.error("Admin Booking Error:", error);
    throw ApiError.from(error);
  }
};

const createRecurringGuestBookings = async ({
  baseBooking,
  recurring_every,
  recurring_type,
  repeat_on_days = [],
  recurrence_end_type,
  recurrence_end_value,
  recurrence_id,
}) => {
  try {
    const recurrenceList = [];

    // ── CRITICAL FIX: pure UTC calendar dates (same as createRecurringBookings)
    const originalMoment = calendarDateUtc(toCalendarDate(baseBooking.date));

    recurring_every = parseInt(recurring_every, 10) || 1;
    const weekdayMap = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const repeatOnIndexes = (repeat_on_days || [])
      .map((day) => weekdayMap[day])
      .filter((v) => typeof v === "number");

    let endMoment = null;
    if (recurrence_end_type === "on_date") {
      endMoment = calendarDateUtc(toCalendarDate(recurrence_end_value)).endOf("day");
    } else if (recurrence_end_type === "never") {
      endMoment = dayjs.utc().add(10, "years").endOf("day");
    }

    let count = 0;
    let parentBookingId = null;

    async function createOneBooking(dateMoment) {
      const nextDateStr = dateMoment.format(DATE_FORMAT);
      const newBookingId = await generateBookingId(
        baseBooking.service_id,
        nextDateStr,
      );

      const { date_in_utc, time_in_utc } = bookingUtcParts(
        nextDateStr,
        baseBooking.time,
        baseBooking.time_zone,
      );

      const newBooking = await Booking.create({
        booking_name: baseBooking.booking_name,
        client_name: baseBooking.client_name,
        service_id: baseBooking.service_id,
        address_id: baseBooking.address_id,
        notes: baseBooking.notes,
        type: baseBooking.type,
        booking_unique_id: newBookingId,
        date: nextDateStr,
        time: baseBooking.time,
        google_map_link: baseBooking.google_map_link,
        time_zone: baseBooking.time_zone,
        date_in_utc,
        time_in_utc,
        bdm_id: baseBooking.bdm_id || null,
        payment_status: paymentStatusTypes.SUCCESS,
        is_recurring: true,
        recurring_every,
        recurring_type,
        repeat_on_days,
        recurrence_end_type,
        recurrence_end_value,
        recurrence_id,
        parent_booking_id: parentBookingId,
      });

      if (parentBookingId === null) {
        parentBookingId = newBooking.id;
        await newBooking.update({ parent_booking_id: newBooking.id });
      }

      const parentGuestAddress = await GuestBookingAddress.findOne({
        where: { booking_id: baseBooking.id },
      });

      if (parentGuestAddress) {
        await GuestBookingAddress.create({
          address: parentGuestAddress.address,
          state_id: parentGuestAddress.state_id,
          city_id: parentGuestAddress.city_id,
          country_id: parentGuestAddress.country_id,
          address_lat: parentGuestAddress.address_lat,
          address_long: parentGuestAddress.address_long,
          booking_id: newBooking.id,
        });
      }

      recurrenceList.push(newBooking);
    }

    // ---------------------------
    // WEEKLY
    // ---------------------------
    if (recurring_type === "week" && repeatOnIndexes.length > 0) {

      let cursor = originalMoment.clone().add(1, "day");
      let weekCounter = 0;

      while (true) {

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          break;
        }
        if (endMoment && cursor.isAfter(endMoment)) {
          break;
        }

        const weekStart = cursor.clone().startOf("week");

        for (const dayIdx of repeatOnIndexes) {
          const candidate = weekStart.clone().add(dayIdx, "days");

          if (candidate.isSameOrBefore(originalMoment, "day")) continue;
          if (endMoment && candidate.isAfter(endMoment)) continue;

          await createOneBooking(candidate);
          count++;

          if (recurrence_end_type === "after" && count >= recurrence_end_value)
            break;
          if (recurrence_end_type === "never" && count >= 100) break;
        }

        cursor = cursor.add(7 * recurring_every, "days");
        weekCounter++;

        if (endMoment && cursor.isAfter(endMoment)) break;
        if (weekCounter > 10000) {
          logger.warn("Week loop exceeded safe iteration count, breaking");
          break;
        }
      }

      return {
        success: true,
        message: `${recurrenceList.length} recurring bookings created.`,
        parentBookingId,
      };
    }

    // ---------------------------
    // DAY / MONTH / YEAR
    // ---------------------------
    if (
      recurring_type === "day" ||
      recurring_type === "month" ||
      recurring_type === "year"
    ) {
      let candidate = originalMoment.clone();
      let iter = 0;

      while (true) {
        iter++;

        if (recurring_type === "day") {
          candidate = candidate.add(recurring_every, "days");
        } else if (recurring_type === "month") {
          candidate = candidate.add(recurring_every, "months");
        } else if (recurring_type === "year") {
          candidate = candidate.add(recurring_every, "years");
        }


        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          break;
        }
        if (endMoment && candidate.isAfter(endMoment)) {
          break;
        }

        if (candidate.isAfter(originalMoment, "day")) {
          await createOneBooking(candidate.clone());
          count++;
        }

        if (iter > 20000) {
          logger.warn(
            "Exceeded safe iterations for date generation, breaking",
          );
          break;
        }
      }
    }

    return {
      success: true,
      message: `${recurrenceList.length} recurring bookings created.`,
      parentBookingId,
    };
  } catch (error) {
    logger.error("Error creating recurring bookings:", error);
    return {
      success: false,
      message: "Failed to create recurring bookings.",
    };
  }
};



const getMonthlyBookingCalendar = async (reqBody) => {
  try {
    const { year, month } = reqBody;

    if (!year || !month || month < 1 || month > 12) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid year or month");
    }

    // Generate all dates in the month (e.g., ['2025-06-01', ..., '2025-06-30'])
    const daysInMonth = new Date(year, month, 0).getDate();
    const allDates = Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${year}-${String(month).padStart(2, "0")}-${day}`;
    });

    // Date range with time for full day coverage
    const startDate = calendarDateUtc(allDates[0]).toDate();
    const endDate = calendarDateUtc(allDates[allDates.length - 1])
      .endOf("day")
      .toDate();

    // Fetch bookings in the full date-time range
    const bookings = await Booking.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate],
        },
      },
      include: [
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
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id", "mobile"],
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
          model: Service,
          as: "service_booking",
          attributes: ["name", "price"],
        },
      ],
      order: [["date", "ASC"]],
    });

    // Group bookings by date (normalized to YYYY-MM-DD)
    const bookingsByDate = {};
    allDates.forEach((date) => {
      bookingsByDate[date] = [];
    });

    for (const booking of bookings) {
      const normalizedDate = toCalendarDate(booking.date);
      if (!bookingsByDate[normalizedDate]) {
        bookingsByDate[normalizedDate] = [];
      }
      bookingsByDate[normalizedDate].push(booking);
    }

    // Prepare calendar output
    const calendar = allDates.map((date) => ({
      date,
      bookings: bookingsByDate[date] || [],
    }));

    return calendar;
  } catch (error) {
    logger.error("Error in getMonthlyBookingCalendar:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to get monthly booking calendar",
    );
  }
};


const sendAttendanceAlerts = async () => {
  try {
    // Attendance *_est columns hold New York wall time, so compare in that convention
    const todayEST = dateInTz();
    const nowEST = nowWallClock();
    const startOfDay = new Date(`${todayEST}T00:00:00Z`);
    const endOfDay = new Date(`${todayEST}T23:59:59Z`);


    const bookings = await Booking.findAll({
      where: {
        booking_status: bookingTypes.ACCEPTED,
        absent_alert_sent: false,
        is_active: true,
        [Op.and]: Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("date")),
          todayEST,
        ),
      },
      include: [
        {
          model: UserAddress,
          as: "booking_address",
          attributes: [
            "address",
            "address_lat",
            "address_long",
            "country_id",
            "state_id",
            "city_id",
          ],
          include: [
            {
              model: Country,
              as: "user_country",
              attributes: ["id", "name"],
            },
            {
              model: State,
              as: "user_state",
              attributes: ["id", "name"],
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name"],
            },
          ],
        },
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          attributes: ["employee_id", "role_id"],
        },
      ],
    });


    // Today's first clock-in of every assigned employee, in one query
    const employeeIds = [...new Set(bookings.flatMap((b) => (b.booking_employee_details || []).map((a) => a.employee_id)))];
    const clockIns = await firstAttendanceByUser(employeeIds, { clock_in_est: { [Op.between]: [startOfDay, endOfDay] } });

    // Late and absent employees per booking
    const flaggedByBooking = new Map();
    for (const booking of bookings) {
      const bookingStart = new Date(`${todayEST}T${booking.time}Z`);
      const flagged = [];
      for (const assignment of booking.booking_employee_details || []) {
        const status = attendanceStatus({
          bookingStart,
          clockIn: clockIns.get(assignment.employee_id)?.clock_in_est || null,
          now: nowEST,
        });
        if (status === attendanceStatusTypes.LATE || status === attendanceStatusTypes.ABSENT) {
          flagged.push({ employeeId: assignment.employee_id, roleId: assignment.role_id, status });
        }
      }
      flaggedByBooking.set(booking, flagged);
    }

    // Their names, in one query
    const names = await profileNamesByUserId([...flaggedByBooking.values()].flat().map((f) => f.employeeId));

    for (const booking of bookings) {
      const employeesToNotify = flaggedByBooking.get(booking).map((f) => ({
        name: names.get(f.employeeId) || "N/A",
        roleId: f.roleId,
        status: f.status,
      }));


      if (!employeesToNotify.length) {
        continue;
      }

      const absentEmployees = employeesToNotify.filter(
        (e) => e.status === attendanceStatusTypes.ABSENT,
      );


      if (absentEmployees.length && !booking.absent_alert_sent) {
        logger.info("Sending absent alert for booking", booking.id);

        await sendGroupedAttendanceEmail({
          booking,
          employees: absentEmployees,
          status: attendanceStatusTypes.ABSENT,
          bookingAddress: booking.booking_address,
        });

        await booking.update({ absent_alert_sent: true });
      }
    }

    logger.debug("Attendance alerts processed.");
  } catch (error) {
    logger.error("Error:", error);
  }
};


const notifyAdminIfClockoutFar = async () => {
  try {
    const todayUTC = utcDate();

    const bookings = await Booking.findAll({
      where: {
        booking_status: bookingTypes.SUCCESS,
        date_in_utc: todayUTC,
      },
      include: [
        {
          model: UserAddress,
          as: "booking_address",
          attributes: ["address_lat", "address_long"],
        },
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          where: { clock_out_alert_sent: false }, // Only fetch those not alerted
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id", "mobile"],
                },
              ],
            },
          ],
        },
      ],
    });

    // Today's first finished attendance of every employee involved, in one query
    const clockOuts = await firstAttendanceByUser(
      [...new Set(bookings.flatMap((b) => b.booking_employee_details.map((a) => a.employee_profile.id)))],
      {
        clock_out: { [Op.ne]: null },
        clock_in: { [Op.between]: [new Date(`${todayUTC}T00:00:00.000Z`), new Date(`${todayUTC}T23:59:59.999Z`)] },
      },
    );

    for (const booking of bookings) {
      const userLat = parseFloat(booking.booking_address?.address_lat);
      const userLng = parseFloat(booking.booking_address?.address_long);
      if (!userLat || !userLng) continue;

      for (const assignment of booking.booking_employee_details) {
        const employee = assignment.employee_profile;

        const attendance = clockOuts.get(employee.id);

        if (
          !attendance ||
          !attendance.clock_out_lat ||
          !attendance.clock_out_lng
        )
          continue;

        const clockOutLat = parseFloat(attendance.clock_out_lat);
        const clockOutLng = parseFloat(attendance.clock_out_lng);

        const distance = distanceInKm(
          clockOutLat,
          clockOutLng,
          userLat,
          userLng,
        );

        if (distance > ATTENDANCE.CLOCK_OUT_MAX_DISTANCE_KM) {
          const employeeDetails = {
            name: employee.user_profile?.name || "N/A",
            email: employee.email,
            distance: distance.toFixed(2),
            clockOutLat,
            clockOutLng,
            roleId: assignment.role_id,
          };

          await sendClockOutDistanceEmail({
            bookingId: booking.booking_unique_id,
            date: todayUTC,
            employee: employeeDetails,
            userLat,
            userLng,
            // roleId: assignment.role_id,
          });

          logger.info(
            `Sent clock-out distance alert for employee ${employee.id} (~${distance.toFixed(2)} km)`,
          );

          // ✅ Update alert flag per employee
          await assignment.update({ clock_out_alert_sent: true });
        }
      }
    }

    logger.debug("Clock-out distance checks completed.");
  } catch (error) {
    logger.error("Error in notifyAdminIfClockoutFar:", error);
  }
};

const getDayOverview = async (reqBody, res) => {
  try {
    const { date } = reqBody;

    if (!date || !isValidDate(date)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
    }

    const startOfDay = dayjs.utc(date).startOf("day").toDate();
    const endOfDay = dayjs.utc(date).endOf("day").toDate();

    const bookings = await Booking.findAll({
      where: {

        is_active: true,
        payment_status: paymentStatusTypes.SUCCESS,
        date: {
          [Op.gte]: startOfDay,
          [Op.lt]: endOfDay,
        },
        [Op.or]: [{ user_id: { [Op.ne]: null } }, { user_id: null }],
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          required: false,
          include: [
            {
              model: User,
              as: "employee_profile",
              required: false,
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "booking_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
        {
          model: UserAddress,
          as: "booking_address",
          required: false,
          include: [
            {
              model: Country,
              as: "user_country",
              attributes: ["id", "name", "iso3"],
            },
            {
              model: State,
              as: "user_state",
              attributes: ["id", "name", "country_id", "iso2"],
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

    const formattedData = [];

    // Every assigned employee's attendance that day and its breaks, in two queries
    const attendanceByEmployee = await firstAttendanceByUser(
      bookings.flatMap((b) => (b.booking_employee_details || []).map((emp) => emp.employee_profile?.id)),
      { clock_in_est: { [Op.gte]: startOfDay, [Op.lt]: endOfDay } },
    );
    const breaksOf = await breaksByAttendance([...attendanceByEmployee.values()].map((a) => a.id));

    for (const booking of bookings) {
      const assignedEmployees = booking.booking_employee_details || [];

      const employeesWithAttendance = assignedEmployees.map((emp) => {
          const attendance = attendanceByEmployee.get(emp.employee_profile?.id);

          let breaks = null;
          if (attendance?.id) {
            const breakRecords = breaksOf.get(attendance.id) || [];

            if (breakRecords.length > 0) {
              breaks = breakRecords.map((b) => ({
                break_start_est: dayjs.utc(b.break_start_est).format(TIME_FORMAT),
                break_end_est: b.break_end_est
                  ? dayjs.utc(b.break_end_est).format(TIME_FORMAT)
                  : null,
                status: b.status,
                duration_minutes: b.duration_minutes,
                break_start_lat: b.break_start_lat || null,
                break_start_lng: b.break_start_lng || null,
                break_end_lat: b.break_end_lat || null,
                break_end_lng: b.break_end_lng || null,
              }));
            }
          }

          return {
            id: emp.employee_profile?.id,
            name: emp.employee_profile?.user_profile?.name || null,
            clock_in: attendance?.clock_in_est || null,
            clock_out: attendance?.clock_out_est || null,
            breaks,
          };
        });

      formattedData.push({
        booking_id: booking.id,
        booking_unique_id: booking.booking_unique_id,
        client_name:
          booking.booking_user?.user_profile?.name ||
          booking.client_name ||
          "N/A",
        booking_name: booking.booking_name || "N/A",
        number_of_employees: employeesWithAttendance.length,
        employees: employeesWithAttendance,
        address_id: booking.address_id || null,
        address: booking.booking_address
          ? {
              address_line_1: booking.booking_address.address,
              city: booking.booking_address.user_city.name,
              state: booking.booking_address.user_state.name,
              country: booking.booking_address.user_country.name,
            }
          : null,
      });
    }
    return {
      date,
      total_bookings: bookings.length,
      bookings: formattedData,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getBookingOverviewById = async (id) => {
  try {
    const booking = await Booking.findOne({
      where: {
        id: id,
        is_active: true,
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "booking_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
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
              attributes: ["id", "name", "country_id", "iso2"],
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name", "country_id", "state_id"],
            },
          ],
        },
        {
          model: GuestBookingAddress,
          as: "booking_non_client_address",
          include: [
            {
              model: Country,
              as: "non_client_user_country",
              attributes: ["id", "name", "iso3"],
            },
            {
              model: State,
              as: "non_client_user_state",
              attributes: ["id", "name", "country_id", "iso2"],
            },
            {
              model: City,
              as: "non_client_user_city",
              attributes: ["id", "name", "country_id", "state_id"],
            },
          ],
        },
      ],
    });


    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    const date = toCalendarDate(booking.date);
    const startOfDay = dayjs.utc(date).startOf("day").toDate();
    const endOfDay = dayjs.utc(date).endOf("day").toDate();

    const assignedEmployees = booking.booking_employee_details || [];

    const employeesWithAttendance = await Promise.all(
      assignedEmployees.map(async (emp) => {
        const attendance = await Attendance.findOne({
          where: {
            user_id: emp.employee_profile?.id,
            clock_in_est: {
              [Op.gte]: startOfDay,
              [Op.lt]: endOfDay,
            },
          },
          attributes: [
            "id",
            "total_hours",
            "clock_in",
            "clock_out",
            "clock_in_est",
            "clock_out_est",
            "clock_in_lat",
            "clock_in_lng",
            "clock_out_lat",
            "clock_out_lng",
          ],
        });

        let breaks = [];

        if (attendance?.id) {
          breaks = await Break.findAll({
            where: { attendance_id: attendance.id },
            attributes: [
              "break_start_est",
              "break_end_est",
              "status",
              "duration_minutes",
              "break_start_lat",
              "break_start_lng",
              "break_end_lat",
              "break_end_lng",
            ],
            order: [["break_start_est", "ASC"]],
          });
        }

        return {
          id: emp.employee_profile?.id,
          name: emp.employee_profile?.user_profile?.name || null,
          clock_in: attendance?.clock_in_est
            ? dayjs.utc(attendance.clock_in_est).format(TIME_FORMAT)
            : null,
          clock_in_lat: attendance?.clock_in_lat || null,
          clock_in_lang: attendance?.clock_in_lng || null,
          clock_out: attendance?.clock_out_est
            ? dayjs.utc(attendance.clock_out_est).format(TIME_FORMAT)
            : null,
          clock_out_lat: attendance?.clock_out_lat || null,
          clock_out_lang: attendance?.clock_out_lng || null,
          total_hours: attendance?.total_hours || null,
          number_of_breaks: breaks.length,
          breaks: breaks.map((b) => ({
            break_start_est: dayjs.utc(b.break_start_est).format(TIME_FORMAT),
            break_end_est: b.break_end_est
              ? dayjs.utc(b.break_end_est).format(TIME_FORMAT)
              : null,
            status: b.status,
            duration_minutes: b.duration_minutes,
            break_start_lat: b?.break_start_lat || null,
            break_start_lng: b?.break_start_lng || null,
            break_end_lat: b?.break_end_lat || null,
            break_end_lng: b?.break_end_lng || null,
          })),
        };
      }),
    );

    const result = {
      booking_id: booking.id,
      booking_unique_id: booking.booking_unique_id,
      booking_name: booking.booking_name,
      client_name:
        booking.booking_user?.user_profile?.name ||
        booking.client_name ||
        "N/A",
      date,
      time: booking.time,
      number_of_employees: employeesWithAttendance.length,
      employees: employeesWithAttendance,
      address_id: booking.address_id || null,
      address: booking.booking_address
        ? {
            address_line_1: booking.booking_address.address,
            address_lat: booking.booking_address.address_lat,
            address_long: booking.booking_address.address_long,
            city: booking.booking_address.user_city?.name || "",
            state: booking.booking_address.user_state?.name || "",
            country: booking.booking_address.user_country?.name || "",
          }
        : booking.booking_non_client_address?.length
          ? {
              address_line_1: booking.booking_non_client_address[0].address,
              address_lat: booking.booking_non_client_address[0].address_lat,
              address_long: booking.booking_non_client_address[0].address_long,
              city:
                booking.booking_non_client_address[0].non_client_user_city
                  ?.name || "",
              state:
                booking.booking_non_client_address[0].non_client_user_state
                  ?.name || "",
              country:
                booking.booking_non_client_address[0].non_client_user_country
                  ?.name || "",
            }
          : null,
    };

    return result;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteBooking = async (reqBody) => {
  const booking_id = reqBody.booking_id; // use booking_id from form
  const delete_mode = reqBody.delete_mode; // optional, may be undefined
  logger.info("Deleting booking", booking_id, delete_mode);

  try {
    const booking = await Booking.findByPk(booking_id);
    if (!booking) {
      return {
        success: false,
        message: "Booking not found",
      };
    }

    // Now replace all references of `id` with `booking_id`
    if (!booking.is_recurring || !booking.recurrence_id) {
      await BookingAssignment.destroy({ where: { booking_id } });
      await Booking.destroy({ where: { id: booking_id } });

      await deleteFirebaseGroup(booking_id);

      return {
        success: true,
        message: "One-time booking deleted successfully",
      };
    }

    // Recurring booking logic remains the same
    if (delete_mode === "this") {
      await BookingAssignment.destroy({ where: { booking_id } });
      await Booking.destroy({ where: { id: booking_id } });

      await deleteFirebaseGroup(booking_id);

      return {
        success: true,
        message: "This booking deleted successfully",
      };
    }

    if (delete_mode === "following") {
      const futureBookings = await Booking.findAll({
        where: {
          parent_booking_id: booking.id,
          date: { [Op.gte]: booking.date },
        },
        attributes: ["id"],
      });

      const bookingIds = futureBookings.map((b) => b.id);

      await BookingAssignment.destroy({ where: { booking_id: bookingIds } });
      await Booking.destroy({
        where: {
          parent_booking_id: booking.id,
          date: { [Op.gte]: booking.date },
        },
      });

      // ✅ remove Firebase groups for all these bookings
      await Promise.all(bookingIds.map((id) => deleteFirebaseGroup(id)));

      return {
        success: true,
        message: "This and following bookings deleted successfully",
      };
    }

    if (delete_mode === "all") {
      // 🔑 always resolve recurrence root
      const rootParentId = booking.parent_booking_id || booking.id;

      const bookingsToDelete = await Booking.findAll({
        where: {
          [Op.or]: [{ id: rootParentId }, { parent_booking_id: rootParentId }],
        },
        attributes: ["id"],
      });

      const bookingIds = bookingsToDelete.map((b) => b.id);

      // soft delete assignments
      await BookingAssignment.destroy({
        where: { booking_id: bookingIds },
      });

      // 🔥 THIS is the key fix
      await Booking.destroy({
        where: { id: bookingIds },
      });

      // firebase cleanup
      await Promise.all(bookingIds.map((id) => deleteFirebaseGroup(id)));

      return {
        success: true,
        message: "All recurring bookings deleted successfully",
      };
    }

    return {
      success: false,
      message: "Invalid delete_mode for recurring booking",
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteFirebaseGroup = async (booking_id) => {
  const groupRef = getDatabase().ref(`GroupChats/booking_${booking_id}`);
  const snapshot = await groupRef.once("value");

  if (snapshot.exists()) {
    await groupRef.remove();
    logger.info(`Firebase group for booking ${booking_id} deleted`);
  }
};

const getDayOverviewForGantt = async (reqBody) => {
  try {
    const { date } = reqBody;

    if (!date || !isValidDate(date)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
    }

    const startOfDay = dayjs.utc(date).startOf("day").toDate();
    const endOfDay = dayjs.utc(date).endOf("day").toDate();

    // 1️⃣ GET ALL EMPLOYEES (role_id 7, 8, 9)
    const allEmployees = await User.findAll({
      where: { role_id: { [Op.in]: EMPLOYEE_ROLE_IDS } },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
      order: [[{ model: Profile, as: "user_profile" }, "name", "ASC"]],
    });

    // 2️⃣ GET BOOKINGS FOR THE DAY
    const bookings = await Booking.findAll({
      where: {
        is_active: true,
        payment_status: paymentStatusTypes.SUCCESS,
        date: { [Op.gte]: startOfDay, [Op.lt]: endOfDay },
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
      ],
    });

    // 3️⃣ BUILD EMPLOYEE BOOKING MAP
    const employeeBookingMap = {}; // { employeeId: { start, end } }

    for (const booking of bookings) {
      const start = dayjs.utc(booking.time, TIME_FORMAT);
      const end = booking.end_time_by_admin
        ? dayjs.utc(booking.end_time_by_admin, TIME_FORMAT)
        : dayjs.utc(booking.time, TIME_FORMAT).add(BOOKING.DEFAULT_DURATION_HOURS, "hours");

      for (const emp of booking.booking_employee_details) {
        const empId = emp.employee_profile?.id;
        if (!empId) continue;

        employeeBookingMap[empId] = {
          booking_start: start.format(SHORT_TIME_FORMAT),
          booking_end: end.format(SHORT_TIME_FORMAT),
        };
      }
    }

    // 4️⃣ MERGE EMPLOYEES + BOOKING TIME
    const finalEmployees = allEmployees.map((emp) => ({
      id: emp.id,
      name: emp.user_profile?.name || "No Name",
      booking_start: employeeBookingMap[emp.id]?.booking_start || null,
      booking_end: employeeBookingMap[emp.id]?.booking_end || null,
    }));

    // 5️⃣ RETURN DATA (NOT res.json)
    return {
      date,
      employees: finalEmployees,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getEmployeeDayOverview = async ({ date }) => {
  if (!date || !isValidDate(date)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
  }

  // EST day window (same as working API)
  const startOfDay = dayjs.utc(date).startOf("day").toDate();
  const endOfDay = dayjs.utc(date).endOf("day").toDate();

  // 1️⃣ Employees
  const employees = await User.findAll({
    where: { role_id: { [Op.in]: EMPLOYEE_ROLE_IDS } },
    include: [
      {
        model: Profile,
        as: "user_profile",
        attributes: ["name"],
      },
    ],
    order: [[{ model: Profile, as: "user_profile" }, "name", "ASC"]],
  });

  // 2️⃣ Bookings of the day (simple + reliable)
  const bookings = await Booking.findAll({
    where: {
      is_active: true,
      payment_status: paymentStatusTypes.SUCCESS,
      date: {
        [Op.gte]: startOfDay,
        [Op.lt]: endOfDay,
      },
    },
    include: [
      {
        model: BookingAssignment,
        as: "booking_employee_details",
      },
    ],
  });

  // 3️⃣ Each employee's attendance that day and its payroll row, in two queries
  const attendanceByEmployee = await firstAttendanceByUser(
    employees.map((emp) => emp.id),
    { clock_in_est: { [Op.gte]: startOfDay, [Op.lt]: endOfDay } },
  );
  const payrollOf = await payrollByAttendance([...attendanceByEmployee.values()].map((a) => a.id));

  // 4️⃣ Build response PER EMPLOYEE (same pattern as working API)
  const rows = employees.map((emp) => {
      // find booking where this employee is assigned
      const booking = bookings.find((b) =>
        b.booking_employee_details.some((a) => a.employee_id === emp.id),
      );

      const attendance = attendanceByEmployee.get(emp.id);
      const payroll = attendance ? payrollOf.get(attendance.id) || null : null;

      return {
        employee_id: emp.id,
        role_id: emp.role_id,
        employee_type: emp.employee_type,
        attendance_id: attendance?.id || null,
        name: emp.user_profile?.name || "N/A",

        booking_id: booking?.id || null,

        clock_in: attendance?.clock_in_est
          ? dayjs.utc(attendance.clock_in_est).format(TIME_FORMAT)
          : null,

        clock_out: attendance?.clock_out_est
          ? dayjs.utc(attendance.clock_out_est).format(TIME_FORMAT)
          : null,

        total_hours: attendance?.total_hours || null,

        pay_per_day: payroll?.pay_per_day || null,
        bonus: payroll?.bonus || null,
        total_amount: payroll?.total_amount || null,

        is_manual: payroll?.is_manual || false,
      };
    });

  return {
    date,
    employees: rows,
  };
};

const getEmployeeRangeOverview = async ({
  start_date,
  end_date,
  employee_type,
}) => {
  // ✅ 1. Validate dates
  if (
    !start_date ||
    !end_date ||
    !isValidDate(start_date) ||
    !isValidDate(end_date)
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid date range");
  }

  const startDate = dayjs.utc(start_date).startOf("day").toDate();
  const endDate = dayjs.utc(end_date).endOf("day").toDate();

  // ✅ 2. Employees
  const employeeWhere = {
    role_id: { [Op.in]: EMPLOYEE_ROLE_IDS },
  };

  if (employee_type) {
    employeeWhere.employee_type = employee_type;
  }

  const employees = await User.findAll({
    where: employeeWhere,
    include: [
      {
        model: Profile,
        as: "user_profile",
        attributes: ["name"],
      },
    ],
  });

  const employeeMap = {};
  employees.forEach((emp) => {
    employeeMap[emp.id] = emp;
  });

  const employeeIds = employees.map((e) => e.id);

  if (!employeeIds.length) {
    return { rows: [] };
  }

  // ✅ 3. Bookings in range
  const bookings = await Booking.findAll({
    where: {
      is_active: true,
      payment_status: paymentStatusTypes.SUCCESS,
      date: {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      },
    },
    include: [
      {
        model: BookingAssignment,
        as: "booking_employee_details",
      },
    ],
  });

  // Map: employee_id + date → booking
  const bookingMap = {};
  bookings.forEach((b) => {
    const dateKey = toCalendarDate(b.date);

    b.booking_employee_details.forEach((a) => {
      const key = `${a.employee_id}_${dateKey}`;
      bookingMap[key] = b.id;
    });
  });

  // ✅ 4. Attendance (ONE QUERY 🔥)
  const attendances = await Attendance.findAll({
    where: {
      user_id: { [Op.in]: employeeIds },
      clock_in_est: {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      },
    },
  });

  const attendanceMap = {};
  attendances.forEach((att) => {
    const dateKey = dayjs.utc(att.clock_in_est).format(DATE_FORMAT);
    const key = `${att.user_id}_${dateKey}`;
    attendanceMap[key] = att;
  });

  // ✅ 5. Payroll (ONE QUERY 🔥)
  const attendanceIds = attendances.map((a) => a.id);

  const payrolls = await AttendancePayroll.findAll({
    where: {
      attendance_id: { [Op.in]: attendanceIds },
    },
  });

  const payrollMap = {};
  payrolls.forEach((p) => {
    payrollMap[p.attendance_id] = p;
  });

  // ✅ 6. Generate date range loop
  const results = [];

  let current = dayjs.utc(startDate);

  while (current.isSameOrBefore(endDate, "day")) {
    const dateKey = current.format(DATE_FORMAT);

    for (const empId of employeeIds) {
      const emp = employeeMap[empId];

      const key = `${empId}_${dateKey}`;

      const attendance = attendanceMap[key];
      const payroll = attendance ? payrollMap[attendance.id] : null;

      const bookingId = bookingMap[key] || null;

      results.push({
        employee_id: emp.id,
        role_id: emp.role_id,
        employee_type: emp.employee_type,
        name: emp.user_profile?.name || "N/A",

        date: dateKey,

        booking_id: bookingId,

        clock_in: attendance?.clock_in_est
          ? dayjs.utc(attendance.clock_in_est).format(TIME_FORMAT)
          : null,

        clock_out: attendance?.clock_out_est
          ? dayjs.utc(attendance.clock_out_est).format(TIME_FORMAT)
          : null,

        total_hours: attendance?.total_hours || null,

        pay_per_day: payroll?.pay_per_day || null,
        bonus: payroll?.bonus || null,
        total_amount: payroll?.total_amount || null,

        is_manual: payroll?.is_manual || false,
      });
    }

    current = current.add(1, "day");
  }

  return {
    start_date,
    end_date,
    total_records: results.length,
    rows: results,
  };
};

const updateEmployeeTimesheet = async (reqBody) => {
  try {
    const {
      employee_id,
      role_id,
      date,
      clock_in,
      clock_out,
      pay_per_day,
      bonus,
      total_amount,
      notes,
    } = reqBody;

    if (!employee_id || !date) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "employee_id and date are required",
      );
    }

    /* ---------------- TIME HELPERS ---------------- */
    const toUTC = (estDateTime) =>
      estDateTime ? inZone(estDateTime, BUSINESS_TZ).utc().toDate() : null;

    const toESTString = (utcDate) =>
      utcDate
        ? dayjs(utcDate).tz(BUSINESS_TZ).format(DATETIME_FORMAT)
        : null;

    const clockInEST = clock_in ? `${date} ${clock_in}` : null;
    const clockOutEST = clock_out ? `${date} ${clock_out}` : null;

    let clockInUTC = toUTC(clockInEST);
    let clockOutUTC = toUTC(clockOutEST);

    /* ----------- HANDLE OVERNIGHT SHIFT ----------- */
    if (clockInUTC && clockOutUTC && clockOutUTC < clockInUTC) {
      clockOutUTC = toUTC(`${addDays(toCalendarDate(date), 1)} ${clock_out}`);
    }

    /* ---------------- FIND ATTENDANCE ---------------- */
    let attendance = await Attendance.findOne({
      where: {
        user_id: employee_id,
        [Op.and]: Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("clock_in_est")),
          date,
        ),
      },
    });

    /* ---------------- CALCULATE HOURS ---------------- */
    let totalHours = attendance?.total_hours || null;

    if (clockInUTC && clockOutUTC) {
      const diffMins = Math.floor((clockOutUTC - clockInUTC) / (1000 * 60));
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      totalHours = `${hrs} hours ${mins} minutes`;
    }

    /* ---------------- UPSERT ATTENDANCE ---------------- */
    if (!attendance) {
      attendance = await Attendance.create({
        user_id: employee_id,
        role_id: role_id || null,
        clock_in: clockInUTC,
        clock_in_est: clockInUTC ? toESTString(clockInUTC) : null,
        clock_out: clockOutUTC,
        clock_out_est: clockOutUTC ? toESTString(clockOutUTC) : null,
        total_hours: totalHours || "0 hours 0 minutes",
        added_by_admin: true,
      });
    } else {
      await attendance.update({
        clock_in: clockInUTC ?? attendance.clock_in,
        clock_in_est: clockInUTC
          ? toESTString(clockInUTC)
          : attendance.clock_in_est,
        clock_out: clockOutUTC ?? attendance.clock_out,
        clock_out_est: clockOutUTC
          ? toESTString(clockOutUTC)
          : attendance.clock_out_est,
        total_hours: totalHours,
      });
    }

    /* ---------------- PAYROLL ---------------- */
    let payroll = await AttendancePayroll.findOne({
      where: { attendance_id: attendance.id },
    });

    const finalPayPerDay = pay_per_day ?? payroll?.pay_per_day ?? 0;
    const finalBonus = bonus ?? payroll?.bonus ?? 0;

    const finalTotalAmount =
      total_amount !== undefined
        ? total_amount // manual override
        : finalPayPerDay + finalBonus;

    if (!payroll) {
      payroll = await AttendancePayroll.create({
        attendance_id: attendance.id,
        pay_per_day: finalPayPerDay,
        bonus: finalBonus,
        total_amount: finalTotalAmount,
        notes,
        is_manual: true,
      });
    } else {
      await payroll.update({
        pay_per_day: finalPayPerDay,
        bonus: finalBonus,
        total_amount: finalTotalAmount,
        notes,
        is_manual: true,
      });
    }

    return {
      message: "Employee timesheet updated successfully",
      attendance,
      payroll,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

// Today through today + days (New York calendar dates), in the bookings.date convention
const getESTRange = (days = 14) => {
  const today = dateInTz();
  return {
    start: calendarDateUtc(today).toDate(),
    end: calendarDateUtc(addDays(today, days)).endOf("day").toDate(),
  };
};


const buildFullAddress = (addr) => {
  if (!addr) return "N/A";

  return [
    addr.address,
    addr.user_city?.name,
    addr.user_state?.name,
    addr.user_country?.name,
  ]
    .filter(Boolean)
    .join(", ");
};

const getGoogleMapsLink = (lat, lng) => {
  if (!lat || !lng) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
};

const sendEmployeeTwoWeekSchedule = async (employee_id) => {
  try {
    if (!employee_id) {
      throw new Error("employee_id is required");
    }

    const { start, end } = getESTRange(14);

    const bookings = await Booking.findAll({
      where: {
        booking_status: bookingTypes.ACCEPTED,
        is_active: true,
        date: {
          [Op.between]: [start, end],
        },
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          where: { employee_id },
          required: true,
        },
        {
          model: UserAddress,
          as: "booking_address",
          attributes: ["address", "address_lat", "address_long"],
          include: [
            { model: Country, as: "user_country", attributes: ["name"] },
            { model: State, as: "user_state", attributes: ["name"] },
            { model: City, as: "user_city", attributes: ["name"] },
          ],
        },
      ],
      order: [["date", "ASC"]],
    });

    if (!bookings.length) {
      return {
        success: true,
        type: "NO_BOOKINGS",
        message: "No bookings found for next 2 weeks",
      };
    }

    const bookingsList = bookings.map((b) => {
      const addr = b.booking_address;

      return {
        booking_name: b.booking_name,
        date: formatDisplayDate(b.date),
        time: formatTime12h(b.time),
        address: buildFullAddress(addr), // ✅ full address
        map_link: getGoogleMapsLink(addr?.address_lat, addr?.address_long),
        notes: b.notes || "-", // if exists
      };
    });

    const user = await User.findByPk(employee_id, {
      include: [{ model: Profile, as: "user_profile" }],
    });

    await sendTwoWeekScheduleEmail({
      to: user.email,
      name: user.user_profile?.name || "User",
      bookings: bookingsList,
    });

    return {
      success: true,
      type: "EMAIL_SENT",
      count: bookingsList.length,
    };
  } catch (err) {
    throw err;
  }
};

module.exports = {
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  checkBookingRequest,
  adminCreateBooking,
  getMonthlyBookingCalendar,
  sendAttendanceAlerts,
  notifyAdminIfClockoutFar,
  getDayOverview,
  getBookingOverviewById,
  adminCreateBookingForGuest,
  deleteBooking,
  getDayOverviewForGantt,
  getEmployeeDayOverview,
  getEmployeeRangeOverview,
  updateEmployeeTimesheet,
  sendEmployeeTwoWeekSchedule,
};
