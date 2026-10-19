// Admin booking service: booking lists, details, status changes (including recurring series), deletion and the monthly calendar

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { bookingListFilterTypes, bookingTypes, paymentStatusTypes } = require("../../../config/types");
const {
  calendarDateUtc,
  toCalendarDate,
  bookingUtcParts,
  addDays,
  isoWeekStart,
} = require("../../../utils/time");
const { randomUUID: uuidv4 } = require("crypto");
const {
  Booking,
  Service,
  Profile,
  User,
  UserAttachment,
  ServiceAttachment,
  UserAddress,
  BookingAssignment,
  Country,
  State,
  City,
  BookingAttachment,
  Admin,
  GuestBookingAddress,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { PAGINATION } = require("../../../config/rules");
const { parsePagination } = require("../../../utils/pagination");
const toBoolean = require("../../../utils/toBoolean");
const { ROLE } = require("../../../config/roles");
const { Op } = require("sequelize");
const config = require("../../../config/config");
const getCoordinatesFromGoogleMapLink = require("../../../config/getCoordinatesFromGoogleMapLink");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { createRecurringBookings, createRecurringGuestBookings } = require("./recurrence");

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
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.toDate(),
            [Op.lt]: today.clone().add(1, "days").toDate(),
          },
        };
      } else if (period === "past_30_days") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.clone().subtract(30, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "past_90_days") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING],
          is_active: true,
          payment_status: paymentStatusTypes.SUCCESS,
          date: {
            [Op.gte]: today.clone().subtract(90, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "all") {
        whereCondition = {
          booking_status: [bookingTypes.SUCCESS, bookingTypes.ACCEPTED, bookingTypes.PENDING],
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
        booking_status: [bookingTypes.REJECTED, bookingTypes.CANCELLED],
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
        booking_status: [bookingTypes.PENDING],
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
      throw new ApiError(httpStatus.NOT_FOUND, "No bookings found");
    }

    return bookingDoc;
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

// ----- updating a booking (status, details, employees, recurrence)

// The status, time and name fields of a status update, with the booking's UTC date and time
// recomputed when it has a time zone and a date and time to work from
const statusAndTimesUpdate = (bookingDoc, { date, time, end_time_by_admin, booking_name, booking_status, google_map_link }, effectiveDate) => {
  let updateData = {
    booking_status,
    google_map_link,
    time,
    booking_name,
    end_time_by_admin,
  };

  const effectiveTime = time || bookingDoc.time;

  if (effectiveDate && effectiveTime && bookingDoc.time_zone) {
    const { date_in_utc, time_in_utc } = bookingUtcParts(effectiveDate, effectiveTime, bookingDoc.time_zone);

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

  if (booking_name) {
    updateData.booking_name = booking_name;
  }

  return updateData;
};

// The booking fields an edit sends, and the recurrence fields it includes (repeat_on_days may come
// as JSON text; unreadable text counts as no days)
const bookingEditPayload = ({ booking_name, client_name, date, time, booking_status, google_map_link, end_time_by_admin, repeat_on_days, recurring_type, recurring_every, recurrence_end_type, recurrence_end_value }) => {
  const updatePayload = {
    booking_name,
    client_name,
    date,
    time,
    booking_status,
    google_map_link,
    end_time_by_admin,
  };

  if (typeof repeat_on_days !== "undefined") {
    let parsedRepeatDays = repeat_on_days;

    if (typeof repeat_on_days === "string") {
      try {
        parsedRepeatDays = JSON.parse(repeat_on_days);
      } catch {
        logger.warn("Failed to parse repeat_on_days, defaulting to empty array");
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

  return updatePayload;
};

// Saves a Google Maps link's coordinates on the booking's address
const saveMapLocation = async (bookingDoc, google_map_link) => {
  const coordinates = await getCoordinatesFromGoogleMapLink(google_map_link, config.GOOGLE_API_KEY);
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
};

// Adds the cleaners, supervisors and quality inspectors the request names, skipping repeats and
// assignments the booking already has
const assignEmployees = async (booking_id, { cleaners, supervisors, quality_inspectors }) => {
  const assignments = [];

  if (Array.isArray(cleaners) && cleaners.length > 0) {
    cleaners.forEach((id) => assignments.push({ booking_id, employee_id: id, role_id: ROLE.CLEANER }));
  }
  if (Array.isArray(supervisors) && supervisors.length > 0) {
    supervisors.forEach((id) => assignments.push({ booking_id, employee_id: id, role_id: ROLE.SUPERVISOR }));
  }
  if (Array.isArray(quality_inspectors) && quality_inspectors.length > 0) {
    quality_inspectors.forEach((id) => assignments.push({ booking_id, employee_id: id, role_id: ROLE.QUALITY_INSPECTOR }));
  }

  if (assignments.length === 0) return;

  // Remove duplicates inside the same request
  const uniqueAssignments = assignments.filter(
    (obj, index, self) =>
      index === self.findIndex((t) => t.booking_id === obj.booking_id && t.employee_id === obj.employee_id && t.role_id === obj.role_id),
  );

  const existingAssignments = await BookingAssignment.findAll({
    where: { booking_id },
    attributes: ["employee_id", "role_id"],
    raw: true,
  });

  const existingSet = new Set(existingAssignments.map((a) => `${a.employee_id}-${a.role_id}`));

  const newAssignments = uniqueAssignments.filter((a) => !existingSet.has(`${a.employee_id}-${a.role_id}`));

  if (newAssignments.length > 0) {
    await BookingAssignment.bulkCreate(newAssignments);
    logger.debug("Saved new assignments:", newAssignments.length);
  }
};

// The booking's Firebase group chat: the assigned employees, every super admin and the booking's BDM.
// An existing group gains the new members and loses the removed employees; a new one gets a welcome
// message.
const syncBookingGroupChat = async (bookingDoc, booking_id, { cleaners, supervisors, quality_inspectors, remove_employees }, effectiveDate) => {
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

  const groupName = `${bookingDoc.booking_name || "Booking"} - ${effectiveDate || toCalendarDate(bookingDoc.date)}`;

  const groupRef = getDatabase().ref(`GroupChats/booking_${booking_id}`);
  const snapshot = await groupRef.once("value");

  if (snapshot.exists()) {
    const existingMembers = snapshot.val().members || {};

    [...allMembers].forEach((id) => {
      if (!existingMembers[id]) existingMembers[id] = true;
    });

    if (Array.isArray(remove_employees) && remove_employees.length > 0) {
      remove_employees.forEach((empId) => {
        const empKey = `employee_${empId}`;
        if (existingMembers[empKey]) delete existingMembers[empKey];
      });
    }

    await groupRef.update({ members: existingMembers });
  } else {
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
};

// After an accepted update: a recurring booking that sends recurrence settings gets a new series
// (user or guest); a booking no longer recurring has its recurrence cleared
const applyRecurrence = async (bookingDoc, booking_id, { is_recurring, recurring_every, recurring_type, repeat_on_days, recurrence_end_type, recurrence_end_value, client_name }) => {
  const isRecurringBooking = is_recurring === true && bookingDoc.type === "Recurring Booking";

  if (!isRecurringBooking) {
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
    return;
  }

  const isRecurrenceInputMissing =
    recurring_every === undefined &&
    recurring_type === undefined &&
    (repeat_on_days === undefined || repeat_on_days.length === 0) &&
    recurrence_end_type === undefined &&
    recurrence_end_value === undefined;

  if (isRecurrenceInputMissing) return;

  const recurrence_id = uuidv4();

  await Booking.update(
    {
      is_recurring: true,
      recurring_every,
      recurring_type,
      repeat_on_days: Array.isArray(repeat_on_days) ? repeat_on_days : null,
      recurrence_end_type,
      recurrence_end_value,
      recurrence_id,
      client_name,
    },
    { where: { id: booking_id } },
  );

  const series = {
    baseBooking: bookingDoc,
    recurring_every,
    recurring_type,
    repeat_on_days: repeat_on_days || [],
    recurrence_end_type,
    recurrence_end_value,
    recurrence_id,
  };

  if (bookingDoc.user_id === null) {
    await createRecurringGuestBookings(series);
  } else {
    await createRecurringBookings({ ...series, user_id: bookingDoc.user_id });
  }
};

// POST /admin/booking/updateBookingStatus. A booking in a series edited as "following" or "all" is
// handled by updateRecurringBookingWithEditMode; otherwise the booking is updated, a rejected one is
// deactivated, and an accepted one gets its employees, group chat and recurrence.
const updateBookingStatus = async (reqBody) => {
  const { booking_id, date, booking_status, google_map_link, cleaners, supervisors, quality_inspectors, remove_employees, client_name } = reqBody;

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

    const effectiveDate = date || (bookingDoc.date ? toCalendarDate(bookingDoc.date) : null);
    const updateData = statusAndTimesUpdate(bookingDoc, reqBody, effectiveDate);
    const updatePayload = bookingEditPayload(reqBody);

    const editMode = reqBody.edit_mode || "this";

    if (bookingDoc.recurrence_id && editMode !== "this") {
      return await updateRecurringBookingWithEditMode(booking_id, updatePayload, editMode, createRecurringBookings);
    }

    await Booking.update(updatePayload, { where: { id: booking_id } });
    await Booking.update(updateData, { where: { id: booking_id } });

    if (google_map_link) {
      await saveMapLocation(bookingDoc, google_map_link);
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

    if (booking_status === bookingTypes.ACCEPTED || bookingDoc.booking_status === bookingTypes.ACCEPTED) {
      await assignEmployees(booking_id, { cleaners, supervisors, quality_inspectors });
      await syncBookingGroupChat(bookingDoc, booking_id, { cleaners, supervisors, quality_inspectors, remove_employees }, effectiveDate);

      if (typeof is_recurring !== "boolean") {
        return {
          success: false,
          message: "Invalid 'is_recurring' type",
        };
      }

      await applyRecurrence(bookingDoc, booking_id, { ...reqBody, is_recurring, client_name });

      return {
        success: true,
        message: "Booking status updated to accepted, employees assigned/removed successfully",
      };
    }
  } catch (error) {
    logger.error("Exception caught in updateBookingStatus:", error);
    throw ApiError.orInternal(error);
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

module.exports = {
  getAllBookings,
  getBookingById,
  updateBookingStatus,
  getMonthlyBookingCalendar,
  deleteBooking,
};
