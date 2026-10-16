// Admin booking service: emailing an employee their two-week schedule

const { bookingTypes } = require("../../../config/types");
const {
  dateInTz,
  calendarDateUtc,
  addDays,
  formatDisplayDate,
  formatTime12h,
} = require("../../../utils/time");
const {
  Booking,
  Profile,
  User,
  UserAddress,
  BookingAssignment,
  Country,
  State,
  City,
} = require("../../../models");
const { Op } = require("sequelize");
const { sendTwoWeekScheduleEmail } = require("../../Common/email.service");

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

module.exports = { sendEmployeeTwoWeekSchedule };
