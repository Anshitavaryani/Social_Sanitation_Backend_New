// Admin booking service: the scheduled absent and clock-out distance alerts

const logger = require("../../../config/logger");
const { attendanceStatusTypes, bookingTypes } = require("../../../config/types");
const { dateInTz, nowWallClock, utcDate } = require("../../../utils/time");
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
const { ATTENDANCE } = require("../../../config/rules");
const { distanceInKm } = require("../../../utils/geo");
const { attendanceStatus } = require("../../../utils/attendanceStatus");
const { Sequelize, Op } = require("sequelize");
const { sendClockOutDistanceEmail, sendGroupedAttendanceEmail } = require("../../Common/email.service");
const { firstAttendanceByUser, profileNamesByUserId } = require("../../Common/batchLookup");

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

module.exports = { sendAttendanceAlerts, notifyAdminIfClockoutFar };
