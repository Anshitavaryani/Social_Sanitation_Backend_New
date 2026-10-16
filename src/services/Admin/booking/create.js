// Admin booking service: admins booking for users and guests, and checking a booking request

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { bookingTypes, paymentStatusTypes } = require("../../../config/types");
const { calendarDateUtc, toCalendarDate, bookingUtcParts } = require("../../../utils/time");
const { randomUUID: uuidv4 } = require("crypto");
const {
  Booking,
  Service,
  Profile,
  User,
  UserAddress,
  BDMUser,
  GuestBookingAddress,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { sendEmailToAdmin } = require("../../Common/email.service");
const { generateBookingId } = require("../../Common/bookings.service");
const { createRecurringBookings, createRecurringGuestBookings } = require("./recurrence");

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

module.exports = { checkBookingRequest, adminCreateBooking, adminCreateBookingForGuest };
