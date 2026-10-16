// Admin booking service: day, booking and employee overviews, the Gantt view and timesheet edits

const { status: httpStatus } = require("http-status");
const { paymentStatusTypes } = require("../../../config/types");
const {
  dayjs,
  inZone,
  BUSINESS_TZ,
  toCalendarDate,
  addDays,
  DATETIME_FORMAT,
  DATE_FORMAT,
  SHORT_TIME_FORMAT,
  TIME_FORMAT,
  isValidDate,
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
  Attendance,
  GuestBookingAddress,
  Break,
  AttendancePayroll,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { BOOKING } = require("../../../config/rules");
const { EMPLOYEE_ROLE_IDS } = require("../../../config/roles");
const { Sequelize, Op } = require("sequelize");
const {
  firstAttendanceByUser,
  breaksByAttendance,
  payrollByAttendance,
} = require("../../Common/batchLookup");

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

module.exports = {
  getDayOverview,
  getBookingOverviewById,
  getDayOverviewForGantt,
  getEmployeeDayOverview,
  getEmployeeRangeOverview,
  updateEmployeeTimesheet,
};
