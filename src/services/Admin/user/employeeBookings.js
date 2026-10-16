// Admin user service: bookings by client or employee, the closest employees to a job, and who is working, late or absent

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const {
  attendanceStatusTypes,
  bookingListFilterTypes,
  bookingTypes,
  paymentStatusTypes,
} = require("../../../config/types");
const { Sequelize, Op } = require("sequelize");
const {
  dayjs,
  dateInTz,
  addDays,
  nowWallClock,
  DATETIME_FORMAT,
  formatDisplayDate,
} = require("../../../utils/time");
const {
  User,
  Profile,
  UserAttachment,
  Service,
  Booking,
  ServiceAttachment,
  BookingAssignment,
  UserAddress,
  Country,
  State,
  City,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { distanceInMiles } = require("../../../utils/geo");
const { attendanceStatus } = require("../../../utils/attendanceStatus");
const { EMPLOYEE_ROLE_IDS } = require("../../../config/roles");
const {
  firstAttendanceByUser,
  firstAddressByUser,
  profileNamesByUserId,
} = require("../../Common/batchLookup");

const getBookingsByUserId = async (reqBody) => {
  try {
    const { booking_status, id } = reqBody;

    let whereCondition = {};

    if (booking_status === bookingListFilterTypes.UPCOMING) {
      whereCondition = {
        booking_status: [bookingTypes.PENDING, bookingTypes.ACCEPTED, bookingTypes.ONGOING],
        is_active: true,
        user_id: id,
      };
    } else if (booking_status === bookingTypes.ONGOING) {
      whereCondition = {
        booking_status: [bookingTypes.ONGOING],
        is_active: 1,
        user_id: id,
      };
    } else if (booking_status === bookingListFilterTypes.COMPLETED) {
      whereCondition = {
        booking_status: [bookingTypes.SUCCESS, bookingTypes.REJECTED],
        is_active: 1,
        user_id: id,
      };
    } else if (booking_status === "all") {
      whereCondition = {
        is_active: true,
        user_id: id,
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
          model: UserAddress,
          as: "booking_address",
        },
      ],
      order: [["date", "ASC"]],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      return [];
    }

    return bookingDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getBookingByEmployeeId = async (reqBody) => {
  try {
    const { booking_status, id } = reqBody;
    let whereCondition = { is_active: true, employee_id: id };

    // ✅ Apply booking status filtering properly
    if (booking_status === bookingListFilterTypes.UPCOMING) {
      whereCondition["$employee_details_booking.booking_status$"] = [
        bookingTypes.PENDING,
        bookingTypes.ACCEPTED,
        bookingTypes.ONGOING,
      ];
    } else if (booking_status === bookingTypes.ONGOING) {
      whereCondition["$employee_details_booking.booking_status$"] = [bookingTypes.ONGOING];
    } else if (booking_status === bookingListFilterTypes.COMPLETED) {
      whereCondition["$employee_details_booking.booking_status$"] = [
        bookingTypes.SUCCESS,
        bookingTypes.REJECTED,
      ];
    } else if (booking_status !== "all" && booking_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    // ✅ Fetch Booking Data using proper Joins
    const bookingDoc = await BookingAssignment.findAll({
      where: whereCondition,
      include: [
        {
          model: Booking,
          as: "employee_details_booking",
          required: true, // Ensures only matched records are fetched
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
              model: User,
              as: "booking_user",
              attributes: ["id", "email"],
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
                  ],
                  order: [["id", "desc"]],
                  limit: 1,
                },
              ],
            },
          ],
        },
      ],
      order: [["employee_details_booking", "date", "ASC"]],
    });

    // ✅ Remove team leader from response
    const bookingDetailsWithoutTeamLeader = bookingDoc.map((booking) => {
      const { is_team_leader, ...plainBooking } = booking.get({ plain: true });
      return plainBooking;
    });

    // ✅ Return results or empty array if no data found
    if (!bookingDetailsWithoutTeamLeader.length) return [];

    return bookingDetailsWithoutTeamLeader;
  } catch (error) {
    logger.error("Error:", error);
    throw ApiError.from(error);
  }
};

// 	try {

// 		// Send email notifications and delete users
// 		await Promise.all(
// 			users.map(async (user) => {

// 			})
// 		);
// 	} catch (error) {


