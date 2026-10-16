// Invoice service: monthly summaries, business analytics and upcoming invoices

const logger = require("../../../config/logger");
const { Op } = require("sequelize");
const { dayjs, dateInTz, toCalendarDate, DATE_FORMAT } = require("../../../utils/time");
const { ServiceQuote, Invoice, InvoiceItem, User, Profile, InvoiceRecurring } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { ROLE } = require("../../../config/roles");
const { invoicePaymentStatusTypes } = require("../../../config/types");

const getMonthlyAllInvoicesSummary = async ({ month }) => {
  try {
    const startDate = `${month}-01`;
    const endDate = dayjs(startDate).add(1, "month").format(DATE_FORMAT);

    const invoices = await Invoice.findAll({
      where: {
        is_active: true,
        billing_date: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      include: [
        {
          model: User,
          as: "invoices_user",
          attributes: ["id", "email"],
          where: {
            role_id: ROLE.CLIENT,
            is_active: true,
          },
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [
        ["billing_date", "ASC"],
        ["user_id", "ASC"],
      ],
    });

    const userMap = {};
    const billingDates = new Set();

    invoices.forEach((invoice) => {
      const user = invoice.invoices_user;

      if (!user) return;

      if (!userMap[user.id]) {
        userMap[user.id] = {
          user_id: user.id,
          name: user.user_profile?.name || "Unknown",
          email: user.email,
          invoices: [],
        };
      }

      userMap[user.id].invoices.push(invoice);

      billingDates.add(dayjs(invoice.billing_date).format(DATE_FORMAT));
    });

    return {
      billing_dates: [...billingDates].sort(),
      employees: Object.values(userMap),
    };
  } catch (err) {
    logger.error("getMonthlyAllInvoicesSummary failed:", err);
    throw err;
  }
};

const getBusinessAnalytics = async ({ month }) => {
  try {
    /* ===================================================== */
    /* DATE RANGE */
    /* ===================================================== */

    const startDate = new Date(`${month}-01`);

    const endDate = new Date(startDate);

    endDate.setMonth(endDate.getMonth() + 1);

    /* ===================================================== */
    /* FETCH INVOICES */
    /* ===================================================== */

    const invoices = await Invoice.findAll({
      where: {
        is_active: true,

        billing_date: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },

      include: [
        {
          model: User,
          as: "invoices_user",

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

      order: [["billing_date", "DESC"]],
    });

    /* ===================================================== */
    /* FETCH SERVICE QUOTES */
    /* ===================================================== */

    const quotes = await ServiceQuote.findAll({
      where: {
        is_active: true,

        created_at: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },

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
      ],

      order: [["created_at", "DESC"]],
    });

    /* ===================================================== */
    /* OVERVIEW VARIABLES */
    /* ===================================================== */

    let totalRevenue = 0;

    let invoiceRevenue = 0;

    let quoteRevenue = 0;

    let paidRevenue = 0;

    let unpaidRevenue = 0;

    let overdueRevenue = 0;

    let cashRevenue = 0;

    let checkRevenue = 0;

    let onlineRevenue = 0;

    let totalInvoices = invoices.length;

    let totalQuotes = quotes.length;

    let paidInvoices = 0;

    let unpaidInvoices = 0;

    let overdueInvoices = 0;

    let paidQuotes = 0;

    let unpaidQuotes = 0;

    /* ===================================================== */
    /* DAILY BREAKDOWN */
    /* ===================================================== */

    const dailyMap = {};

    /* ===================================================== */
    /* EMPLOYEE MAP */
    /* ===================================================== */

    const employeeMap = {};

    /* ===================================================== */
    /* PROCESS INVOICES */
    /* ===================================================== */

    invoices.forEach((inv) => {
      const amount = Number(inv.total_due || 0);

      const status = inv.payment_status;

      const billingDate = dayjs(inv.billing_date).format(DATE_FORMAT);

      const employeeName = inv.invoices_user?.user_profile?.name || "Unknown";

      const employeeId = inv.user_id;

      /* ================= TOTAL ================= */

      totalRevenue += amount;

      invoiceRevenue += amount;

      /* ================= DAILY ================= */

      if (!dailyMap[billingDate]) {
        dailyMap[billingDate] = {
          date: billingDate,

          revenue: 0,

          paid: 0,

          unpaid: 0,
        };
      }

      dailyMap[billingDate].revenue += amount;

      /* ================= EMPLOYEE ================= */

      if (!employeeMap[employeeId]) {
        employeeMap[employeeId] = {
          user_id: employeeId,

          name: employeeName,

          invoice_count: 0,

          total_amount: 0,

          paid_amount: 0,

          unpaid_amount: 0,
        };
      }

      employeeMap[employeeId].invoice_count += 1;

      employeeMap[employeeId].total_amount += amount;

      /* ===================================================== */
      /* PAYMENT STATUS */
      /* ===================================================== */

      const isPaid =
        status === invoicePaymentStatusTypes.PAID || status === invoicePaymentStatusTypes.CHECK_PAID || status === invoicePaymentStatusTypes.CASH_PAID;

      const isOverdue =
        !isPaid &&
        inv.due_date &&
        toCalendarDate(inv.due_date) < dateInTz();

      /* ================= PAID ================= */

      if (isPaid) {
        paidRevenue += amount;

        paidInvoices += 1;

        dailyMap[billingDate].paid += amount;

        employeeMap[employeeId].paid_amount += amount;

        /* ---------- PAYMENT METHOD ---------- */

        if (status === invoicePaymentStatusTypes.CHECK_PAID) {
          checkRevenue += amount;
        } else if (status === invoicePaymentStatusTypes.CASH_PAID) {
          cashRevenue += amount;
        } else {
          onlineRevenue += amount;
        }
      } else {
        /* ================= UNPAID ================= */
        unpaidRevenue += amount;

        unpaidInvoices += 1;

        dailyMap[billingDate].unpaid += amount;

        employeeMap[employeeId].unpaid_amount += amount;
      }

      /* ================= OVERDUE ================= */

      if (isOverdue) {
        overdueRevenue += amount;

        overdueInvoices += 1;
      }
    });

    /* ===================================================== */
    /* PROCESS QUOTES */
    /* ===================================================== */

    quotes.forEach((quote) => {
      const amount = Number(quote.total_due || 0);

      const status = quote.payment_status;

      const billingDate = dateInTz(quote.created_at);

      const employeeName = quote.payment_user?.user_profile?.name || "Unknown";

      const employeeId = quote.user_id;

      /* ================= TOTAL ================= */

      totalRevenue += amount;

      quoteRevenue += amount;

      /* ================= DAILY ================= */

      if (!dailyMap[billingDate]) {
        dailyMap[billingDate] = {
          date: billingDate,

          revenue: 0,

          paid: 0,

          unpaid: 0,
        };
      }

      dailyMap[billingDate].revenue += amount;

      /* ================= EMPLOYEE ================= */

      if (!employeeMap[employeeId]) {
        employeeMap[employeeId] = {
          user_id: employeeId,

          name: employeeName,

          invoice_count: 0,

          total_amount: 0,

          paid_amount: 0,

          unpaid_amount: 0,
        };
      }

      employeeMap[employeeId].invoice_count += 1;

      employeeMap[employeeId].total_amount += amount;

      /* ================= PAYMENT ================= */

      const isPaid =
        status === invoicePaymentStatusTypes.PAID || status === invoicePaymentStatusTypes.CHECK_PAID || status === invoicePaymentStatusTypes.CASH_PAID;

      if (isPaid) {
        paidRevenue += amount;

        paidQuotes += 1;

        dailyMap[billingDate].paid += amount;

        employeeMap[employeeId].paid_amount += amount;

        if (status === invoicePaymentStatusTypes.CHECK_PAID) {
          checkRevenue += amount;
        } else if (status === invoicePaymentStatusTypes.CASH_PAID) {
          cashRevenue += amount;
        } else {
          onlineRevenue += amount;
        }
      } else {
        unpaidRevenue += amount;

        unpaidQuotes += 1;

        dailyMap[billingDate].unpaid += amount;

        employeeMap[employeeId].unpaid_amount += amount;
      }
    });

    /* ===================================================== */
    /* TOP CLIENTS */
    /* ===================================================== */

    const topClientsMap = {};

    [
      ...invoices.map((inv) => ({
        user_id: inv.user_id,

        amount: Number(inv.total_due || 0),

        name: inv.invoices_user?.user_profile?.name || "Unknown",
      })),

      ...quotes.map((quote) => ({
        user_id: quote.user_id,

        amount: Number(quote.total_due || 0),

        name: quote.payment_user?.user_profile?.name || "Unknown",
      })),
    ].forEach((item) => {
      const clientId = item.user_id;

      const clientName = item.name;

      const amount = item.amount;

      if (!topClientsMap[clientId]) {
        topClientsMap[clientId] = {
          user_id: clientId,

          name: clientName,

          total_spent: 0,
        };
      }

      topClientsMap[clientId].total_spent += amount;
    });

    const topClients = Object.values(topClientsMap)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    /* ===================================================== */
    /* FINAL RESPONSE */
    /* ===================================================== */

    return {
      success: true,

      data: {
        overview: {
          total_revenue: totalRevenue,

          invoice_revenue: invoiceRevenue,

          quote_revenue: quoteRevenue,

          paid_revenue: paidRevenue,

          unpaid_revenue: unpaidRevenue,

          overdue_revenue: overdueRevenue,

          total_invoices: totalInvoices,

          total_quotes: totalQuotes,

          paid_invoices: paidInvoices,

          unpaid_invoices: unpaidInvoices,

          overdue_invoices: overdueInvoices,

          paid_quotes: paidQuotes,

          unpaid_quotes: unpaidQuotes,

          paid_count: paidInvoices + paidQuotes,

          unpaid_count: unpaidInvoices + unpaidQuotes,

          cash_revenue: cashRevenue,

          check_revenue: checkRevenue,

          online_revenue: onlineRevenue,
        },

        payment_breakdown: {
          online: onlineRevenue,

          cash: cashRevenue,

          check: checkRevenue,
        },

        daily_breakdown: Object.values(dailyMap),

        employees: Object.values(employeeMap).sort(
          (a, b) => b.total_amount - a.total_amount,
        ),

        top_clients: topClients,

        monthly_activity: [
          ...invoices.map((inv) => ({
            id: inv.id,

            type: "INVOICE",

            ref_no: inv.ref_no,

            client_name: inv.invoices_user?.user_profile?.name || "Unknown",

            email: inv.invoices_user?.email || "",

            amount: Number(inv.total_due || 0),

            payment_status: inv.payment_status,

            due_date: inv.due_date,

            service_dates: inv.service_dates,

            billing_date: inv.billing_date,

            created_at: inv.created_at,

            is_overdue:
              inv.payment_status === invoicePaymentStatusTypes.NOT_PAID &&
              inv.due_date &&
              toCalendarDate(inv.due_date) < dateInTz(),
          })),

          ...quotes.map((quote) => ({
            id: quote.id,

            type: "QUOTE",

            ref_no: quote.ref_no,

            client_name: quote.payment_user?.user_profile?.name || "Unknown",

            email: quote.payment_user?.email || "",

            amount: Number(quote.total_due || 0),

            payment_status: quote.payment_status,

            due_date: quote.due_date,

            service_dates: quote.service_dates,

            billing_date: quote.created_at,

            created_at: quote.created_at,

            is_overdue:
              quote.payment_status === invoicePaymentStatusTypes.NOT_PAID &&
              quote.due_date &&
              toCalendarDate(quote.due_date) < dateInTz(),
          })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      },
    };
  } catch (error) {
    logger.error("getBusinessAnalytics failed:", error);

    throw ApiError.orInternal(error);
  }
};

const getUpcomingInvoices = async () => {
  try {
    const today = dateInTz();

    const invoices = await Invoice.findAll({
      where: {
        is_active: true,
        billing_date: {
          [Op.gte]: today,
        },
      },

      include: [
        {
          model: User,
          as: "invoices_user",
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
          model: InvoiceItem,
          as: "service_invoice_item",
          required: false,
        },
        {
          model: InvoiceRecurring,
          as: "recurring",
          required: false,
        },
      ],

      order: [["billing_date", "ASC"]],
    });

    return invoices;
  } catch (error) {
    logger.error("getUpcomingInvoices error:", error);

    throw ApiError.orInternal(error);
  }
};

module.exports = { getMonthlyAllInvoicesSummary, getBusinessAnalytics, getUpcomingInvoices };
