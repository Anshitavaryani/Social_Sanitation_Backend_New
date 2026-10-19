// Admin user service: dashboard counts, transactions and invoice summaries

const logger = require("../../../config/logger");
const { bookingTypes, invoicePaymentStatusTypes, paymentStatusTypes } = require("../../../config/types");
const { Sequelize, Op } = require("sequelize");
const {
  Admin,
  User,
  Profile,
  Service,
  Booking,
  Payment,
  QuoteItem,
  ServiceQuote,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { ROLE } = require("../../../config/roles");

// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

const getUserCount = async () => {
  const userCount = await User.count({
    where: {
      is_active: true,
      role_id: ROLE.CLIENT,
    },
  });
  return userCount;
};

const getDriverCount = async () => {
  const supervisorCount = await User.count({
    where: { is_active: true, role_id: ROLE.SUPERVISOR },
  });

  const qualityAssuranceCount = await User.count({
    where: { is_active: true, role_id: ROLE.QUALITY_INSPECTOR },
  });

  const janitorCount = await User.count({
    where: { is_active: true, role_id: ROLE.CLEANER, sub_role_id: ROLE.JANITOR },
  });

  const housekeepingCount = await User.count({
    where: { is_active: true, role_id: ROLE.CLEANER, sub_role_id: ROLE.HOUSEKEEPING },
  });

  return {
    supervisor: supervisorCount,
    quality_assurance: qualityAssuranceCount,
    janitor: janitorCount,
    housekeeping: housekeepingCount,
    total:
      supervisorCount +
      qualityAssuranceCount +
      janitorCount +
      housekeepingCount,
  };
};

const getAdminCount = async () => {
  const superAdminCount = await Admin.count({
    where: { is_active: true, role_id: ROLE.SUPER_ADMIN },
  });

  const salesExecutiveCount = await Admin.count({
    where: { is_active: true, role_id: ROLE.OPERATIONS_ADMIN },
  });

  const bdmCount = await Admin.count({
    where: { is_active: true, role_id: ROLE.BDM },
  });

  return {
    super_admin: superAdminCount,
    sales_executive: salesExecutiveCount,
    bdm: bdmCount,
    total: superAdminCount + salesExecutiveCount + bdmCount,
  };
};

const getServiceCount = async () => {
  const serviceCount = await Service.count({
    where: {
      is_active: true,
    },
  });
  return serviceCount;
};

const getBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
    },
  });
  return bookingCount;
};

const getPendingBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: [bookingTypes.PENDING, bookingTypes.ACCEPTED, bookingTypes.ONGOING],
    },
  });
  return bookingCount;
};

const getCompletedBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: [bookingTypes.SUCCESS],
    },
  });
  return bookingCount;
};

const getDeletedBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: [bookingTypes.REJECTED],
    },
  });
  return bookingCount;
};

const getMostBookedService = async () => {
  try {
    const mostBookedService = await Booking.findAll({
      attributes: [
        "service_id",
        [Sequelize.fn("COUNT", Sequelize.col("service_id")), "booking_count"],
      ],
      where: {
        is_active: true,
      },
      group: ["service_id"],
      order: [[Sequelize.literal("booking_count"), "DESC"]],
      include: [
        {
          model: Service,
          as: "service_booking",
          attributes: ["id", "name"],
        },
      ],
      raw: true,
    });

    // Map the result to change attribute names
    const mappedResult = mostBookedService.map((entry) => ({
      service_id: entry.service_id,
      booking_count: entry.booking_count,
      service_name: entry["service_booking.name"],
      slug: entry["service_booking.slug"],
    }));

    return mappedResult;
  } catch (error) {
    logger.error("Error while fetching most booked service:", error);
    throw error;
  }
};

const getAllTransactions = async () => {
  try {
    const userDocs = await Payment.findAll({
      where: { payment_status: paymentStatusTypes.SUCCESS, is_active: true },
      include: [
        {
          model: User,
          as: "payment_user",
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
          model: Booking,
          as: "payment_booking",
          required: false,
        },
      ],
    });

    return userDocs;
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getAllInvoices = async ({ month } = {}) => {
  try {
    const where = {};

    if (month) {
      // month format: YYYY-MM
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      where.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }

    const invoices = await ServiceQuote.findAll({
      where,
      order: [["created_at", "DESC"]],
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
        {
          model: User,
          as: "payment_user",
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
    });

    return invoices;
  } catch (error) {
    logger.error("FULL ERROR:", error);
    throw error;
  }
};

const getMonthlyInvoicesSummary = async ({ month }) => {
  try {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    /* ✅ STEP 1: GET PAID QUOTES FOR THE MONTH, WITH ITEMS */
    const invoices = await ServiceQuote.findAll({
      where: {
        is_active: true,
        payment_status: {
          [Op.in]: [invoicePaymentStatusTypes.PAID, invoicePaymentStatusTypes.CASH_PAID, invoicePaymentStatusTypes.CHECK_PAID, invoicePaymentStatusTypes.ACH_PAID],
        },
        created_at: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
        },
      ],
    });

    /* If nobody paid this month, skip the user lookup entirely */
    if (invoices.length === 0) {
      return [];
    }

    /* ✅ STEP 2: MAP INVOICES BY USER */
    const invoiceMap = {};

    invoices.forEach((inv) => {
      if (!invoiceMap[inv.user_id]) {
        invoiceMap[inv.user_id] = [];
      }
      invoiceMap[inv.user_id].push(inv);
    });

    const paidUserIds = Object.keys(invoiceMap);

    /* ✅ STEP 3: GET ONLY USERS WHO HAVE A PAID INVOICE */
    const users = await User.findAll({
      attributes: ["id", "email"],
      where: {
        role_id: ROLE.CLIENT,
        is_active: true,
        id: paidUserIds,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    /* ✅ STEP 4: MERGE USERS + THEIR PAID INVOICES */
    const result = users.map((user) => {
      const userInvoices = invoiceMap[user.id] || [];

      return {
        user_id: user.id,
        name: user.user_profile?.name || "Unknown",
        email: user.email,
        invoices: userInvoices,
      };
    });

    return result;
  } catch (err) {
    logger.error("getMonthlyInvoicesSummary failed:", err);
    throw err;
  }
};

module.exports = {
  getUserCount,
  getDriverCount,
  getAdminCount,
  getServiceCount,
  getBookingCount,
  getPendingBookingCount,
  getCompletedBookingCount,
  getDeletedBookingCount,
  getMostBookedService,
  getAllTransactions,
  getAllInvoices,
  getMonthlyInvoicesSummary,
};