const getClosestEmployees = async (clientId) => {
  try {
    // Find Client

    const client = await User.findByPk(clientId, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
    }

    // Client's first address
    const clientAddress = await UserAddress.findOne({
      where: {
        user_id: clientId,
      },
      order: [["created_at", "ASC"]],
    });

    if (
      !clientAddress ||
      !clientAddress.address_lat ||
      !clientAddress.address_long
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Client address not found.");
    }

    // Fetch all active employees
    const employees = await User.findAll({
      where: {
        role_id: {
          [Op.in]: EMPLOYEE_ROLE_IDS,
        },
        is_active: true,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    const result = [];

    const addresses = await firstAddressByUser(employees.map((employee) => employee.id));
    for (const employee of employees) {
      const employeeAddress = addresses.get(employee.id);

      if (
        !employeeAddress ||
        !employeeAddress.address_lat ||
        !employeeAddress.address_long
      ) {
        continue;
      }

      const distance = distanceInMiles(
        Number(clientAddress.address_lat),
        Number(clientAddress.address_long),
        Number(employeeAddress.address_lat),
        Number(employeeAddress.address_long),
      );

      result.push({
        id: employee.id,
        name: employee.user_profile?.name,
        role_id: employee.role_id,
        employee_type: employee.employee_type,

        address: employeeAddress.address,
        address_lat: Number(employeeAddress.address_lat),
        address_long: Number(employeeAddress.address_long),

        distance,
      });
    }

    result.sort((a, b) => a.distance - b.distance);

    return {
      client: {
        id: client.id,
        name: client.user_profile?.name || null,
        address: clientAddress.address,
        address_lat: Number(clientAddress.address_lat),
        address_long: Number(clientAddress.address_long),
      },
      employees: result.slice(0, 7),
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getClosestEmployeesByAddress = async (addressId) => {
  try {
    // Find client address
    const clientAddress = await UserAddress.findByPk(addressId);

    if (!clientAddress) {
      throw new ApiError(httpStatus.NOT_FOUND, "Address not found.");
    }

    if (!clientAddress.address_lat || !clientAddress.address_long) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Address coordinates not found.",
      );
    }

    // Find client
    const client = await User.findByPk(clientAddress.user_id, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
    }

    // Get all active employees
    const employees = await User.findAll({
      where: {
        role_id: {
          [Op.in]: EMPLOYEE_ROLE_IDS,
        },
        is_active: true,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    const result = [];

    const addresses = await firstAddressByUser(employees.map((employee) => employee.id));
    for (const employee of employees) {
      const employeeAddress = addresses.get(employee.id);

      if (
        !employeeAddress ||
        !employeeAddress.address_lat ||
        !employeeAddress.address_long
      ) {
        continue;
      }

      const distance = distanceInMiles(
        Number(clientAddress.address_lat),
        Number(clientAddress.address_long),
        Number(employeeAddress.address_lat),
        Number(employeeAddress.address_long),
      );

      result.push({
        id: employee.id,
        name: employee.user_profile?.name,
        role_id: employee.role_id,
        employee_type: employee.employee_type,

        address: employeeAddress.address,
        address_lat: Number(employeeAddress.address_lat),
        address_long: Number(employeeAddress.address_long),

        distance,
      });
    }

    result.sort((a, b) => a.distance - b.distance);

    return {
      client: {
        id: client.id,
        name: client.user_profile?.name || null,
      },
      selected_address: {
        id: clientAddress.id,
        address: clientAddress.address,
        address_lat: Number(clientAddress.address_lat),
        address_long: Number(clientAddress.address_long),
      },
      employees: result.slice(0, 7),
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getLiveWorkingEmployees = async (reqBody) => {
  try {
    const { date } = reqBody;

    if (!date) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Date is required");
    }

    // ✅ Convert to EST (IMPORTANT)
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);

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

    const liveMap = new Map(); // 🔥 prevents duplicates

    // The day's open attendance (clocked in, not out) of every assigned employee, in one query
    const employeeIds = [
      ...new Set(bookings.flatMap((b) => (b.booking_employee_details || []).map((e) => e.employee_profile?.id).filter(Boolean))),
    ];
    const openAttendance = await firstAttendanceByUser(employeeIds, {
      clock_in_est: { [Op.gte]: startOfDay, [Op.lt]: endOfDay },
      clock_out_est: null,
    });

    for (const booking of bookings) {
      for (const emp of booking.booking_employee_details || []) {
        const empId = emp.employee_profile?.id;

        if (!empId) continue;

        const attendance = openAttendance.get(empId);

        if (attendance) {
          // ✅ avoid duplicate employee
          if (!liveMap.has(empId)) {
            liveMap.set(empId, {
              employee_id: empId,
              employee_name: emp.employee_profile.user_profile?.name || "N/A",
              booking_name: booking.booking_name,
              booking_id: booking.id,
              clock_in: dayjs.utc(attendance.clock_in_est).format(
                DATETIME_FORMAT,
              ),
              clock_in_lat: attendance.clock_in_lat,
              clock_in_lng: attendance.clock_in_lng,
              clock_out_lat: attendance.clock_out_lat,
              clock_out_lng: attendance.clock_out_lng,
            });
          }
        }
      }
    }

    const liveEmployees = Array.from(liveMap.values());

    return {
      total: liveEmployees.length,
      data: liveEmployees,
    };
  } catch (error) {
    logger.error("Error in getLiveWorkingEmployees:", error);
    throw ApiError.orInternal(error);
  }
};

const getLateAbsentEmployees = async (reqBody) => {
  try {
    // Attendance *_est columns hold New York wall time, so compare in that convention
    const todayEST = dateInTz();
    const nowEST = nowWallClock();
    const startOfDay = new Date(`${todayEST}T00:00:00Z`);
    const endOfDay = new Date(`${todayEST}T23:59:59Z`);

    const bookings = await Booking.findAll({
      where: {
        booking_status: bookingTypes.ACCEPTED,
        is_active: true,
        [Op.and]: Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("date")),
          todayEST,
        ),
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          attributes: ["employee_id"],
        },
      ],
    });

    // Today's first clock-in of every assigned employee, in one query
    const employeeIds = [...new Set(bookings.flatMap((b) => (b.booking_employee_details || []).map((a) => a.employee_id)))];
    const clockIns = await firstAttendanceByUser(employeeIds, { clock_in_est: { [Op.between]: [startOfDay, endOfDay] } });

    const flagged = [];
    for (const booking of bookings) {
      const bookingStart = new Date(`${todayEST}T${booking.time}Z`);

      for (const assignment of booking.booking_employee_details || []) {
        const employeeId = assignment.employee_id;
        const attendance = clockIns.get(employeeId);
        const clockIn = attendance ? new Date(attendance.clock_in_est) : null;
        // minutes after the booking start: to the clock-in, or to now when there is none
        const delayMinutes = Math.max(Math.floor(((clockIn || nowEST) - bookingStart) / 60000), 0);
        const status = attendanceStatus({ bookingStart, clockIn, now: nowEST });

        if (status === attendanceStatusTypes.LATE || status === attendanceStatusTypes.ABSENT) {
          flagged.push({ employeeId, booking, clockIn, delayMinutes, status });
        }
      }
    }

    // Their names, in one query
    const names = await profileNamesByUserId(flagged.map((f) => f.employeeId));
    const result = flagged.map(({ employeeId, booking, clockIn, delayMinutes, status }) => ({
      employee_id: employeeId,
      employee_name: names.get(employeeId),
      booking_name: booking.booking_name,
      booking_id: booking.id,

      booking_time: booking.time,
      clock_in_time: clockIn ? clockIn.toISOString() : null,

      delay_minutes: delayMinutes,
      status,
    }));

    return {
      total: result.length,
      data: result,
    };
  } catch (error) {
    logger.error("Error:", error);
    throw ApiError.orInternal(error);
  }
};

const getUpcomingScheduledBookings = async () => {
  try {
    const startDate = dateInTz();

    const endDate = addDays(startDate, 7);

    /* ✅ FETCH UPCOMING BOOKINGS */

    const bookings = await Booking.findAll({
      where: {
        is_active: true,

        payment_status: paymentStatusTypes.SUCCESS,

        booking_status: bookingTypes.ACCEPTED,

        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("date")), {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          }),
        ],
      },

      include: [
        /* ✅ CLIENT */

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

        /* ✅ EMPLOYEES */

        {
          model: BookingAssignment,
          as: "booking_employee_details",

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

        /* ✅ CLIENT ADDRESS */

        {
          model: UserAddress,
          as: "booking_address",

          include: [
            {
              model: Country,
              as: "user_country",

              attributes: ["name"],
            },

            {
              model: State,
              as: "user_state",

              attributes: ["name"],
            },

            {
              model: City,
              as: "user_city",

              attributes: ["name"],
            },
          ],
        },
      ],

      order: [
        ["date", "ASC"],
        ["time", "ASC"],
      ],
    });

    /* ✅ FORMAT RESPONSE */

    const formattedBookings = bookings.map((booking) => {
      const addressData =
        booking.booking_address || booking.booking_non_client_address;

      /* ✅ CITY / STATE / COUNTRY */

      const city =
        addressData?.user_city?.name || addressData?.non_client_user_city?.name;

      const state =
        addressData?.user_state?.name ||
        addressData?.non_client_user_state?.name;

      const country =
        addressData?.user_country?.name ||
        addressData?.non_client_user_country?.name;

      /* ✅ ZIP CODE FALLBACKS */

      const zipCode =
        addressData?.address ||
        addressData?.zip_code ||
        addressData?.zipcode ||
        addressData?.postal_code ||
        addressData?.zip ||
        addressData?.pincode;

      /* ✅ FULL ADDRESS */

      const fullAddress = addressData
        ? [zipCode, city, state, country].filter(Boolean).join(", ")
        : "N/A";

      return {
        booking_id: booking.id,

        booking_name: booking.booking_name,

        client_name: booking.booking_user?.user_profile?.name || "N/A",

        /* ✅ DATEONLY SAFE */

        date: booking.date ? formatDisplayDate(booking.date) : null,

        time: booking.time,

        employees_assigned: booking.booking_employee_details?.length || 0,

        employees:
          booking.booking_employee_details?.map(
            (emp) => emp.employee_profile?.user_profile?.name,
          ) || [],

        address: fullAddress,
      };
    });

    return {
      total: formattedBookings.length,

      data: formattedBookings,
    };
  } catch (error) {
    logger.error("Error in getUpcomingScheduledBookings:", error);

    throw ApiError.orInternal(error);
  }
};

module.exports = {
  getBookingsByUserId,
  getBookingByEmployeeId,
  getClosestEmployees,
  getLiveWorkingEmployees,
  getLateAbsentEmployees,
  getUpcomingScheduledBookings,
  getClosestEmployeesByAddress,
};
