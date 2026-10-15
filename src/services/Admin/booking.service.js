/** @format */

const { status: httpStatus } = require("http-status");
const moment = require("moment");
const { randomUUID: uuidv4 } = require("crypto");

const { Booking, Service, Profile, User, UserAttachment, ServiceAttachment, UserAddress, BookingAssignment, Country, State, City, BookingAttachment, BDMUser, Admin, Attendance, GuestBookingAddress, Break, AttendancePayroll } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { Sequelize, Op } = require("sequelize");
const config = require("../../config/config");
const { sendEmailToAdmin, sendClockOutDistanceEmail, sendGroupedAttendanceEmail, sendTwoWeekScheduleEmail } = require("../Common/email.service");
const { generateBookingId } = require("../Common/bookings.service");
const getCoordinatesFromGoogleMapLink = require("../../config/getCoordinatesFromGoogleMapLink");
const { getDatabase, ServerValue } = require("firebase-admin/database");

const getAllBookings = async (reqBody) => {
  try {
    const today = moment().startOf("day").toDate();

    const { booking_status, period } = reqBody;

    // ─── Pagination — defaults kept generous so existing frontend calls
    // that don't send these yet still work, but no longer unbounded. ───
    const page = Number(reqBody.page) > 0 ? Number(reqBody.page) : 1;
    const limit = Number(reqBody.limit) > 0 ? Number(reqBody.limit) : 50;
    const offset = (page - 1) * limit;

    let whereCondition = {};

    if (booking_status === "ONGOING") {
      whereCondition = {
        booking_status: "ONGOING",
        is_active: true,
        payment_status: "SUCCESS",
      };
    } else if (booking_status === "COMPLETED") {
      const today = moment().startOf("day");
      if (period === "today") {
        whereCondition = {
          booking_status: ["SUCCESS", "ACCEPTED", "PENDING", "RESCHEDULED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today.toDate(),
            [Op.lt]: today.clone().add(1, "days").toDate(),
          },
        };
      } else if (period === "past_30_days") {
        whereCondition = {
          booking_status: ["SUCCESS", "ACCEPTED", "PENDING", "RESCHEDULED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today.clone().subtract(30, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "past_90_days") {
        whereCondition = {
          booking_status: ["SUCCESS", "ACCEPTED", "PENDING", "RESCHEDULED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today.clone().subtract(90, "days").toDate(),
            [Op.lt]: today.toDate(),
          },
        };
      } else if (period === "all") {
        whereCondition = {
          booking_status: ["SUCCESS", "ACCEPTED", "PENDING", "RESCHEDULED"],
          is_active: true,
          payment_status: "SUCCESS",
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
    } else if (booking_status === "CANCELLED") {
      whereCondition = {
        booking_status: ["REJECTED", "DELETED", "CANCELLED"],
        is_active: true,
        payment_status: "SUCCESS",
      };
    } else if (booking_status === "UPCOMING") {
      if (period === "today") {
        const today = moment().startOf("day");
        whereCondition = {
          booking_status: ["ACCEPTED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today.toDate(),
            [Op.lt]: today.clone().add(1, "days").toDate(),
          },
        };
      } else if (period === "current_week") {
        const endOfWeek = moment().endOf("isoWeek");
        whereCondition = {
          booking_status: ["ACCEPTED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today,
            [Op.lt]: endOfWeek.toDate(),
          },
        };
      } else if (period === "current_month") {
        const endOfMonth = moment().endOf("month");
        whereCondition = {
          booking_status: ["ACCEPTED"],
          is_active: true,
          payment_status: "SUCCESS",
          date: {
            [Op.gte]: today,
            [Op.lt]: endOfMonth.toDate(),
          },
        };
      } else if (period === "all") {
        whereCondition = {
          booking_status: ["ACCEPTED"],
          is_active: true,
          payment_status: "SUCCESS",
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
    } else if (booking_status === "PENDING") {
      whereCondition = {
        booking_status: ["PENDING", "RESCHEDULED"],
        is_active: true,
        payment_status: "SUCCESS",
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
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};





const checkBookingRequest = async () => {
  try {
    // Define the condition for fetching pending and active bookings
    const whereCondition = {
      booking_status: "PENDING",
      is_active: true,
      payment_status: "SUCCESS",
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
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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
          : moment(bookingDoc.date).format("YYYY-MM-DD");

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
      const computeUTCDateAndTime = (date, time, time_zone) => {
        const local = moment.tz(
          `${date} ${time}`,
          "YYYY-MM-DD HH:mm:ss",
          time_zone,
        );

        if (!local.isValid()) {
          console.warn("❌ Invalid date or time:", { date, time, time_zone });
          return {
            date_in_utc: null,
            time_in_utc: null,
          };
        }

        return {
          date_in_utc: local.utc().format("YYYY-MM-DD"),
          time_in_utc: local.utc().format("HH:mm:ss"),
        };
      };

      const { date_in_utc, time_in_utc } = computeUTCDateAndTime(
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
    console.error("❌ Error in updateRecurringBookingWithEditMode:", err);
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

  console.log(reqBody.end_time_by_admin, "reqBody");

  let is_recurring = reqBody.is_recurring;

  if (typeof is_recurring === "string") {
    is_recurring = is_recurring === "true";
  }

  console.log("🔶 Incoming Request Body:", JSON.stringify(reqBody, null, 2));

  try {
    const bookingDoc = await Booking.findByPk(booking_id);
    if (!bookingDoc) {
      console.error("❌ Booking not found with ID:", booking_id);
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }
    console.log("✅ Booking found:", bookingDoc.toJSON());

    // If date & time are being updated, compute UTC versions
    let updateData = {
      booking_status,
      google_map_link,
      time,
      booking_name,
      end_time_by_admin,
    };
    console.log("🧪 Initial updateData:", updateData);

    console.log("INPUT TIME:", time);
    console.log("time_zone:", bookingDoc.time_zone);

    const computeUTCDateAndTime = (date, time, time_zone) => {
      const local = moment.tz(
        `${date} ${time}`,
        "YYYY-MM-DD HH:mm:ss",
        time_zone,
      );

      if (!local.isValid()) {
        console.warn("❌ Invalid date or time:", { date, time, time_zone });
        return {
          date_in_utc: null,
          time_in_utc: null,
        };
      }

      return {
        date_in_utc: local.utc().format("YYYY-MM-DD"),
        time_in_utc: local.utc().format("HH:mm:ss"),
      };
    };
    const formatDate = (inputDate) =>
      typeof inputDate === "string"
        ? inputDate.split("T")[0]
        : moment.utc(inputDate).format("YYYY-MM-DD");

    let effectiveDate =
      date || (bookingDoc.date ? formatDate(bookingDoc.date) : null);
    let effectiveTime = time || bookingDoc.time;

    console.log("📆 Effective Date:", effectiveDate);
    console.log("⏱️ Effective Time:", effectiveTime);

    if (effectiveDate && effectiveTime && bookingDoc.time_zone) {
      const { date_in_utc, time_in_utc } = computeUTCDateAndTime(
        effectiveDate,
        effectiveTime,
        bookingDoc.time_zone,
      );

      console.log("✅ Computed UTC:", { date_in_utc, time_in_utc });

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

    console.log("🔍 Type of repeat_on_days:", typeof repeat_on_days);
    console.log("🧾 repeat_on_days:", repeat_on_days);

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
          console.warn(
            "⚠️ Failed to parse repeat_on_days, defaulting to empty array",
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

    console.log("🛠️ Update Payload:", updatePayload);
    const editMode = reqBody.edit_mode || "this";

    console.log("✏️ Edit Mode:", editMode);

    if (!bookingDoc.recurrence_id || editMode === "this") {
      console.log("📌 Updating single booking...");
      await Booking.update(updatePayload, { where: { id: booking_id } });
    } else {
      console.log("🔁 Updating recurring bookings via utility function...");
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

    if (booking_status === "REJECTED") {
      await Booking.update(
        {
          booking_status: "REJECTED",
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
      booking_status === "ACCEPTED" ||
      bookingDoc.booking_status === "ACCEPTED"
    ) {
      console.log("✅ Booking accepted, assigning employees...");
      const assignments = [];

      if (Array.isArray(cleaners) && cleaners.length > 0) {
        console.log("🧼 Cleaners:", cleaners);
        cleaners.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: 9 }),
        );
      }
      if (Array.isArray(supervisors) && supervisors.length > 0) {
        console.log("👷 Supervisors:", supervisors);
        supervisors.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: 7 }),
        );
      }
      if (Array.isArray(quality_inspectors) && quality_inspectors.length > 0) {
        console.log("🔍 Quality Inspectors:", quality_inspectors);

        quality_inspectors.forEach((id) =>
          assignments.push({ booking_id, employee_id: id, role_id: 8 }),
        );
      }

      if (assignments.length > 0) {
        console.log("📥 Bulk creating assignments...");

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
          console.log("✅ Saved new assignments:", newAssignments.length);
        } else {
          console.log("⚠️ No new unique assignments to save.");
        }
      }

      console.log("💬 Creating group chat...");
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

      console.log("🔁 Is Recurring Booking:", isRecurringBooking);

      if (typeof is_recurring === "string") {
        is_recurring = is_recurring === "true";
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
          console.log(
            "⚠️ Recurring is true but recurrence values are missing — skipping update and recurring booking creation.",
          );
          // Skip everything
        } else {
          const recurrence_id = uuidv4();

          console.log("📆 Creating recurring booking instance...");

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
            console.log("👥 Creating recurring bookings for guest user...");
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
            console.log(
              "👤 Creating recurring bookings for registered user...",
            );
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
    console.error("❌ Exception caught in updateBookingStatus:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    const originalMoment = moment.utc(
      typeof baseBooking.date === "string"
        ? baseBooking.date.split("T")[0]
        : moment(baseBooking.date).format("YYYY-MM-DD"),
      "YYYY-MM-DD",
    );

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
      endMoment = moment
        .utc(
          typeof recurrence_end_value === "string"
            ? recurrence_end_value.split("T")[0]
            : moment(recurrence_end_value).format("YYYY-MM-DD"),
          "YYYY-MM-DD",
        )
        .endOf("day");
    } else if (recurrence_end_type === "never") {
      endMoment = moment.utc().add(10, "years").endOf("day");
    }

    let count = 0;
    let parentBookingId = null;

    async function createOneBooking(dateMoment) {
      const nextDateStr = dateMoment.format("YYYY-MM-DD");
      console.log("🛠 Creating one booking at:", nextDateStr);

      const newBookingId = await generateBookingId(
        baseBooking.service_id,
        nextDateStr,
      );
      console.log("🆔 Generated booking ID:", newBookingId);

      const localDateTime = moment.tz(
        `${nextDateStr} ${baseBooking.time}`,
        "YYYY-MM-DD HH:mm:ss",
        baseBooking.time_zone,
      );

      const date_in_utc = localDateTime.utc().format("YYYY-MM-DD");
      const time_in_utc = localDateTime.utc().format("HH:mm:ss");

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
        payment_status: "SUCCESS",
        booking_status: "ACCEPTED",
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
      console.log("✅ Booking created and added to list.");
    }

    // ---------------------------
    // WEEKLY
    // ---------------------------
    if (recurring_type === "week" && repeatOnIndexes.length > 0) {
      console.log("🗓 Starting weekly recurrence logic...");

      let cursor = originalMoment.clone().add(1, "day");
      let weekCounter = 0;

      while (true) {
        console.log(
          "📅 Week loop:",
          weekCounter,
          "cursor:",
          cursor.format("YYYY-MM-DD"),
        );

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          console.log("⏹️ Reached 'after' count limit");
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          console.log("⏹️ Reached 'never' safety limit");
          break;
        }
        if (endMoment && cursor.isAfter(endMoment)) {
          console.log("⏹️ cursor passed endDate, stopping weekly loop");
          break;
        }

        const weekStart = cursor.clone().startOf("week"); // Sunday in moment

        for (const dayIdx of repeatOnIndexes) {
          const candidate = weekStart.clone().add(dayIdx, "days");

          if (candidate.isSameOrBefore(originalMoment, "day")) continue;
          if (endMoment && candidate.isAfter(endMoment)) continue;

          console.log(
            "✅ Creating booking for:",
            candidate.format("YYYY-MM-DD"),
          );
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
          console.warn("⚠️ Week loop exceeded safe iteration count, breaking");
          break;
        }
      }

      console.log("🎉 All weekly recurring bookings created.");
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

        console.log(
          "🔄 Iteration:",
          iter,
          "candidate:",
          candidate.format("YYYY-MM-DD"),
        );

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          console.log("⏹️ Reached 'after' count limit");
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          console.log("⏹️ Reached 'never' safety limit");
          break;
        }
        if (endMoment && candidate.isAfter(endMoment)) {
          console.log("⏹️ candidate passed endDate, stopping loop");
          break;
        }

        if (candidate.isAfter(originalMoment, "day")) {
          console.log(
            "✅ Creating booking for:",
            candidate.format("YYYY-MM-DD"),
          );
          await createOneBooking(candidate.clone());
          count++;
        }

        if (iter > 20000) {
          console.warn(
            "⚠️ Exceeded safe iterations for date generation, breaking",
          );
          break;
        }
      }
    }

    console.log("🎉 All recurring bookings created.");
    return {
      success: true,
      message: `${recurrenceList.length} recurring bookings created.`,
      firstBookingId: recurrenceList[0]?.id || null,
    };
  } catch (error) {
    console.error("❌ Error in createRecurringBookings:", error);
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

    const bookingId = await generateBookingId(serviceDoc.id, date);
    const { date_in_utc, time_in_utc } = computeUTCDateAndTime(date, time);

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
      payment_status: "SUCCESS",
      booking_status: "ACCEPTED",
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
      const baseDay = moment.utc(
        typeof date === "string" ? date.split("T")[0] : date,
        "YYYY-MM-DD",
      ).day();
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
      booking_id:
        bookingDoc?.id !== -1
          ? bookingDoc?.id
          : recurringResult?.firstBookingId || null,
      message: "Booking created successfully by admin",
    };
  } catch (error) {
    console.error("Admin Booking Error:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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

    const bookingId = await generateBookingId(serviceDoc.id, date);
    const { date_in_utc, time_in_utc } = computeUTCDateAndTime(date, time);

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
      payment_status: "SUCCESS",
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
    const baseDay = moment.utc(
      typeof date === "string" ? date.split("T")[0] : date,
      "YYYY-MM-DD",
    ).day();
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
    console.error("Admin Booking Error:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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
    const originalMoment = moment.utc(
      typeof baseBooking.date === "string"
        ? baseBooking.date.split("T")[0]
        : moment(baseBooking.date).format("YYYY-MM-DD"),
      "YYYY-MM-DD",
    );

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
      endMoment = moment
        .utc(
          typeof recurrence_end_value === "string"
            ? recurrence_end_value.split("T")[0]
            : moment(recurrence_end_value).format("YYYY-MM-DD"),
          "YYYY-MM-DD",
        )
        .endOf("day");
    } else if (recurrence_end_type === "never") {
      endMoment = moment.utc().add(10, "years").endOf("day");
    }

    let count = 0;
    let parentBookingId = null;

    async function createOneBooking(dateMoment) {
      const nextDateStr = dateMoment.format("YYYY-MM-DD");
      const newBookingId = await generateBookingId(
        baseBooking.service_id,
        nextDateStr,
      );

      const localDateTime = moment.tz(
        `${nextDateStr} ${baseBooking.time}`,
        "YYYY-MM-DD HH:mm:ss",
        baseBooking.time_zone,
      );

      const date_in_utc = localDateTime.utc().format("YYYY-MM-DD");
      const time_in_utc = localDateTime.utc().format("HH:mm:ss");

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
        payment_status: "SUCCESS",
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
      console.log("🗓 Starting weekly recurrence logic...");

      let cursor = originalMoment.clone().add(1, "day");
      let weekCounter = 0;

      while (true) {
        console.log(
          "📅 Week loop:",
          weekCounter,
          "cursor:",
          cursor.format("YYYY-MM-DD"),
        );

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          console.log("⏹️ Reached 'after' count limit");
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          console.log("⏹️ Reached 'never' safety limit");
          break;
        }
        if (endMoment && cursor.isAfter(endMoment)) {
          console.log("⏹️ cursor passed endDate, stopping weekly loop");
          break;
        }

        const weekStart = cursor.clone().startOf("week");

        for (const dayIdx of repeatOnIndexes) {
          const candidate = weekStart.clone().add(dayIdx, "days");

          if (candidate.isSameOrBefore(originalMoment, "day")) continue;
          if (endMoment && candidate.isAfter(endMoment)) continue;

          console.log(
            "✅ Creating booking for:",
            candidate.format("YYYY-MM-DD"),
          );
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
          console.warn("⚠️ Week loop exceeded safe iteration count, breaking");
          break;
        }
      }

      console.log("🎉 All weekly recurring bookings created.");
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

        console.log(
          "🔄 Iteration:",
          iter,
          "candidate:",
          candidate.format("YYYY-MM-DD"),
        );

        if (recurrence_end_type === "after" && count >= recurrence_end_value) {
          console.log("⏹️ Reached 'after' count limit");
          break;
        }
        if (recurrence_end_type === "never" && count >= 100) {
          console.log("⏹️ Reached 'never' safety limit");
          break;
        }
        if (endMoment && candidate.isAfter(endMoment)) {
          console.log("⏹️ candidate passed endDate, stopping loop");
          break;
        }

        if (candidate.isAfter(originalMoment, "day")) {
          console.log(
            "✅ Creating booking for:",
            candidate.format("YYYY-MM-DD"),
          );
          await createOneBooking(candidate.clone());
          count++;
        }

        if (iter > 20000) {
          console.warn(
            "⚠️ Exceeded safe iterations for date generation, breaking",
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
    console.error("Error creating recurring bookings:", error);
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
    const startDate = moment(`${year}-${month}-01`).startOf("day").toDate();
    const endDate = moment(`${year}-${month}-${daysInMonth}`)
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
      const normalizedDate = moment.utc(
        typeof booking.date === "string"
          ? booking.date.split("T")[0]
          : booking.date,
      ).format("YYYY-MM-DD");
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
    console.error("Error in getMonthlyBookingCalendar:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to get monthly booking calendar",
    );
  }
};


const sendAttendanceAlerts = async () => {
  try {
    const now = new Date();

    // 🔍 Raw server time
    console.log("🌍 Server now (raw):", now);

    // 🔍 EST via en-US (full datetime)
    const nowEST_enUS = now.toLocaleString("en-US", {
      timeZone: "America/New_York",
    });

    // 🔍 EST via en-CA (ISO-like)
    const nowEST_enCA = now.toLocaleString("en-CA", {
      timeZone: "America/New_York",
    });

    console.log("🕒 nowEST (en-US):", nowEST_enUS);
    console.log("🕒 nowEST (en-CA):", nowEST_enCA);

    // ⚠️ Your current conversion
    const nowEST = new Date(nowEST_enUS);
    console.log("🚨 Parsed nowEST Date object:", nowEST);

    // 📅 todayEST formats
    const todayEST_enUS = now.toLocaleDateString("en-US", {
      timeZone: "America/New_York",
    });

    const todayEST_enCA = now.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    console.log("📅 todayEST (en-US):", todayEST_enUS);
    console.log("📅 todayEST (en-CA):", todayEST_enCA);

    // 👉 Use this one in your query
    const todayEST = todayEST_enCA;

    console.log("✅ Final todayEST used in query:", todayEST);

    const startOfDay = new Date(`${todayEST}T00:00:00`);
    const endOfDay = new Date(`${todayEST}T23:59:59`);

    console.log("📅 EST Range:", { startOfDay, endOfDay });

    const bookings = await Booking.findAll({
      where: {
        booking_status: "ACCEPTED",
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

    console.log("📦 Bookings found:", bookings.length);
    console.log("📦 Bookings found:", bookings);

    for (const booking of bookings) {
      console.log("🔹 Checking Booking:", booking.booking_name, booking.time);

      const { booking_employee_details } = booking;

      if (!booking_employee_details?.length) {
        console.log("⛔ No employees assigned");
        continue;
      }

      const bookingStart = new Date(`${todayEST}T${booking.time}`);

      const lateThreshold = new Date(
        bookingStart.getTime() + 1 * 60 * 60 * 1000,
      );

      const absentThreshold = new Date(
        bookingStart.getTime() + 2 * 60 * 60 * 1000,
      );

      console.log("⏱ Thresholds:", {
        bookingStart,
        lateThreshold,
        absentThreshold,
      });

      let employeesToNotify = [];

      for (const assignment of booking_employee_details) {
        const employeeId = assignment.employee_id;

        console.log("👤 Checking employee:", employeeId);

        const attendanceEntry = await Attendance.findOne({
          where: {
            user_id: employeeId,
            clock_in_est: {
              [Op.between]: [startOfDay, endOfDay],
            },
          },
        });

        console.log("📍 Attendance entry:", attendanceEntry);

        let status = null;

        if (!attendanceEntry) {
          console.log("⚠️ No attendance");

          if (nowEST >= absentThreshold) {
            status = "ABSENT";
          } else if (nowEST >= lateThreshold) {
            status = "LATE";
          } else {
            console.log("⏳ Too early, skipping");
            continue;
          }
        } else {
          const clockInTime = new Date(attendanceEntry.clock_in_est);

          console.log("🕒 Clock-in time:", clockInTime);

          if (clockInTime > lateThreshold) {
            status = "LATE";
          } else {
            console.log("✅ On time, skipping");
            continue;
          }
        }

        console.log("🚨 Final Status:", status);

        const user = await User.findByPk(employeeId, {
          include: [{ model: Profile, as: "user_profile" }],
        });

        employeesToNotify.push({
          name: user?.user_profile?.name || "N/A",
          roleId: assignment.role_id,
          status,
        });
      }

      console.log("📢 Employees to notify:", employeesToNotify);

      if (!employeesToNotify.length) {
        console.log("❌ No one to notify");
        continue;
      }

      const absentEmployees = employeesToNotify.filter(
        (e) => e.status === "ABSENT",
      );

      console.log("🔴 Absent Employees:", absentEmployees.length);

      if (absentEmployees.length && !booking.absent_alert_sent) {
        console.log("📧 Sending ABSENT email");

        await sendGroupedAttendanceEmail({
          booking,
          employees: absentEmployees,
          status: "ABSENT",
          bookingAddress: booking.booking_address,
        });

        await booking.update({ absent_alert_sent: true });
      }
    }

    console.log("✅ Attendance alerts processed.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
};

function haversineDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in kilometers
  const toRad = (x) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const notifyAdminIfClockoutFar = async () => {
  try {
    const THRESHOLD_KM = 0.5;
    const todayUTC = new Date().toISOString().split("T")[0];

    const bookings = await Booking.findAll({
      where: {
        booking_status: "SUCCESS",
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

    for (const booking of bookings) {
      const userLat = parseFloat(booking.booking_address?.address_lat);
      const userLng = parseFloat(booking.booking_address?.address_long);
      if (!userLat || !userLng) continue;

      for (const assignment of booking.booking_employee_details) {
        const employee = assignment.employee_profile;

        const attendance = await Attendance.findOne({
          where: {
            user_id: employee.id,
            clock_out: { [Op.ne]: null },
            clock_in: {
              [Op.between]: [
                new Date(`${todayUTC}T00:00:00.000Z`),
                new Date(`${todayUTC}T23:59:59.999Z`),
              ],
            },
          },
        });

        if (
          !attendance ||
          !attendance.clock_out_lat ||
          !attendance.clock_out_lng
        )
          continue;

        const clockOutLat = parseFloat(attendance.clock_out_lat);
        const clockOutLng = parseFloat(attendance.clock_out_lng);

        const distance = haversineDistanceInKm(
          clockOutLat,
          clockOutLng,
          userLat,
          userLng,
        );

        if (distance > THRESHOLD_KM) {
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

          console.log(
            `📩 Sent clock-out alert for ${employee.email} (~${distance.toFixed(
              2,
            )} km)`,
          );

          // ✅ Update alert flag per employee
          await assignment.update({ clock_out_alert_sent: true });
        }
      }
    }

    console.log("✅ Clock-out distance checks completed.");
  } catch (error) {
    console.error("❌ Error in notifyAdminIfClockoutFar:", error);
  }
};

const getDayOverview = async (reqBody, res) => {
  try {
    const { date } = reqBody;

    if (!date || !moment(date, "YYYY-MM-DD", true).isValid()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
    }

    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();

    const bookings = await Booking.findAll({
      where: {

        is_active: true,
        payment_status: "SUCCESS",
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

    for (const booking of bookings) {
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
              "clock_in",
              "clock_out",
              "clock_in_est",
              "clock_out_est",
            ],
          });

          let breaks = null;
          console.log(attendance?.id, "attendance?.id");
          if (attendance?.id) {
            const breakRecords = await Break.findAll({
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
            console.log(breakRecords, "breakRecords");

            if (breakRecords.length > 0) {
              breaks = breakRecords.map((b) => ({
                break_start_est: moment(b.break_start_est).format("HH:mm:ss"),
                break_end_est: b.break_end_est
                  ? moment(b.break_end_est).format("HH:mm:ss")
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
        }),
      );

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
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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

    console.log(booking, "booking");

    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found");
    }

    const date = moment.utc(
      typeof booking.date === "string"
        ? booking.date.split("T")[0]
        : booking.date,
    ).format("YYYY-MM-DD");
    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();

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
            ? moment(attendance.clock_in_est).format("HH:mm:ss")
            : null,
          clock_in_lat: attendance?.clock_in_lat || null,
          clock_in_lang: attendance?.clock_in_lng || null,
          clock_out: attendance?.clock_out_est
            ? moment(attendance.clock_out_est).format("HH:mm:ss")
            : null,
          clock_out_lat: attendance?.clock_out_lat || null,
          clock_out_lang: attendance?.clock_out_lng || null,
          total_hours: attendance?.total_hours || null,
          number_of_breaks: breaks.length,
          breaks: breaks.map((b) => ({
            break_start_est: moment(b.break_start_est).format("HH:mm:ss"),
            break_end_est: b.break_end_est
              ? moment(b.break_end_est).format("HH:mm:ss")
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
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteBooking = async (reqBody) => {
  const booking_id = reqBody.booking_id; // use booking_id from form
  const delete_mode = reqBody.delete_mode; // optional, may be undefined
  console.log(booking_id, delete_mode, reqBody, "reqBody");

  try {
    const booking = await Booking.findByPk(booking_id);
    console.log(booking, "booking");
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
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteFirebaseGroup = async (booking_id) => {
  const groupRef = getDatabase().ref(`GroupChats/booking_${booking_id}`);
  const snapshot = await groupRef.once("value");

  if (snapshot.exists()) {
    await groupRef.remove();
    console.log(`Firebase group for booking ${booking_id} deleted`);
  }
};

const getDayOverviewForGantt = async (reqBody) => {
  try {
    const { date } = reqBody;

    if (!date || !moment(date, "YYYY-MM-DD", true).isValid()) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
    }

    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();

    // 1️⃣ GET ALL EMPLOYEES (role_id 7, 8, 9)
    const allEmployees = await User.findAll({
      where: { role_id: { [Op.in]: [7, 8, 9] } },
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
        payment_status: "SUCCESS",
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
      const start = moment(booking.time, "HH:mm:ss");
      const end = booking.end_time_by_admin
        ? moment(booking.end_time_by_admin, "HH:mm:ss")
        : moment(booking.time, "HH:mm:ss").add(2, "hours");

      for (const emp of booking.booking_employee_details) {
        const empId = emp.employee_profile?.id;
        if (!empId) continue;

        employeeBookingMap[empId] = {
          booking_start: start.format("HH:mm"),
          booking_end: end.format("HH:mm"),
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
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getEmployeeDayOverview = async ({ date }) => {
  if (!date || !moment(date, "YYYY-MM-DD", true).isValid()) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid or missing date");
  }

  // EST day window (same as working API)
  const startOfDay = moment(date).startOf("day").toDate();
  const endOfDay = moment(date).endOf("day").toDate();

  // 1️⃣ Employees
  const employees = await User.findAll({
    where: { role_id: { [Op.in]: [7, 8, 9] } },
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
      payment_status: "SUCCESS",
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

  // 3️⃣ Build response PER EMPLOYEE (same pattern as working API)
  const rows = await Promise.all(
    employees.map(async (emp) => {
      // find booking where this employee is assigned
      const booking = bookings.find((b) =>
        b.booking_employee_details.some((a) => a.employee_id === emp.id),
      );

      // find attendance EXACTLY like getBookingOverviewById
      const attendance = await Attendance.findOne({
        where: {
          user_id: emp.id,
          clock_in_est: {
            [Op.gte]: startOfDay,
            [Op.lt]: endOfDay,
          },
        },
        attributes: ["id", "clock_in_est", "clock_out_est", "total_hours"],
      });

      const payroll = attendance
        ? await AttendancePayroll.findOne({
            where: { attendance_id: attendance.id },
          })
        : null;

      return {
        employee_id: emp.id,
        role_id: emp.role_id,
        employee_type: emp.employee_type,
        attendance_id: attendance?.id || null,
        name: emp.user_profile?.name || "N/A",

        booking_id: booking?.id || null,

        clock_in: attendance?.clock_in_est
          ? moment(attendance.clock_in_est).format("HH:mm:ss")
          : null,

        clock_out: attendance?.clock_out_est
          ? moment(attendance.clock_out_est).format("HH:mm:ss")
          : null,

        total_hours: attendance?.total_hours || null,

        pay_per_day: payroll?.pay_per_day || null,
        bonus: payroll?.bonus || null,
        total_amount: payroll?.total_amount || null,

        is_manual: payroll?.is_manual || false,
      };
    }),
  );

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
    !moment(start_date, "YYYY-MM-DD", true).isValid() ||
    !moment(end_date, "YYYY-MM-DD", true).isValid()
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid date range");
  }

  const startDate = moment(start_date).startOf("day").toDate();
  const endDate = moment(end_date).endOf("day").toDate();

  // ✅ 2. Employees
  const employeeWhere = {
    role_id: { [Op.in]: [7, 8, 9] },
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
      payment_status: "SUCCESS",
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
    const dateKey = moment.utc(
      typeof b.date === "string" ? b.date.split("T")[0] : b.date,
    ).format("YYYY-MM-DD");

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
    const dateKey = moment(att.clock_in_est).format("YYYY-MM-DD");
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

  let current = moment(startDate);

  while (current.isSameOrBefore(endDate, "day")) {
    const dateKey = current.format("YYYY-MM-DD");

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
          ? moment(attendance.clock_in_est).format("HH:mm:ss")
          : null,

        clock_out: attendance?.clock_out_est
          ? moment(attendance.clock_out_est).format("HH:mm:ss")
          : null,

        total_hours: attendance?.total_hours || null,

        pay_per_day: payroll?.pay_per_day || null,
        bonus: payroll?.bonus || null,
        total_amount: payroll?.total_amount || null,

        is_manual: payroll?.is_manual || false,
      });
    }

    current.add(1, "day");
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
      estDateTime
        ? moment.tz(estDateTime, "America/New_York").utc().toDate()
        : null;

    const toESTString = (utcDate) =>
      utcDate
        ? moment(utcDate).tz("America/New_York").format("YYYY-MM-DD HH:mm:ss")
        : null;

    const clockInEST = clock_in ? `${date} ${clock_in}` : null;
    const clockOutEST = clock_out ? `${date} ${clock_out}` : null;

    let clockInUTC = toUTC(clockInEST);
    let clockOutUTC = toUTC(clockOutEST);

    /* ----------- HANDLE OVERNIGHT SHIFT ----------- */
    if (clockInUTC && clockOutUTC && clockOutUTC < clockInUTC) {
      clockOutUTC = moment(clockOutUTC).add(1, "day").toDate();
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
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getESTRange = (days = 14) => {
  const nowEST = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
  );

  const start = new Date(nowEST);
  start.setHours(0, 0, 0, 0);

  const end = new Date(nowEST);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const formatDateEST = (date) => {
  // Pure calendar date – never use native Date local methods
  const m = moment.utc(
    typeof date === "string" ? date.split("T")[0] : date,
    "YYYY-MM-DD",
  );
  return m.format("MM/DD/YYYY");
};

const formatTime12h = (timeStr) => {
  // "16:00:41" → "04:00 PM"
  const [h, m] = timeStr.split(":");
  let hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";

  hour = hour % 12 || 12;

  return `${String(hour).padStart(2, "0")}:${m} ${ampm}`;
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
        booking_status: "ACCEPTED",
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
        date: formatDateEST(b.date), // ✅ FIXED
        time: formatTime12h(b.time), // ✅ AM/PM
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
