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

const PAID_STATUSES = [invoicePaymentStatusTypes.PAID, invoicePaymentStatusTypes.CHECK_PAID, invoicePaymentStatusTypes.CASH_PAID];

// The month's invoices (by billing date) and quotes (by creation), each with its client's email
// and name, newest first
const analyticsRecords = async (startDate, endDate) => {
  const client = (as) => ({ model: User, as, attributes: ["id", "email"], include: [{ model: Profile, as: "user_profile", attributes: ["name"] }] });

  const invoices = await Invoice.findAll({
    where: { is_active: true, billing_date: { [Op.gte]: startDate, [Op.lt]: endDate } },
    include: [client("invoices_user")],
    order: [["billing_date", "DESC"]],
  });

  const quotes = await ServiceQuote.findAll({
    where: { is_active: true, created_at: { [Op.gte]: startDate, [Op.lt]: endDate } },
    include: [client("payment_user")],
    order: [["created_at", "DESC"]],
  });

  return { invoices, quotes };
};

// Adds an invoice or a quote to the month's figures: its revenue, paid (by method) or unpaid, its
// day and its client. Unpaid invoices past their due date also count as overdue.
const countForAnalytics = (figures, { isInvoice, amount, status, day, clientId, clientName, overdue }) => {
  figures.totalRevenue += amount;
  if (isInvoice) figures.invoiceRevenue += amount;
  else figures.quoteRevenue += amount;

  if (!figures.daily[day]) figures.daily[day] = { date: day, revenue: 0, paid: 0, unpaid: 0 };
  figures.daily[day].revenue += amount;

  if (!figures.clients[clientId]) {
    figures.clients[clientId] = { user_id: clientId, name: clientName, invoice_count: 0, total_amount: 0, paid_amount: 0, unpaid_amount: 0 };
  }
  figures.clients[clientId].invoice_count += 1;
  figures.clients[clientId].total_amount += amount;

  if (PAID_STATUSES.includes(status)) {
    figures.paidRevenue += amount;
    if (isInvoice) figures.paidInvoices += 1;
    else figures.paidQuotes += 1;
    figures.daily[day].paid += amount;
    figures.clients[clientId].paid_amount += amount;

    if (status === invoicePaymentStatusTypes.CHECK_PAID) figures.checkRevenue += amount;
    else if (status === invoicePaymentStatusTypes.CASH_PAID) figures.cashRevenue += amount;
    else figures.onlineRevenue += amount;
  } else {
    figures.unpaidRevenue += amount;
    if (isInvoice) figures.unpaidInvoices += 1;
    else figures.unpaidQuotes += 1;
    figures.daily[day].unpaid += amount;
    figures.clients[clientId].unpaid_amount += amount;
  }

  if (overdue) {
    figures.overdueRevenue += amount;
    figures.overdueInvoices += 1;
  }
};

// Not paid and due before today (New York)
const isOverdue = (record) => record.payment_status === invoicePaymentStatusTypes.NOT_PAID && record.due_date && toCalendarDate(record.due_date) < dateInTz();

// One line of the month's activity list
const activityLine = (record, type, client, billingDate) => ({
  id: record.id,
  type,
  ref_no: record.ref_no,
  client_name: client?.user_profile?.name || "Unknown",
  email: client?.email || "",
  amount: Number(record.total_due || 0),
  payment_status: record.payment_status,
  due_date: record.due_date,
  service_dates: record.service_dates,
  billing_date: billingDate,
  created_at: record.created_at,
  is_overdue: isOverdue(record),
});

// POST /invoice/getBusinessAnalytics: a month's revenue from invoices and quotes, paid and unpaid
// (by payment method), overdue invoices, per day and per client, the top 10 clients and the
// month's activity
const getBusinessAnalytics = async ({ month }) => {
  try {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const { invoices, quotes } = await analyticsRecords(startDate, endDate);

    const figures = {
      totalRevenue: 0,
      invoiceRevenue: 0,
      quoteRevenue: 0,
      paidRevenue: 0,
      unpaidRevenue: 0,
      overdueRevenue: 0,
      cashRevenue: 0,
      checkRevenue: 0,
      onlineRevenue: 0,
      paidInvoices: 0,
      unpaidInvoices: 0,
      overdueInvoices: 0,
      paidQuotes: 0,
      unpaidQuotes: 0,
      daily: {},
      clients: {},
    };

    invoices.forEach((inv) => {
      const isPaid = PAID_STATUSES.includes(inv.payment_status);
      countForAnalytics(figures, {
        isInvoice: true,
        amount: Number(inv.total_due || 0),
        status: inv.payment_status,
        day: dayjs(inv.billing_date).format(DATE_FORMAT),
        clientId: inv.user_id,
        clientName: inv.invoices_user?.user_profile?.name || "Unknown",
        overdue: !isPaid && inv.due_date && toCalendarDate(inv.due_date) < dateInTz(),
      });
    });

    quotes.forEach((quote) => {
      countForAnalytics(figures, {
        isInvoice: false,
        amount: Number(quote.total_due || 0),
        status: quote.payment_status,
        day: dateInTz(quote.created_at),
        clientId: quote.user_id,
        clientName: quote.payment_user?.user_profile?.name || "Unknown",
        overdue: false,
      });
    });

    const topClientsMap = {};
    [
      ...invoices.map((inv) => ({ user_id: inv.user_id, amount: Number(inv.total_due || 0), name: inv.invoices_user?.user_profile?.name || "Unknown" })),
      ...quotes.map((quote) => ({ user_id: quote.user_id, amount: Number(quote.total_due || 0), name: quote.payment_user?.user_profile?.name || "Unknown" })),
    ].forEach(({ user_id, amount, name }) => {
      if (!topClientsMap[user_id]) topClientsMap[user_id] = { user_id, name, total_spent: 0 };
      topClientsMap[user_id].total_spent += amount;
    });

    const topClients = Object.values(topClientsMap)
      .sort((a, b) => b.total_spent - a.total_spent)
      .slice(0, 10);

    const f = figures;
    return {
      success: true,
      data: {
        overview: {
          total_revenue: f.totalRevenue,
          invoice_revenue: f.invoiceRevenue,
          quote_revenue: f.quoteRevenue,
          paid_revenue: f.paidRevenue,
          unpaid_revenue: f.unpaidRevenue,
          overdue_revenue: f.overdueRevenue,
          total_invoices: invoices.length,
          total_quotes: quotes.length,
          paid_invoices: f.paidInvoices,
          unpaid_invoices: f.unpaidInvoices,
          overdue_invoices: f.overdueInvoices,
          paid_quotes: f.paidQuotes,
          unpaid_quotes: f.unpaidQuotes,
          paid_count: f.paidInvoices + f.paidQuotes,
          unpaid_count: f.unpaidInvoices + f.unpaidQuotes,
          cash_revenue: f.cashRevenue,
          check_revenue: f.checkRevenue,
          online_revenue: f.onlineRevenue,
        },
        payment_breakdown: {
          online: f.onlineRevenue,
          cash: f.cashRevenue,
          check: f.checkRevenue,
        },
        daily_breakdown: Object.values(f.daily),
        employees: Object.values(f.clients).sort((a, b) => b.total_amount - a.total_amount),
        top_clients: topClients,
        monthly_activity: [
          ...invoices.map((inv) => activityLine(inv, "INVOICE", inv.invoices_user, inv.billing_date)),
          ...quotes.map((quote) => activityLine(quote, "QUOTE", quote.payment_user, quote.created_at)),
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
