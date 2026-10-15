/** @format */

const httpStatus = require("http-status");
const { Sequelize, Op } = require("sequelize");
const moment = require("moment-timezone");
const timezone = "America/New_York";
const path = require("path");
const {
  ServiceQuote,
  Invoice,
  QuoteItem,
  InvoiceItem,
  User,
  Profile,
  Payment,
  InvoiceRecurring,
} = require("../../models");
const { generateInvoicePDF } = require("../../config/puppeteer");
const { sendInvoiceEmailWithPDF } = require("./email.service");
const ApiError = require("../../utils/ApiError");
const {
  generateContractPaymentLink,
  generateInvoicePaymentLink,
  deleteSquarePaymentLink,
} = require("./square.service");
const sequelize = require("../../config/central.db");
const { paymentStatusTypes } = require("../../config/types");
const { parse } = require("csv-parse/sync");

const MAX_RECURRING_OCCURRENCES = 10;
const MAX_RECURRING_MONTHS = 6;

const createInvoice = async (reqBody) => {
  try {
    let {
      quote_id,
      user_id,
      billing_date,
      service_start,
      service_end,
      invoice_date,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      signature,
      ref_type,
      custom_ref_no,
      event_name,
      is_recurring = false,
      recurring_frequency = "MONTHLY",
      recurring_end_date = null,
      recurring_max_occurrences = null,

      // Deposit is optional. Existing invoices remain full-payment by default.
      deposit_required = false,
      deposit_percentage = 25,
      balance_date,
    } = reqBody;

    console.log("========== CREATE INVOICE ==========");
    console.log("Time:", new Date());
    console.log(reqBody);

    let quote = null;
    let total_due = 0;
    let finalItems = [];

    /* ================= IF QUOTE EXISTS ================= */

    if (quote_id) {
      quote = await ServiceQuote.findByPk(quote_id);

      if (!quote) {
        throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
      }

      // Prevent duplicate invoice for same quote
      if (quote.invoice_created) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invoice already exists for this quote.",
        );
      }

      const quoteItems = await QuoteItem.findAll({
        where: { quote_id },
        order: [["id", "ASC"]],
      });

      finalItems = quoteItems.map((item) => ({
        description: item.description,
        frequency: item.frequency,
        quantity: item.quantity,
        calculation_type: item.calculation_type,
        sqft: item.sqft,
        hour: item.hour,
        unit_price: Number(item.unit_price),
        amount: Number(item.amount),
      }));

      total_due = Number(quote.total_due || 0);

      // Preserve existing quote values
      user_id = quote.user_id;
      service_start = quote.service_dates?.split(" - ")[0] || null;
      service_end = quote.service_dates?.split(" - ")[1] || null;
      to_company_name = quote.to_company_name;
      address_1 = quote.address_1;
      address_2 = quote.address_2;
      signature = quote.signature;
    }

    /* ================= MANUAL ITEMS ================= */

    if (!quote_id) {
      finalItems = items.map((item) => {
        const unit_price = Number(item.unit_price || 0);
        const quantity = Number(item.quantity || 1);

        let multiplier = 1;

        if (item.calculation_type === "hour") {
          multiplier =
            !item.hour || item.hour === "N/A" || isNaN(item.hour)
              ? 1
              : Number(item.hour);
        } else if (item.calculation_type === "sqft") {
          multiplier =
            !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
              ? 1
              : Number(item.sqft);
        }

        const amount = quantity * unit_price * multiplier;

        total_due += amount;

        return {
          description: item.description,
          frequency: item.frequency,
          quantity,
          calculation_type: item.calculation_type,
          sqft: item.calculation_type === "sqft" ? multiplier : null,
          hour: item.calculation_type === "hour" ? multiplier : null,
          unit_price,
          amount,
        };
      });
    }

    const finalRefType = quote?.ref_type || ref_type || "RHK";

    const refData = await getNextInvoiceRef(finalRefType);
    const ref = refData.ref_no;

    event_name = event_name?.trim() || null;

    /* ================= FINAL DATES ================= */

    const finalBillingDate = billing_date
      ? moment.tz(billing_date, timezone).format("YYYY-MM-DD")
      : null;

    const finalDueDate = quote
      ? quote.due_date
        ? moment.tz(quote.due_date, timezone).format("YYYY-MM-DD")
        : null
      : due_date
        ? moment.tz(due_date, timezone).format("YYYY-MM-DD")
        : null;

    const scheduledSendAt = finalBillingDate
      ? moment
          .tz(finalBillingDate, timezone)
          .hour(9)
          .minute(0)
          .second(0)
          .millisecond(0)
          .toDate()
      : null;

    if (is_recurring) {
      if (!recurring_end_date && !recurring_max_occurrences) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Please provide either recurring_end_date or recurring_max_occurrences.",
        );
      }
    }

    /* ================= PAYMENT / DEPOSIT ================= */

    // The UI should send a real boolean. This also handles string values safely.
    const finalDepositRequired =
      deposit_required === true ||
      deposit_required === 1 ||
      deposit_required === "1" ||
      deposit_required === "true";

    const finalDepositPercentage = finalDepositRequired
      ? Number(deposit_percentage ?? 25)
      : 0;

    if (
      finalDepositRequired &&
      (!Number.isFinite(finalDepositPercentage) ||
        finalDepositPercentage <= 0 ||
        finalDepositPercentage >= 100)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Deposit percentage must be greater than 0 and less than 100.",
      );
    }

    const depositAmount = finalDepositRequired
      ? Number(((Number(total_due) * finalDepositPercentage) / 100).toFixed(2))
      : null;

    const balanceAmount = finalDepositRequired
      ? Number((Number(total_due) - depositAmount).toFixed(2))
      : null;

    const initialPaymentStage = finalDepositRequired
      ? "DEPOSIT_PENDING"
      : "FULL";

    const paymentPurpose = finalDepositRequired ? "DEPOSIT" : "FULL";

    const finalBalanceDueDate = finalDepositRequired
      ? balance_date
        ? moment.tz(balance_date, timezone).format("YYYY-MM-DD")
        : null
      : null;

    if (finalDepositRequired && !finalBalanceDueDate) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please select the date for the remaining balance.",
      );
    }

    if (
      finalDepositRequired &&
      moment(finalBalanceDueDate).isSameOrBefore(
        moment.tz(finalBillingDate, timezone),
        "day",
      )
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The balance date must be after the billing date.",
      );
    }

    /* ================= CREATE INVOICE ================= */

    const invoice = await Invoice.create({
      user_id: quote ? quote.user_id : user_id,
      quote_id: quote ? quote.id : null,

      ref_type: finalRefType,
      ref_no: ref,
      custom_ref_no: custom_ref_no || null,
      event_name,

      scheduled_send_at: scheduledSendAt,

      service_dates: quote
        ? quote.service_dates
        : `${service_start} - ${service_end}`,

      billing_date: finalBillingDate,

      date: invoice_date
        ? moment.tz(invoice_date, timezone).format("YYYY-MM-DD")
        : moment().tz(timezone).format("YYYY-MM-DD"),

      due_date: finalDueDate,

      to_company_name: quote ? quote.to_company_name : to_company_name,
      address_1: quote ? quote.address_1 : address_1,
      address_2: quote ? quote.address_2 : address_2,

      total_due,

      // Deposit configuration
      deposit_required: finalDepositRequired,
      deposit_percentage: finalDepositRequired ? finalDepositPercentage : 25,
      deposit_amount: depositAmount,
      balance_amount: balanceAmount,
      payment_stage: initialPaymentStage,
      balance_due_date: finalBalanceDueDate,

      deposit_paid_at: null,
      balance_sent_at: null,
      balance_paid_at: null,

      signature: quote ? quote.signature : signature,
    });

    console.log("Invoice Created:", invoice.id, invoice.ref_no);

    if (quote) {
      await quote.update({
        invoice_created: true,
        invoice_id: invoice.id,
      });
    }

    /* ================= SAVE ITEMS ================= */

    const payload = finalItems.map((item, index) => ({
      invoice_id: invoice.id,
      description: item.description,
      frequency: item.frequency,
      quantity: item.quantity,
      calculation_type: item.calculation_type,
      sqft: item.sqft,
      hour: item.hour,
      unit_price: item.unit_price,
      amount: item.amount,
      sort_order: index + 1,
    }));

    await InvoiceItem.bulkCreate(payload);

    /* ================= RECURRING INVOICE ================= */

    if (is_recurring) {
      let finalEndDate = recurring_end_date;
      let finalMaxOccurrences = recurring_max_occurrences;

      if (finalMaxOccurrences != null) {
        finalMaxOccurrences = Math.max(
          1,
          Math.min(Number(finalMaxOccurrences), MAX_RECURRING_OCCURRENCES),
        );
      }

      if (finalEndDate) {
        const maxEndDate = moment(invoice.billing_date).add(
          MAX_RECURRING_MONTHS,
          "months",
        );

        if (moment(finalEndDate).isAfter(maxEndDate, "day")) {
          finalEndDate = maxEndDate.format("YYYY-MM-DD");
        }
      }

      const billingMoment = moment.tz(invoice.billing_date, timezone);
      const nextBillingDate = billingMoment.clone();

      switch (recurring_frequency) {
        case "WEEKLY":
          nextBillingDate.add(1, "week");
          break;
        case "BIWEEKLY":
          nextBillingDate.add(2, "weeks");
          break;
        case "MONTHLY":
          nextBillingDate.add(1, "month");
          break;
        case "QUARTERLY":
          nextBillingDate.add(3, "months");
          break;
        case "YEARLY":
          nextBillingDate.add(1, "year");
          break;
        default:
          nextBillingDate.add(1, "month");
      }

      await InvoiceRecurring.create({
        invoice_id: invoice.id,
        user_id: invoice.user_id,
        frequency: recurring_frequency,
        start_date: invoice.billing_date,
        end_date: finalEndDate
          ? moment.tz(finalEndDate, timezone).format("YYYY-MM-DD")
          : null,
        max_occurrences: finalMaxOccurrences,
        occurrences_generated: 1,
        next_billing_date: nextBillingDate.format("YYYY-MM-DD"),
        auto_send: true,
        status: "ACTIVE",
      });
    }

    /* ================= GENERATE PAYMENT LINK ================= */

    const serviceParts = invoice.service_dates
      ? invoice.service_dates.split(" - ")
      : ["", ""];

    const user = await User.findByPk(invoice.user_id);

    const initialPaymentAmount = finalDepositRequired
      ? Number(invoice.deposit_amount || 0)
      : Number(invoice.total_due || 0);

    const { paymentUrl, paymentLinkId } = await generateInvoicePaymentLink({
      amount: initialPaymentAmount,
      clientName: invoice.to_company_name,
      customerEmail: user?.email,
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
      paymentPurpose,
    });

    console.log({ paymentUrl, paymentLinkId }, "paymentLink");

    /* ================= GENERATE PDF ================= */

    const pdfPath = await generateInvoicePDF({
      invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
      event_name: invoice.event_name,
      service_start: serviceParts[0],
      service_end: serviceParts[1],
      invoice_date: invoice.date,
      billing_date: invoice.billing_date,
      due_date: invoice.due_date,
      to_company_name: invoice.to_company_name,
      address_1: invoice.address_1,
      address_2: invoice.address_2,
      total_due: invoice.total_due,
      signature: invoice.signature,
      items: payload,
      payment_link: paymentUrl,
    });

    const fileName = pdfPath.split("/").pop();
    const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    await invoice.update({
      pdf_url: publicUrl,
      payment_url: paymentUrl,
    });

    return {
      success: true,
      message: "Invoice created successfully",
      data: invoice,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getInvoiceById = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id, {
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          separate: true,
          order: [["sort_order", "ASC"]],
        },
        {
          model: InvoiceRecurring,
          as: "recurring",
          required: false,
        },
      ],
    });

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    return {
      success: true,
      data: invoice,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getInvoicesByUserId = async (user_id) => {
  try {
    const invoices = await Invoice.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          separate: true,
          order: [["sort_order", "ASC"]],
        },
        {
          model: InvoiceRecurring,
          as: "recurring",
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return {
      success: true,
      data: invoices,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateInvoice = async (invoice_id, body) => {
  const t = await sequelize.transaction();

  try {
    const {
      billing_date,
      due_date,
      date,
      items = [],
      service_start,
      service_end,
      to_company_name,
      address_1,
      address_2,
      custom_ref_no,
      event_name,
      deposit_required,
      deposit_percentage,
      is_recurring,
      recurring_frequency = "MONTHLY",
      recurring_end_date = null,
      recurring_max_occurrences = null,
      balance_date,
    } = body;

    /* ================= FETCH INVOICE ================= */

    const invoice = await Invoice.findByPk(invoice_id, {
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
        },
      ],
      transaction: t,
    });

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    /*
     * Save the original values before updating anything.
     * These are used to determine whether the initial email
     * actually needs to be rescheduled.
     */
    const originalInvoice = invoice.get({ plain: true });

    const originalItems = (invoice.service_invoice_item || []).map(
      (item) => ({
        id: item.id,
        description: item.description,
        frequency: item.frequency,
        quantity: Number(item.quantity || 1),
        calculation_type: item.calculation_type,
        sqft: item.sqft,
        hour: item.hour,
        unit_price: Number(item.unit_price || 0),
        amount: Number(item.amount || 0),
      }),
    );

    const normalizeDate = (value) => {
      if (!value) return null;

      const parsed = moment(value, "YYYY-MM-DD", true);

      return parsed.isValid() ? parsed.format("YYYY-MM-DD") : value;
    };

    /* ================= UPDATE BASIC DETAILS ================= */

    await invoice.update(
      {
        billing_date:
          billing_date !== undefined
            ? billing_date
              ? moment.tz(billing_date, timezone).format("YYYY-MM-DD")
              : null
            : invoice.billing_date,

        custom_ref_no:
          custom_ref_no !== undefined
            ? custom_ref_no
            : invoice.custom_ref_no,

        event_name:
          event_name !== undefined
            ? event_name?.trim() || null
            : invoice.event_name,

        date:
          date !== undefined
            ? date
              ? moment.tz(date, timezone).format("YYYY-MM-DD")
              : null
            : invoice.date,

        due_date:
          due_date !== undefined
            ? due_date
              ? moment.tz(due_date, timezone).format("YYYY-MM-DD")
              : null
            : invoice.due_date,

        service_dates:
          service_start !== undefined || service_end !== undefined
            ? service_start && service_end
              ? `${service_start} - ${service_end}`
              : invoice.service_dates
            : invoice.service_dates,

        to_company_name:
          to_company_name !== undefined
            ? to_company_name
            : invoice.to_company_name,

        address_1:
          address_1 !== undefined ? address_1 : invoice.address_1,

        address_2:
          address_2 !== undefined ? address_2 : invoice.address_2,
      },
      { transaction: t },
    );

    /* ================= HANDLE INVOICE ITEMS ================= */

    const existingItems = invoice.service_invoice_item || [];
    const existingMap = new Map();

    existingItems.forEach((item) => {
      existingMap.set(String(item.id), item);
    });

    // Preserve existing items if the request omits "items".
    const itemsToProcess =
      body.items === undefined
        ? existingItems.map((item) => item.get({ plain: true }))
        : items;

    if (!Array.isArray(itemsToProcess)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "items must be an array.",
      );
    }

    let total_due = 0;
    const processedIds = [];

    for (const item of itemsToProcess) {
      const quantity = Number(item.quantity || 1);
      const unit_price = Number(item.unit_price || 0);

      if (
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        !Number.isFinite(unit_price) ||
        unit_price < 0
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid invoice item quantity or unit price.",
        );
      }

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else if (item.calculation_type === "sqft") {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const amount = quantity * unit_price * multiplier;
      total_due += amount;

      if (item.id && existingMap.has(String(item.id))) {
        const dbItem = existingMap.get(String(item.id));

        await dbItem.update(
          {
            description: item.description,
            frequency: item.frequency,
            quantity,
            calculation_type: item.calculation_type,
            sqft:
              item.calculation_type === "sqft" ? multiplier : null,
            hour:
              item.calculation_type === "hour" ? multiplier : null,
            unit_price,
            amount,
          },
          { transaction: t },
        );

        processedIds.push(String(item.id));
      } else {
        const newItem = await InvoiceItem.create(
          {
            invoice_id: invoice.id,
            description: item.description,
            frequency: item.frequency,
            quantity,
            calculation_type: item.calculation_type,
            sqft:
              item.calculation_type === "sqft" ? multiplier : null,
            hour:
              item.calculation_type === "hour" ? multiplier : null,
            unit_price,
            amount,
          },
          { transaction: t },
        );

        processedIds.push(String(newItem.id));
      }
    }

    /* ================= DELETE REMOVED ITEMS ================= */

    // Only delete removed items when the request explicitly includes "items".
    if (body.items !== undefined) {
      for (const dbItem of existingItems) {
        if (!processedIds.includes(String(dbItem.id))) {
          await dbItem.destroy({ transaction: t });
        }
      }
    }

    /* ================= CALCULATE TOTAL + DEPOSIT ================= */

    // total_due always represents the complete invoice amount.
    const finalTotalDue = Number(Number(total_due).toFixed(2));

    const shouldUseDeposit =
      deposit_required !== undefined
        ? deposit_required === true ||
          deposit_required === 1 ||
          deposit_required === "1" ||
          deposit_required === "true"
        : Boolean(invoice.deposit_required);

    const percentage = shouldUseDeposit
      ? Number(
          deposit_percentage !== undefined &&
            deposit_percentage !== null &&
            deposit_percentage !== ""
            ? deposit_percentage
            : invoice.deposit_percentage || 25,
        )
      : 0;

    if (
      shouldUseDeposit &&
      (!Number.isFinite(percentage) ||
        percentage <= 0 ||
        percentage >= 100)
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Deposit percentage must be greater than 0 and less than 100.",
      );
    }

    /* ================= VALIDATE BALANCE DATE ================= */

    // The frontend sends "balance_date"; the database field is
    // "balance_due_date".
    const requestedBalanceDate =
      balance_date !== undefined
        ? balance_date
        : invoice.balance_due_date;

    let finalBalanceDueDate = null;

    if (shouldUseDeposit) {
      if (!requestedBalanceDate) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Please select the date for the remaining balance.",
        );
      }

      const parsedBalanceDate = moment(
        requestedBalanceDate,
        "YYYY-MM-DD",
        true,
      );

      if (!parsedBalanceDate.isValid()) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Please provide a valid balance due date in YYYY-MM-DD format.",
        );
      }

      finalBalanceDueDate = parsedBalanceDate.format("YYYY-MM-DD");

      const effectiveBillingDate =
        billing_date !== undefined
          ? billing_date
          : invoice.billing_date;

      if (effectiveBillingDate) {
        const parsedBillingDate = moment(
          effectiveBillingDate,
          "YYYY-MM-DD",
          true,
        );

        if (!parsedBillingDate.isValid()) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Please provide a valid billing date in YYYY-MM-DD format.",
          );
        }

        if (
          parsedBalanceDate.isSameOrBefore(
            parsedBillingDate,
            "day",
          )
        ) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "The balance date must be after the billing date.",
          );
        }
      }
    }

    /* ================= PROTECT PAYMENT TERMS ================= */

    // Do not change financial terms after payment has started.
    const paymentAlreadyStarted = [
      "DEPOSIT_PAID",
      "BALANCE_PENDING",
      "COMPLETED",
    ].includes(invoice.payment_stage);

    const financialTermsChanged =
      finalTotalDue !== Number(invoice.total_due || 0) ||
      shouldUseDeposit !== Boolean(invoice.deposit_required) ||
      (shouldUseDeposit &&
        percentage !== Number(invoice.deposit_percentage || 25));

    if (paymentAlreadyStarted && financialTermsChanged) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This invoice has already received a payment or progressed to a later payment stage. Its total and deposit terms cannot be changed through this update.",
      );
    }

    const calculatedDepositAmount = shouldUseDeposit
      ? Number(((finalTotalDue * percentage) / 100).toFixed(2))
      : null;

    const calculatedBalanceAmount = shouldUseDeposit
      ? Number((finalTotalDue - calculatedDepositAmount).toFixed(2))
      : null;

    const currentStage = invoice.payment_stage || "FULL";

    const depositUpdatePayload = {
      total_due: finalTotalDue,
      deposit_required: shouldUseDeposit,
      deposit_percentage: shouldUseDeposit ? percentage : 25,
      deposit_amount: calculatedDepositAmount,
      balance_amount: calculatedBalanceAmount,
      balance_due_date: finalBalanceDueDate,
    };

    // Only invoices awaiting their initial payment can change stages here.
    if (currentStage === "FULL" || currentStage === "DEPOSIT_PENDING") {
      depositUpdatePayload.payment_stage = shouldUseDeposit
        ? "DEPOSIT_PENDING"
        : "FULL";
    }

    await invoice.update(depositUpdatePayload, {
      transaction: t,
    });

    /* ================= RECURRING INVOICE ================= */

    const recurring = await InvoiceRecurring.findOne({
      where: {
        invoice_id: invoice.id,
      },
      transaction: t,
    });

    // Preserve existing recurring settings if the request does not
    // include is_recurring.
    const effectiveIsRecurring =
      is_recurring !== undefined
        ? is_recurring === true ||
          is_recurring === 1 ||
          is_recurring === "1" ||
          is_recurring === "true"
        : Boolean(recurring && recurring.status === "ACTIVE");

    if (effectiveIsRecurring) {
      if (!recurring_end_date && !recurring_max_occurrences) {
        if (!recurring) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Please provide either recurring_end_date or recurring_max_occurrences.",
          );
        }
      }
    }

    if (effectiveIsRecurring) {
      let finalEndDate =
        recurring_end_date !== undefined
          ? recurring_end_date
          : recurring?.end_date || null;

      let finalMaxOccurrences =
        recurring_max_occurrences !== undefined
          ? recurring_max_occurrences
          : recurring?.max_occurrences || null;

      if (finalMaxOccurrences != null) {
        finalMaxOccurrences = Math.max(
          1,
          Math.min(
            Number(finalMaxOccurrences),
            MAX_RECURRING_OCCURRENCES,
          ),
        );
      }

      const effectiveBillingDate =
        billing_date !== undefined
          ? billing_date
          : invoice.billing_date;

      if (!effectiveBillingDate) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "A billing date is required for a recurring invoice.",
        );
      }

      if (finalEndDate) {
        const maxEndDate = moment
          .tz(effectiveBillingDate, timezone)
          .add(MAX_RECURRING_MONTHS, "months");

        if (moment.tz(finalEndDate, timezone).isAfter(maxEndDate, "day")) {
          finalEndDate = maxEndDate.format("YYYY-MM-DD");
        } else {
          finalEndDate = moment
            .tz(finalEndDate, timezone)
            .format("YYYY-MM-DD");
        }
      }

      const billingMoment = moment.tz(
        effectiveBillingDate,
        timezone,
      );

      const nextBillingDate = billingMoment.clone();

      switch (recurring_frequency || recurring?.frequency) {
        case "WEEKLY":
          nextBillingDate.add(1, "week");
          break;
        case "BIWEEKLY":
          nextBillingDate.add(2, "weeks");
          break;
        case "MONTHLY":
          nextBillingDate.add(1, "month");
          break;
        case "QUARTERLY":
          nextBillingDate.add(3, "months");
          break;
        case "YEARLY":
          nextBillingDate.add(1, "year");
          break;
        default:
          nextBillingDate.add(1, "month");
      }

      const recurringPayload = {
        frequency: recurring_frequency || recurring?.frequency || "MONTHLY",
        start_date: billingMoment.format("YYYY-MM-DD"),
        end_date: finalEndDate,
        max_occurrences: finalMaxOccurrences,
        next_billing_date: nextBillingDate.format("YYYY-MM-DD"),
        status: "ACTIVE",
      };

      if (recurring) {
        await recurring.update(recurringPayload, {
          transaction: t,
        });
      } else {
        await InvoiceRecurring.create(
          {
            invoice_id: invoice.id,
            user_id: invoice.user_id,
            ...recurringPayload,
            occurrences_generated: 1,
            auto_send: true,
          },
          { transaction: t },
        );
      }
    } else if (recurring) {
      await recurring.update(
        {
          status: "CANCELLED",
        },
        { transaction: t },
      );
    }

    /* ================= COMMIT TRANSACTION ================= */

    await t.commit();

    /* ================= RELOAD UPDATED INVOICE ================= */

    const updatedInvoice = await Invoice.findByPk(invoice.id, {
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          separate: true,
          order: [["sort_order", "ASC"]],
        },
      ],
    });

    if (!updatedInvoice) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Updated invoice could not be retrieved.",
      );
    }

    const user = await User.findByPk(updatedInvoice.user_id);

    /* ================= PAYMENT LINK FOR CURRENT STAGE ================= */

    let paymentUrl = updatedInvoice.payment_url || null;
    let paymentAmount = null;
    let paymentPurpose = null;

    if (updatedInvoice.payment_stage === "DEPOSIT_PENDING") {
      paymentAmount = Number(updatedInvoice.deposit_amount || 0);
      paymentPurpose = "DEPOSIT";
    } else if (
      updatedInvoice.payment_stage === "FULL" ||
      !updatedInvoice.payment_stage
    ) {
      paymentAmount = Number(updatedInvoice.total_due || 0);
      paymentPurpose = "FULL";
    }

    // BALANCE_PENDING, DEPOSIT_PAID and COMPLETED are intentionally excluded.
    if (
      paymentAmount !== null &&
      paymentAmount > 0 &&
      paymentPurpose
    ) {
      const paymentLinkResult = await generateInvoicePaymentLink({
        amount: paymentAmount,
        clientName: updatedInvoice.to_company_name,
        customerEmail: user?.email,
        user_id: updatedInvoice.user_id,
        invoice_id: updatedInvoice.id,
        invoiceRefNo:
          updatedInvoice.custom_ref_no || updatedInvoice.ref_no,
        paymentPurpose,
      });

      paymentUrl = paymentLinkResult.paymentUrl;
    }

    /* ================= GENERATE PDF ================= */

    const serviceParts = updatedInvoice.service_dates
      ? updatedInvoice.service_dates.split(" - ")
      : ["", ""];

    const pdfPath = await generateInvoicePDF({
      invoice_ref_no:
        updatedInvoice.custom_ref_no || updatedInvoice.ref_no,
      event_name: updatedInvoice.event_name,
      service_start: serviceParts[0],
      service_end: serviceParts[1],
      invoice_date: updatedInvoice.date,
      billing_date: updatedInvoice.billing_date,
      due_date: updatedInvoice.due_date,
      to_company_name: updatedInvoice.to_company_name,
      address_1: updatedInvoice.address_1,
      address_2: updatedInvoice.address_2,
      total_due: updatedInvoice.total_due,
      signature: updatedInvoice.signature,
      items: updatedInvoice.service_invoice_item,
      payment_link: paymentUrl,
    });

    const fileName = pdfPath.split("/").pop();

    const publicUrl =
      `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    /* ================= UPDATE PDF + PAYMENT LINK ================= */

    const updatePayload = {
      pdf_url: publicUrl,
    };

    // Do not erase a previously stored link if no new link was generated.
    if (paymentUrl) {
      updatePayload.payment_url = paymentUrl;
    }

    /* ================= EMAIL SEND SCHEDULE ================= */

    /*
     * Compare actual invoice values rather than checking only whether
     * a field was included in the request. This handles edit forms that
     * submit every field even when only balance_date was changed.
     */

    const currentItems = (updatedInvoice.service_invoice_item || [])
      .map((item) => ({
        id: item.id,
        description: item.description,
        frequency: item.frequency,
        quantity: Number(item.quantity || 1),
        calculation_type: item.calculation_type,
        sqft: item.sqft,
        hour: item.hour,
        unit_price: Number(item.unit_price || 0),
        amount: Number(item.amount || 0),
      }))
      .sort((a, b) => Number(a.id) - Number(b.id));

    const previousItems = [...originalItems].sort(
      (a, b) => Number(a.id) - Number(b.id),
    );

    const itemsActuallyChanged =
      JSON.stringify(currentItems) !== JSON.stringify(previousItems);

    const clientFacingFieldsChanged =
      normalizeDate(updatedInvoice.billing_date) !==
        normalizeDate(originalInvoice.billing_date) ||
      normalizeDate(updatedInvoice.due_date) !==
        normalizeDate(originalInvoice.due_date) ||
      normalizeDate(updatedInvoice.date) !==
        normalizeDate(originalInvoice.date) ||
      (updatedInvoice.service_dates || null) !==
        (originalInvoice.service_dates || null) ||
      (updatedInvoice.to_company_name || null) !==
        (originalInvoice.to_company_name || null) ||
      (updatedInvoice.address_1 || null) !==
        (originalInvoice.address_1 || null) ||
      (updatedInvoice.address_2 || null) !==
        (originalInvoice.address_2 || null) ||
      (updatedInvoice.custom_ref_no || null) !==
        (originalInvoice.custom_ref_no || null) ||
      (updatedInvoice.event_name || null) !==
        (originalInvoice.event_name || null) ||
      itemsActuallyChanged ||
      Number(updatedInvoice.total_due || 0) !==
        Number(originalInvoice.total_due || 0) ||
      Boolean(updatedInvoice.deposit_required) !==
        Boolean(originalInvoice.deposit_required) ||
      Number(updatedInvoice.deposit_percentage || 25) !==
        Number(originalInvoice.deposit_percentage || 25);

    const isInitialPaymentStage = [
      "FULL",
      "DEPOSIT_PENDING",
    ].includes(updatedInvoice.payment_stage || "FULL");

    /*
     * Only recalculate the initial email schedule if client-facing
     * invoice details actually changed AND the invoice is still waiting
     * for its initial payment.
     *
     * Changing balance_due_date alone will not enter this block.
     */
    if (clientFacingFieldsChanged && isInitialPaymentStage) {
      const effectiveBillingDate = updatedInvoice.billing_date;

      if (!effectiveBillingDate) {
        updatePayload.scheduled_send_at = null;
        updatePayload.last_sent_at = null;
      } else {
        const now = moment().tz(timezone);

        const billingMoment = moment.tz(
          effectiveBillingDate,
          "YYYY-MM-DD",
          true,
          timezone,
        );

        if (!billingMoment.isValid()) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Please provide a valid billing date in YYYY-MM-DD format.",
          );
        }

        if (billingMoment.isSameOrBefore(now, "day")) {
          const nineAM = billingMoment
            .clone()
            .hour(9)
            .minute(0)
            .second(0)
            .millisecond(0);

          if (billingMoment.isSame(now, "day") && now.isBefore(nineAM)) {
            updatePayload.scheduled_send_at = nineAM.toDate();
          } else {
            updatePayload.scheduled_send_at = now
              .clone()
              .add(30, "minutes")
              .toDate();
          }
        } else {
          updatePayload.scheduled_send_at = billingMoment
            .clone()
            .hour(9)
            .minute(0)
            .second(0)
            .millisecond(0)
            .toDate();
        }

        // Reset only when a relevant invoice change requires resending.
        updatePayload.last_sent_at = null;
      }
    }

    await updatedInvoice.update(updatePayload);

    return {
      success: true,
      message: "Invoice updated + PDF regenerated",
      data: updatedInvoice,
    };
  } catch (error) {
    // The transaction may already have committed before PDF/link generation.
    if (!t.finished) {
      await t.rollback();
    }

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getNextInvoiceRef = async (ref_type) => {
  try {
    if (!ref_type) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ref_type is required");
    }

    const lastInvoice = await Invoice.findOne({
      where: { ref_type },
      order: [["created_at", "DESC"]],
      attributes: ["ref_no"],
    });

    let nextNumber = 1;

    if (lastInvoice?.ref_no) {
      const match = lastInvoice.ref_no.match(/\d+$/);

      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    return {
      ref_no: `${ref_type}${nextNumber}`,
      sequence: nextNumber,
    };
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, err.message);
  }
};

const getAllInvoices = async ({ month } = {}) => {
  try {
    const where = {
      is_active: true,
    };

    if (month) {
      // month format: YYYY-MM
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      /*
       * Existing condition:
       * billing_date must be within selected month
       *
       * OR
       *
       * If billing_date is NULL,
       * use created_at to determine the month.
       */
      where[Op.or] = [
        {
          billing_date: {
            [Op.gte]: startDate,
            [Op.lt]: endDate,
          },
        },
        {
          billing_date: null,
          created_at: {
            [Op.gte]: startDate,
            [Op.lt]: endDate,
          },
        },
      ];
    }

    const invoices = await Invoice.findAll({
      where,

      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          required: false,
          separate: true,
          order: [["sort_order", "ASC"]],
        },
        {
          model: InvoiceRecurring,
          as: "recurring",
          required: false,
        },
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

      order: [["billing_date", "ASC"]],

      limit: 100,
    });

    if (!invoices || invoices.length === 0) {
      return [];
    }

    return invoices;
  } catch (error) {
    console.error("getAllInvoices error:", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteInvoice = async (invoiceId) => {
  try {
    const invoice = await Invoice.findByPk(invoiceId);

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    /* ====================================== */
    /* FIND PAYMENT RECORD */
    /* ====================================== */

    const payment = await Payment.findOne({
      where: {
        invoice_id: invoice.id,

        payment_status: paymentStatusTypes.PENDING,
      },

      order: [["created_at", "DESC"]],
    });

    /* ====================================== */
    /* DELETE SQUARE PAYMENT LINK */
    /* ====================================== */

    if (payment?.square_payment_link_id) {
      try {
        await deleteSquarePaymentLink(payment.square_payment_link_id);

        /* OPTIONAL:
           mark payment cancelled */

        await payment.update({
          payment_status: paymentStatusTypes.REJECTED,
        });
      } catch (err) {
        console.warn(
          "Failed to delete Square payment link:",
          err.response?.data || err.message,
        );
      }
    }

    /* ====================================== */
    /* CLEAR INVOICE PAYMENT URL */
    /* ====================================== */

    await invoice.update({
      payment_url: null,
    });

    /* ====================================== */
    /* DELETE RECURRING CONFIG */
    /* ====================================== */

    await InvoiceRecurring.destroy({
      where: {
        invoice_id: invoice.id,
      },
    });

    /* ====================================== */
    /* DETACH QUOTE FROM INVOICE */
    /* ====================================== */

    if (invoice.quote_id) {
      await ServiceQuote.update(
        {
          invoice_created: false,
          invoice_id: null,
        },
        {
          where: {
            id: invoice.quote_id,
          },
        },
      );
    }

    /* ====================================== */
    /* SOFT DELETE INVOICE */
    /* ====================================== */

    await invoice.destroy();

    return {
      success: true,

      message: "Invoice deleted successfully",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

// const TEST_MODE = true; // ⚠️ SET TO false BEFORE PRODUCTION

// const sendInvoiceCron = async () => {
//   try {
//     const timezone = "America/New_York";

//     const todayNY = moment().tz(timezone).format("YYYY-MM-DD");

//     console.log("todayNY", todayNY);

//     const invoices = await Invoice.findAll({
//       where: {
//         status: "ACTIVE",
//         is_active: true,

//         // ===== TEST MODE — REMOVE user_id FILTER BEFORE PRODUCTION =====
//         ...(TEST_MODE ? { user_id: 1 } : {}),
//         // =================================================================

//         // scheduled_send_at: {
//         //   [Op.lte]: new Date(),
//         // },

//         // In test mode we don't filter last_sent_at at all, so it
//         // keeps picking the same invoice back up every run.
//         ...(TEST_MODE ? {} : { last_sent_at: null }),
//       },
//     });

//     console.log(`Invoices to process: ${invoices.length}`);

//     for (const invoice of invoices) {
//       /* ---------- PREVENT DUPLICATE SEND ---------- */

//       if (
//         !TEST_MODE &&
//         invoice.last_sent_at &&
//         moment(invoice.last_sent_at).isSame(moment(), "day")
//       ) {
//         continue;
//       }

//       /* ---------- FETCH ITEMS ---------- */

//       const items = await InvoiceItem.findAll({
//         where: {
//           invoice_id: invoice.id,
//         },
//       });

//       /* ---------- FETCH USER ---------- */

//       const user = await User.findByPk(invoice.user_id, {
//         include: [
//           {
//             model: Profile,
//             as: "user_profile",
//             attributes: ["name"],
//           },
//         ],
//       });

//       /* ---------- GENERATE PAYMENT LINK ---------- */

//       const { paymentUrl } = await generateInvoicePaymentLink({
//         amount: Number(invoice.total_due || 0),
//         clientName: invoice.to_company_name,
//         customerEmail: user?.email,
//         user_id: invoice.user_id,
//         invoice_id: invoice.id,
//         invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
//       });

//       /* ---------- GENERATE PDF ---------- */

//       const serviceParts = invoice.service_dates
//         ? invoice.service_dates.split(" - ")
//         : ["", ""];

//       const pdfPath = await generateInvoicePDF({
//         invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
//         service_start: serviceParts[0],
//         service_end: serviceParts[1],
//         invoice_date: invoice.date,
//         billing_date: invoice.billing_date,
//         due_date: invoice.due_date,
//         to_company_name: invoice.to_company_name,
//         address_1: invoice.address_1,
//         address_2: invoice.address_2,
//         total_due: invoice.total_due,
//         signature: invoice.signature,
//         items,
//         payment_link: paymentUrl,
//       });

//       /* ---------- UPDATE PDF + PAYMENT LINK ---------- */

//       const fileName = pdfPath.split("/").pop();

//       const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

//       await invoice.update({
//         pdf_url: publicUrl,
//         payment_url: paymentUrl,
//       });

//       /* ---------- SEND EMAIL ---------- */

//       if (user?.email) {
//         const senderMap = {
//           2: "m.williams@socialsanitation.com",
//           5: "y.claudio@socialsanitation.com",
//         };

//         const senderEmail =
//           senderMap[user.assigned_to] || process.env.AZURE_SENDER_EMAIL;

//         await sendInvoiceEmailWithPDF(user, invoice, pdfPath, senderEmail);
//       }

//       /* ---------- MARK AS SENT ---------- */

//       // Skip updating last_sent_at in test mode so the invoice
//       // doesn't fall out of the query on the next run.
//       if (!TEST_MODE) {
//         await invoice.update({
//           last_sent_at: new Date(),
//         });
//       }

//       console.log(`Invoice ${invoice.ref_no} sent successfully.`);
//     }
//   } catch (error) {
//     console.error("sendInvoiceCron error:", error);
//   }
// };

const sendInvoiceCron = async () => {
  try {
    const timezone = "America/New_York";

    const todayNY = moment().tz(timezone).format("YYYY-MM-DD");

    console.log("todayNY", todayNY);

    const invoices = await Invoice.findAll({
      where: {
        status: "ACTIVE",
        is_active: true,
        // Only send invoices whose billing date is today or in the future.
        // Historical invoices must never be emailed by this cron.
        billing_date: {
          [Op.gte]: todayNY,
        },

        scheduled_send_at: {
          [Op.lte]: new Date(),
        },

        last_sent_at: null,
      },
    });

    console.log(`Invoices to process: ${invoices.length}`);

    for (const invoice of invoices) {
      /* ---------- PREVENT DUPLICATE SEND ---------- */

      if (
        invoice.last_sent_at &&
        moment(invoice.last_sent_at).isSame(moment(), "day")
      ) {
        continue;
      }

      /* ---------- FETCH ITEMS ---------- */

      const items = await InvoiceItem.findAll({
        where: {
          invoice_id: invoice.id,
        },
        order: [["sort_order", "ASC"]],
      });

      /* ---------- FETCH USER ---------- */

      const user = await User.findByPk(invoice.user_id, {
        include: [
          {
            model: Profile,
            as: "user_profile",
            attributes: ["name"],
          },
        ],
      });

      /* ---------- DETERMINE PAYMENT AMOUNT ---------- */

      let paymentAmount;
      let paymentPurpose;

      if (invoice.deposit_required) {
        // The cron may send only the initial deposit.
        if (invoice.payment_stage !== "DEPOSIT_PENDING") {
          console.log(
            `Skipping invoice ${invoice.ref_no}: payment stage is ${invoice.payment_stage}`,
          );
          continue;
        }

        paymentAmount = Number(invoice.deposit_amount || 0);
        paymentPurpose = "DEPOSIT";
      } else {
        // Existing non-deposit invoices retain full-payment behavior.
        if (invoice.payment_stage && invoice.payment_stage !== "FULL") {
          console.log(
            `Skipping invoice ${invoice.ref_no}: payment stage is ${invoice.payment_stage}`,
          );
          continue;
        }

        paymentAmount = Number(invoice.total_due || 0);
        paymentPurpose = "FULL";
      }

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        console.log(
          `Skipping invoice ${invoice.ref_no}: invalid payment amount`,
        );
        continue;
      }

      /* ---------- GENERATE PAYMENT LINK ---------- */

      const { paymentUrl } = await generateInvoicePaymentLink({
        amount: paymentAmount,
        clientName: invoice.to_company_name,
        customerEmail: user?.email,
        user_id: invoice.user_id,
        invoice_id: invoice.id,
        invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
        paymentPurpose,
      });

      /* ---------- GENERATE PDF ---------- */

      const serviceParts = invoice.service_dates
        ? invoice.service_dates.split(" - ")
        : ["", ""];

      const pdfPath = await generateInvoicePDF({
        invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
        event_name: invoice.event_name,
        service_start: serviceParts[0],
        service_end: serviceParts[1],
        invoice_date: invoice.date,
        billing_date: invoice.billing_date,
        due_date: invoice.due_date,
        to_company_name: invoice.to_company_name,
        address_1: invoice.address_1,
        address_2: invoice.address_2,
        total_due: invoice.total_due,
        signature: invoice.signature,
        items,
        payment_link: paymentUrl,
      });

      /* ---------- UPDATE PDF + PAYMENT LINK ---------- */

      const fileName = pdfPath.split("/").pop();

      const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

      await invoice.update({
        pdf_url: publicUrl,
        payment_url: paymentUrl,
      });

      /* ---------- SEND EMAIL ---------- */

      if (user?.email) {
        const senderMap = {
          2: "m.williams@socialsanitation.com",
          5: "y.claudio@socialsanitation.com",
        };

        const senderEmail =
          senderMap[user.assigned_to] || process.env.AZURE_SENDER_EMAIL;

        await sendInvoiceEmailWithPDF(user, invoice, pdfPath, senderEmail);
      }

      /* ---------- MARK AS SENT ---------- */

      await invoice.update({
        last_sent_at: new Date(),
      });

      console.log(`Invoice ${invoice.ref_no} sent successfully.`);
    }
  } catch (error) {
    console.error("sendInvoiceCron error:", error);
  }
};

const generateRecurringInvoicesCron = async () => {
  try {
    const timezone = "America/New_York";
    const today = moment().tz(timezone).format("YYYY-MM-DD");

    const recurringInvoices = await InvoiceRecurring.findAll({
      where: {
        status: "ACTIVE",
        next_billing_date: today,
      },
    });

    console.log(
      `Recurring invoices to generate: ${recurringInvoices.length}`,
    );

    for (const recurring of recurringInvoices) {
      try {
        console.log(
          "Processing recurring invoice:",
          recurring.invoice_id,
        );

        const invoice = await Invoice.findByPk(recurring.invoice_id, {
          include: [
            {
              model: InvoiceItem,
              as: "service_invoice_item",
              separate: true,
              order: [["sort_order", "ASC"]],
            },
          ],
        });

        if (!invoice) {
          console.log(
            `Invoice not found for recurring schedule ${recurring.id}.`,
          );
          continue;
        }

        // ---------- CHECK OCCURRENCE LIMIT ----------

        if (
          recurring.max_occurrences &&
          Number(recurring.occurrences_generated || 0) >=
            Number(recurring.max_occurrences)
        ) {
          console.log("Maximum occurrences reached.");

          await recurring.update({
            status: "COMPLETED",
          });

          continue;
        }

        // ---------- CHECK TEMPLATE STATUS ----------

        if (invoice.status !== "ACTIVE" || !invoice.is_active) {
          console.log("Template invoice is inactive.");
          continue;
        }

        // ---------- CHECK RECURRING END DATE ----------

        const billingMoment = moment.tz(
          recurring.next_billing_date,
          "YYYY-MM-DD",
          true,
          timezone,
        );

        if (!billingMoment.isValid()) {
          console.error(
            `Invalid next billing date for recurring schedule ${recurring.id}:`,
            recurring.next_billing_date,
          );
          continue;
        }

        if (recurring.end_date) {
          const endMoment = moment.tz(
            recurring.end_date,
            "YYYY-MM-DD",
            true,
            timezone,
          );

          if (
            endMoment.isValid() &&
            billingMoment.isAfter(endMoment, "day")
          ) {
            console.log(
              `Recurring schedule ${recurring.id} completed.`,
            );

            await recurring.update({
              status: "COMPLETED",
            });

            continue;
          }
        }

        // ---------- CALCULATE NEXT BILLING DATE ----------

        const nextBillingMoment = billingMoment.clone();

        switch (recurring.frequency) {
          case "WEEKLY":
            nextBillingMoment.add(1, "week");
            break;

          case "BIWEEKLY":
            nextBillingMoment.add(2, "weeks");
            break;

          case "MONTHLY":
            nextBillingMoment.add(1, "month");
            break;

          case "QUARTERLY":
            nextBillingMoment.add(3, "months");
            break;

          case "YEARLY":
            nextBillingMoment.add(1, "year");
            break;

          default:
            nextBillingMoment.add(1, "month");
        }

        // ---------- CALCULATE NEXT DUE DATE ----------

        const originalBillingMoment = moment(
          invoice.billing_date,
          "YYYY-MM-DD",
          true,
        );

        const originalDueMoment = moment(
          invoice.due_date,
          "YYYY-MM-DD",
          true,
        );

        let dueGap = 0;

        if (
          originalBillingMoment.isValid() &&
          originalDueMoment.isValid()
        ) {
          dueGap = originalDueMoment.diff(
            originalBillingMoment,
            "days",
          );
        }

        const nextDueDate = billingMoment
          .clone()
          .add(dueGap, "days")
          .format("YYYY-MM-DD");

        const nextInvoiceDate = billingMoment.format("YYYY-MM-DD");

        // ---------- CALCULATE SERVICE DATES ----------

        const serviceParts = invoice.service_dates
          ? invoice.service_dates.split(" - ")
          : ["", ""];

        const originalServiceStart = moment(
          serviceParts[0],
          "YYYY-MM-DD",
          true,
        );

        const originalServiceEnd = moment(
          serviceParts[1],
          "YYYY-MM-DD",
          true,
        );

        let serviceDuration = 0;

        if (
          originalServiceStart.isValid() &&
          originalServiceEnd.isValid()
        ) {
          serviceDuration = Math.max(
            0,
            originalServiceEnd.diff(originalServiceStart, "days"),
          );
        }

        const nextServiceStart = billingMoment.format("YYYY-MM-DD");

        const nextServiceEnd = billingMoment
          .clone()
          .add(serviceDuration, "days")
          .format("YYYY-MM-DD");

        // ---------- PRESERVE DEPOSIT SETTINGS ----------

        // Handles Sequelize booleans and common DB representations.
        const recurringDepositRequired =
          invoice.deposit_required === true ||
          invoice.deposit_required === 1 ||
          invoice.deposit_required === "1" ||
          String(invoice.deposit_required).toLowerCase() === "true";

        const rawDepositPercentage = Number(
          invoice.deposit_percentage,
        );

        const recurringDepositPercentage = recurringDepositRequired
          ? Number.isFinite(rawDepositPercentage) &&
            rawDepositPercentage > 0 &&
            rawDepositPercentage <= 100
            ? rawDepositPercentage
            : 25
          : 0;

        const totalDue = Number(invoice.total_due || 0);

        if (!Number.isFinite(totalDue) || totalDue < 0) {
          console.error(
            `Invalid total_due on recurring template invoice ${invoice.id}.`,
          );
          continue;
        }

        const recurringDepositAmount = recurringDepositRequired
          ? Number(
              (
                (totalDue * recurringDepositPercentage) /
                100
              ).toFixed(2),
            )
          : null;

        const recurringBalanceAmount = recurringDepositRequired
          ? Number(
              (totalDue - recurringDepositAmount).toFixed(2),
            )
          : null;

        // Shift the balance due date by the same number of days
        // as the gap between the template billing date and balance date.
        let nextBalanceDueDate = null;

        if (recurringDepositRequired) {
          const originalBalanceDueMoment = moment(
            invoice.balance_due_date,
            "YYYY-MM-DD",
            true,
          );

          if (!originalBillingMoment.isValid()) {
            console.error(
              `Cannot generate deposit invoice from template ${invoice.id}: invalid billing_date.`,
            );
            continue;
          }

          if (!originalBalanceDueMoment.isValid()) {
            console.error(
              `Cannot generate deposit invoice from template ${invoice.id}: balance_due_date is missing or invalid.`,
            );
            continue;
          }

          const balanceGap = originalBalanceDueMoment.diff(
            originalBillingMoment,
            "days",
          );

          if (balanceGap <= 0) {
            console.error(
              `Cannot generate deposit invoice from template ${invoice.id}: balance_due_date must be after billing_date.`,
            );
            continue;
          }

          nextBalanceDueDate = billingMoment
            .clone()
            .add(balanceGap, "days")
            .format("YYYY-MM-DD");
        }

        // ---------- GENERATE NEXT INVOICE REFERENCE ----------

        const newRefData = await getNextInvoiceRef(invoice.ref_type);
        const newRef = newRefData.ref_no;

        // ---------- CHECK FOR DUPLICATE ----------

        const existingInvoice = await Invoice.findOne({
          where: {
            user_id: invoice.user_id,
            billing_date: billingMoment.format("YYYY-MM-DD"),
            ref_type: invoice.ref_type,
            status: "ACTIVE",
            is_active: true,
          },
        });

        if (existingInvoice) {
          console.log(
            `Invoice already exists for billing date ${nextInvoiceDate}.`,
          );
          continue;
        }

        // ---------- CREATE NEXT INVOICE ----------

        const newInvoice = await Invoice.create({
          user_id: invoice.user_id,
          quote_id: invoice.quote_id,

          ref_type: invoice.ref_type,
          ref_no: newRef,
          event_name: invoice.event_name,

          scheduled_send_at: billingMoment
            .clone()
            .hour(9)
            .minute(0)
            .second(0)
            .millisecond(0)
            .toDate(),

          custom_ref_no: null,

          service_dates: `${nextServiceStart} - ${nextServiceEnd}`,

          billing_date: nextInvoiceDate,
          date: nextInvoiceDate,
          due_date: nextDueDate,

          to_company_name: invoice.to_company_name,
          address_1: invoice.address_1,
          address_2: invoice.address_2,

          // The invoice's total remains the full invoice amount.
          total_due: totalDue,

          signature: invoice.signature,

          // Deposit configuration is copied to each future invoice.
          deposit_required: recurringDepositRequired,
          deposit_percentage: recurringDepositRequired
            ? recurringDepositPercentage
            : invoice.deposit_percentage ?? 25,
          deposit_amount: recurringDepositAmount,
          balance_amount: recurringBalanceAmount,
          balance_due_date: nextBalanceDueDate,

          // Every generated invoice starts with a fresh payment lifecycle.
          payment_stage: recurringDepositRequired
            ? "DEPOSIT_PENDING"
            : "FULL",
          deposit_paid_at: null,
          balance_sent_at: null,
          balance_paid_at: null,

          status: "ACTIVE",
          is_active: true,
        });

        console.log(
          `Created recurring invoice ${newInvoice.ref_no}. Deposit required: ${recurringDepositRequired}.`,
        );

        // ---------- COPY INVOICE ITEMS ----------

        const newItems = (
          invoice.service_invoice_item || []
        ).map((item) => ({
          invoice_id: newInvoice.id,

          description: item.description,
          frequency: item.frequency,

          quantity: item.quantity,

          calculation_type: item.calculation_type,
          sqft: item.sqft,
          hour: item.hour,

          unit_price: item.unit_price,
          amount: item.amount,
          sort_order: item.sort_order,
        }));

        if (newItems.length > 0) {
          await InvoiceItem.bulkCreate(newItems);
        }

        console.log(`Copied ${newItems.length} invoice items.`);

        // ---------- UPDATE RECURRING SCHEDULE ----------

        const finalCount =
          Number(recurring.occurrences_generated || 0) + 1;

        const updateData = {
          occurrences_generated: finalCount,
          next_billing_date: nextBillingMoment.format("YYYY-MM-DD"),
        };

        if (
          recurring.max_occurrences &&
          finalCount >= Number(recurring.max_occurrences)
        ) {
          updateData.status = "COMPLETED";
        }

        if (
          recurring.end_date &&
          nextBillingMoment.isAfter(
            moment.tz(
              recurring.end_date,
              "YYYY-MM-DD",
              true,
              timezone,
            ),
            "day",
          )
        ) {
          updateData.status = "COMPLETED";
        }

        await recurring.update(updateData);

        console.log(
          `Recurring schedule ${recurring.id} updated. Next billing date: ${nextBillingMoment.format("YYYY-MM-DD")}`,
        );
      } catch (invoiceError) {
        console.error(
          `Failed processing recurring schedule ${recurring.id}:`,
          invoiceError,
        );
        // Continue processing other recurring invoices.
      }
    }
  } catch (error) {
    console.error("generateRecurringInvoicesCron:", error);
  }
};

const sendInvoiceBalance = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id, {
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          separate: true,
          order: [["sort_order", "ASC"]],
        },
      ],
    });

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    if (!invoice.deposit_required) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This invoice does not use the deposit payment option.",
      );
    }

    if (invoice.payment_stage !== "DEPOSIT_PAID") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The deposit must be paid before sending the remaining balance.",
      );
    }

    if (invoice.balance_sent_at) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The remaining balance has already been sent.",
      );
    }

    const balanceAmount = Number(invoice.balance_amount || 0);

    if (!Number.isFinite(balanceAmount) || balanceAmount <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No remaining balance is due.",
      );
    }

    const user = await User.findByPk(invoice.user_id, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!user) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Invoice user not found.",
      );
    }

    if (!user.email) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The invoice user does not have an email address.",
      );
    }

    // Generate a Square link for the remaining balance only.
    const { paymentUrl } = await generateInvoicePaymentLink({
      amount: balanceAmount,
      clientName: invoice.to_company_name,
      customerEmail: user.email,
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
      paymentPurpose: "BALANCE",
    });

    if (!paymentUrl) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to generate the remaining balance payment link.",
      );
    }

    const serviceParts = invoice.service_dates
      ? invoice.service_dates.split(" - ")
      : ["", ""];

    const pdfPath = await generateInvoicePDF({
      invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
      event_name: invoice.event_name,
      service_start: serviceParts[0],
      service_end: serviceParts[1],
      invoice_date: invoice.date,
      billing_date: invoice.billing_date,
      due_date: invoice.due_date,
      to_company_name: invoice.to_company_name,
      address_1: invoice.address_1,
      address_2: invoice.address_2,
      total_due: invoice.total_due,
      amount_due_now: balanceAmount,
      signature: invoice.signature,
      items: invoice.service_invoice_item || [],
      payment_link: paymentUrl,
    });

    const fileName = pdfPath.split("/").pop();
    const publicUrl =
      `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    // Save the generated link and PDF, but do not mark the balance as sent yet.
    await invoice.update({
      payment_url: paymentUrl,
      pdf_url: publicUrl,
    });

    const senderMap = {
      2: "m.williams@socialsanitation.com",
      5: "y.claudio@socialsanitation.com",
    };

    const senderEmail =
      senderMap[user.assigned_to] || process.env.AZURE_SENDER_EMAIL;

    // If this fails, payment_stage remains DEPOSIT_PAID and balance_sent_at
    // remains null, allowing the cron to retry on a later run.
    await sendInvoiceEmailWithPDF(user, invoice, pdfPath, senderEmail);

    // Mark the balance as sent only after the email service succeeds.
    await invoice.update({
      payment_stage: "BALANCE_PENDING",
      balance_sent_at: new Date(),
      last_sent_at: new Date(),
    });

    return {
      success: true,
      message: "Remaining balance invoice sent successfully",
      data: {
        invoice_id: invoice.id,
        total_due: Number(invoice.total_due),
        deposit_amount: Number(invoice.deposit_amount),
        balance_amount: balanceAmount,
        payment_stage: "BALANCE_PENDING",
        balance_sent_at: invoice.balance_sent_at,
        payment_url: paymentUrl,
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getMonthlyAllInvoicesSummary = async ({ month }) => {
  try {
    const startDate = `${month}-01`;
    const endDate = moment(startDate).add(1, "month").format("YYYY-MM-DD");

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
            role_id: "6",
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

      billingDates.add(moment(invoice.billing_date).format("YYYY-MM-DD"));
    });

    return {
      billing_dates: [...billingDates].sort(),
      employees: Object.values(userMap),
    };
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const markInvoicePaidByCheck = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const paidStatuses = [
      "PAID",
      "CHECK_PAID",
      "CASH_PAID",
      "ACH_PAID",
    ];

    if (
      paidStatuses.includes(invoice.payment_status) ||
      invoice.payment_stage === "COMPLETED"
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invoice already paid",
      );
    }

    const now = new Date();

    const updatePayload = {
      payment_status: "CHECK_PAID",
      payment_stage: "COMPLETED",
    };

    // For deposit invoices, record both payment milestones as settled.
    if (invoice.deposit_required) {
      updatePayload.deposit_paid_at =
        invoice.deposit_paid_at || now;

      updatePayload.balance_paid_at =
        invoice.balance_paid_at || now;
    }

    await invoice.update(updatePayload);

    return {
      success: true,
      message: "Invoice marked as paid by check",
      data: invoice,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const markInvoicePaidByACH = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const paidStatuses = [
      "PAID",
      "CHECK_PAID",
      "CASH_PAID",
      "ACH_PAID",
    ];

    if (
      paidStatuses.includes(invoice.payment_status) ||
      invoice.payment_stage === "COMPLETED"
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invoice already paid",
      );
    }

    const now = new Date();

    const updatePayload = {
      payment_status: "ACH_PAID",
      payment_stage: "COMPLETED",
    };

    // For deposit invoices, record both payment milestones as settled.
    if (invoice.deposit_required) {
      updatePayload.deposit_paid_at =
        invoice.deposit_paid_at || now;

      updatePayload.balance_paid_at =
        invoice.balance_paid_at || now;
    }

    await invoice.update(updatePayload);

    return {
      success: true,
      message: "Invoice marked as paid by ACH",
      data: invoice,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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

      const billingDate = moment(inv.billing_date).format("YYYY-MM-DD");

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
        status === "PAID" || status === "CHECK_PAID" || status === "CASH_PAID";

      const isOverdue =
        !isPaid &&
        inv.due_date &&
        moment(inv.due_date).isBefore(moment(), "day");

      /* ================= PAID ================= */

      if (isPaid) {
        paidRevenue += amount;

        paidInvoices += 1;

        dailyMap[billingDate].paid += amount;

        employeeMap[employeeId].paid_amount += amount;

        /* ---------- PAYMENT METHOD ---------- */

        if (status === "CHECK_PAID") {
          checkRevenue += amount;
        } else if (status === "CASH_PAID") {
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

      const billingDate = moment(quote.created_at).format("YYYY-MM-DD");

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
        status === "PAID" || status === "CHECK_PAID" || status === "CASH_PAID";

      if (isPaid) {
        paidRevenue += amount;

        paidQuotes += 1;

        dailyMap[billingDate].paid += amount;

        employeeMap[employeeId].paid_amount += amount;

        if (status === "CHECK_PAID") {
          checkRevenue += amount;
        } else if (status === "CASH_PAID") {
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

          total_invoices: totalInvoices,

          total_quotes: totalQuotes,

          paid_invoices: paidInvoices,

          unpaid_invoices: unpaidInvoices,

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
              inv.payment_status === "NOT_PAID" &&
              inv.due_date &&
              moment(inv.due_date).isBefore(moment(), "day"),
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
              quote.payment_status === "NOT_PAID" &&
              quote.due_date &&
              moment(quote.due_date).isBefore(moment(), "day"),
          })),
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      },
    };
  } catch (error) {
    console.error(error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getUpcomingInvoices = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    console.error("getUpcomingInvoices error:", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const reorderInvoiceItems = async (invoice_id, items) => {
  const t = await sequelize.transaction();

  try {
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "items must be a non-empty array",
      );
    }

    const invoice = await Invoice.findByPk(invoice_id, {
      transaction: t,
    });

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const invoiceItems = await InvoiceItem.findAll({
      where: {
        invoice_id,
      },
      transaction: t,
    });

    const existingIds = new Set(invoiceItems.map((item) => Number(item.id)));

    // Make sure every item belongs to this invoice
    for (const item of items) {
      if (!existingIds.has(Number(item.id))) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invoice item ${item.id} does not belong to this invoice`,
        );
      }
    }

    // Save new order
    for (let index = 0; index < items.length; index++) {
      await InvoiceItem.update(
        {
          sort_order: index + 1,
        },
        {
          where: {
            id: items[index].id,
            invoice_id,
          },
          transaction: t,
        },
      );
    }

    await t.commit();

    return {
      success: true,
      message: "Invoice items reordered successfully",
    };
  } catch (error) {
    await t.rollback();

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const REQUIRED_CSV_HEADERS = ["invoice_number", "client_name", "billing_date"];
const DATE_FIELDS = [
  "billing_date",
  "service_start",
  "service_end",
  "due_date",
  "signing_date",
];
const ISO_DATE_FORMAT = "YYYY-MM-DD";
const DOCS_DIR = path.resolve(__dirname, "../../../public/uploads/docs");
const PUBLIC_DOCS_BASE = "https://node.socialsanitation.com/api/v1/docs/";

const cleanText = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim().replace(/\s+/g, " ");

const isValidIsoDate = (value) =>
  moment(value, ISO_DATE_FORMAT, true).isValid();

const safeUnlink = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (_) {
    // File already gone or never written. Nothing to do.
  }
};

const importHistoricalInvoicesCSV = async (fileBuffer) => {
  if (!fileBuffer || !fileBuffer.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "CSV file is required");
  }

  let records;
  try {
    records = parse(fileBuffer.toString("utf-8"), {
      // Header names are matched case-insensitively and with spaces trimmed
      columns: (header) => header.map((h) => cleanText(h).toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (e) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid CSV: ${e.message}`);
  }

  if (!records.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "CSV file is empty");
  }

  const headers = Object.keys(records[0]);
  const missingHeaders = REQUIRED_CSV_HEADERS.filter(
    (h) => !headers.includes(h),
  );
  if (missingHeaders.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Missing required column(s): ${missingHeaders.join(", ")}`,
    );
  }

  const imported = [];
  const skipped = []; // invoice number already exists in the system
  const unmatched = []; // client not found, or matches more than one profile
  const errors = []; // bad data in the row
  const seenInFile = new Set();

  for (let index = 0; index < records.length; index++) {
    const row = records[index];
    const rowNumber = index + 2; // header is row 1

    const invoiceNumber = cleanText(row.invoice_number);
    const clientName = cleanText(row.client_name);
    const billingDate = cleanText(row.billing_date);

    if (!invoiceNumber) {
      errors.push({
        row: rowNumber,
        invoice_number: null,
        message: "invoice_number is required",
      });
      continue;
    }

    if (!clientName) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "client_name is required",
      });
      continue;
    }

    if (!billingDate) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "billing_date is required",
      });
      continue;
    }

    const badDateField = DATE_FIELDS.find((field) => {
      const value = cleanText(row[field]);
      return value && !isValidIsoDate(value);
    });

    if (badDateField) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: `${badDateField} must be a real date in YYYY-MM-DD format`,
      });
      continue;
    }

    // Same invoice number twice inside one file
    if (seenInFile.has(invoiceNumber)) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "invoice_number appears more than once in this file",
      });
      continue;
    }
    seenInFile.add(invoiceNumber);

    try {
      /* ---------- ALREADY IMPORTED? SKIP, DON'T DUPLICATE ---------- */

      const existing = await Invoice.findOne({
        where: { ref_no: invoiceNumber },
        attributes: ["id"],
      });

      if (existing) {
        skipped.push({
          row: rowNumber,
          invoice_number: invoiceNumber,
          client_name: clientName,
          reason: "Already exists, skipped",
        });
        continue;
      }

      /* ---------- MATCH CLIENT: active users only ---------- */

      // Start from User so is_active can be checked. Profile is joined through
      // the existing `user_profile` association, the same one used elsewhere.
      const matches = await User.findAll({
        attributes: ["id", "is_active"],
        include: [
          {
            model: Profile,
            as: "user_profile",
            attributes: ["name"],
            required: true,
            where: Sequelize.where(
              Sequelize.fn(
                "LOWER",
                Sequelize.fn("TRIM", Sequelize.col("user_profile.name")),
              ),
              clientName.toLowerCase(),
            ),
          },
        ],
      });

      // Distinct active users only. Several profile rows for one user count as one.
      const activeUserIds = [
        ...new Set(matches.filter((u) => u.is_active).map((u) => u.id)),
      ];

      if (activeUserIds.length !== 1) {
        let reason;

        if (activeUserIds.length > 1) {
          reason = "Name belongs to more than one active client account";
        } else if (matches.length > 0) {
          reason = "Client account is inactive";
        } else {
          reason = "Client not found";
        }

        unmatched.push({
          row: rowNumber,
          invoice_number: invoiceNumber,
          client_name: clientName,
          reason,
        });
        continue;
      }

      const userId = activeUserIds[0];

      /* ---------- CREATE INVOICE ---------- */

      const serviceStart = cleanText(row.service_start);
      const serviceEnd = cleanText(row.service_end);

      const invoice = await Invoice.create({
        user_id: userId,
        is_historical: true,
        client_name: null,
        ref_no: invoiceNumber,
        custom_ref_no: null,
        ref_type: null,
        event_name: null,
        service_dates:
          serviceStart && serviceEnd ? `${serviceStart} - ${serviceEnd}` : null,
        billing_date: billingDate,
        date: cleanText(row.signing_date) || null, // existing `date` field = signing date
        due_date: cleanText(row.due_date) || null,
        to_company_name: clientName,
        address_1: cleanText(row.address_1) || null,
        address_2: cleanText(row.address_2) || null,
        total_due: 0,
        payment_url: null,
        square_payment_link_id: null,
        signature: null,
        payment_status: "NOT_PAID",
        last_sent_at: null,
        scheduled_send_at: null,
        status: "ACTIVE",
        pdf_url: null,
        is_active: true,
      });

      imported.push({
        row: rowNumber,
        invoice_id: invoice.id,
        invoice_number: invoice.ref_no,
        client_name: clientName,
        user_id: userId,
        billing_date: invoice.billing_date,
      });
    } catch (rowError) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: rowError.message,
      });
    }
  }

  return {
    success: true,
    message: `Imported ${imported.length} of ${records.length} invoice(s)`,
    data: {
      total_rows: records.length,
      imported_count: imported.length,
      skipped_count: skipped.length,
      unmatched_count: unmatched.length,
      error_count: errors.length,
      invoices: imported,
      skipped,
      unmatched,
      errors,
    },
  };
};

const uploadHistoricalInvoicePDF = async (invoice_id, file) => {
  try {
    if (!file) {
      throw new ApiError(httpStatus.BAD_REQUEST, "PDF file is required");
    }

    const isPdf =
      file.mimetype === "application/pdf" &&
      (file.originalname || "").toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      await safeUnlink(file.path);
      throw new ApiError(httpStatus.BAD_REQUEST, "Only PDF files are allowed");
    }

    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      await safeUnlink(file.path);
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    if (!invoice.is_historical) {
      await safeUnlink(file.path);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "PDF upload is only available for CSV-imported invoices",
      );
    }

    const newFileName = file.filename || path.basename(file.path);
    const publicUrl = `${PUBLIC_DOCS_BASE}${newFileName}`;

    // Replacing a PDF: remove the previous upload so old files don't pile up
    if (invoice.pdf_url && invoice.pdf_url !== publicUrl) {
      const oldFileName = path.basename(invoice.pdf_url);
      if (oldFileName.startsWith("docs-")) {
        await safeUnlink(path.join(DOCS_DIR, oldFileName));
      }
    }

    await invoice.update({ pdf_url: publicUrl });

    return {
      success: true,
      message: "Historical invoice PDF uploaded successfully",
      data: {
        invoice_id: invoice.id,
        pdf_url: publicUrl,
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const sendDueBalancesCron = async () => {
  try {
    const nowNY = moment().tz(timezone);
    const todayNY = nowNY.format("YYYY-MM-DD");

    // The balance email must never be sent before 9:00 AM New York time.
    const nineAM = nowNY.clone().hour(9).minute(0).second(0).millisecond(0);

    if (nowNY.isBefore(nineAM)) {
      console.log("Balance cron skipped: it is before 9:00 AM New York time.");
      return;
    }

    const invoices = await Invoice.findAll({
      where: {
        status: "ACTIVE",
        is_active: true,
        deposit_required: true,
        payment_stage: "DEPOSIT_PAID",
        balance_sent_at: null,

        // The selected balance due date must have arrived.
        balance_due_date: {
          [Op.lte]: todayNY,
        },
      },
    });

    console.log(
      `Balances eligible to send after 9 AM: ${invoices.length}`,
    );

    for (const invoice of invoices) {
      try {
        // Recheck the current database state before sending.
        const currentInvoice = await Invoice.findByPk(invoice.id);

        if (
          !currentInvoice ||
          !currentInvoice.is_active ||
          currentInvoice.status !== "ACTIVE" ||
          !currentInvoice.deposit_required ||
          currentInvoice.payment_stage !== "DEPOSIT_PAID" ||
          currentInvoice.balance_sent_at ||
          !currentInvoice.balance_due_date ||
          moment
            .tz(currentInvoice.balance_due_date, "YYYY-MM-DD", true, timezone)
            .isAfter(todayNY, "day")
        ) {
          continue;
        }

        await sendInvoiceBalance(currentInvoice.id);

        console.log(
          `Balance sent for invoice ${currentInvoice.ref_no}`,
        );
      } catch (err) {
        console.error(
          `Balance failed for invoice ${invoice.ref_no}:`,
          err.message,
        );
      }
    }
  } catch (error) {
    console.error("sendDueBalancesCron error:", error);
  }
};



module.exports = {
  createInvoice,
  getInvoiceById,
  getInvoicesByUserId,
  updateInvoice,
  getAllInvoices,
  getNextInvoiceRef,
  deleteInvoice,
  sendInvoiceCron,
  sendInvoiceBalance,
  getMonthlyAllInvoicesSummary,
  markInvoicePaidByCheck,
  markInvoicePaidByACH,
  getBusinessAnalytics,
  generateRecurringInvoicesCron,
  getUpcomingInvoices,
  reorderInvoiceItems,
  importHistoricalInvoicesCSV,
  uploadHistoricalInvoicePDF,
  sendDueBalancesCron
};
