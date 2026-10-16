// Admin booking service: creating the bookings of a recurring series, for users and for guests

const logger = require("../../../config/logger");
const { bookingTypes, paymentStatusTypes } = require("../../../config/types");
const {
  dayjs,
  calendarDateUtc,
  toCalendarDate,
  bookingUtcParts,
  DATE_FORMAT,
} = require("../../../utils/time");
const { Booking, GuestBookingAddress } = require("../../../models");
const { generateBookingId } = require("../../Common/bookings.service");

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

module.exports = { createRecurringBookings, createRecurringGuestBookings };
