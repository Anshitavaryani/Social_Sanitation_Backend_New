// Invoice service: creating, editing, listing and deleting invoices, their numbers, item order and payments by check or ACH

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { docUrl } = require("../../../config/storage");
const { Op } = require("sequelize");
const {
  dayjs,
  inZone,
  dateInTz,
  zonedTimeToUtc,
  parseDateInZone,
  DATE_FORMAT,
} = require("../../../utils/time");
const {
  ServiceQuote,
  Invoice,
  QuoteItem,
  InvoiceItem,
  User,
  Profile,
  Payment,
  InvoiceRecurring,
} = require("../../../models");
const { generateInvoicePDF } = require("../pdf.service");
const ApiError = require("../../../utils/ApiError");
const toBoolean = require("../../../utils/toBoolean");
const { assertDepositPercent, roundMoney, splitDeposit } = require("../../../utils/money");
const { INVOICE } = require("../../../config/rules");
const { generateInvoicePaymentLink, deleteSquarePaymentLink } = require("../square.service");
const sequelize = require("../../../config/central.db");
const {
  paymentStatusTypes,
  invoicePaymentStageTypes,
  invoicePaymentStatusTypes,
  paymentPurposeTypes,
  recurringInvoiceStatusTypes,
} = require("../../../config/types");
const { timezone, nextBillingAfter } = require("./shared");

const MAX_RECURRING_OCCURRENCES = 10;

const MAX_RECURRING_MONTHS = 6;

// The number a line's quantity and unit price are multiplied by: its hours or square feet when it
// is priced that way ("N/A", empty or not a number count as 1)
const lineMultiplier = (item) => {
  if (item.calculation_type === "hour") {
    return !item.hour || item.hour === "N/A" || isNaN(item.hour) ? 1 : Number(item.hour);
  }
  if (item.calculation_type === "sqft") {
    return !item.sqft || item.sqft === "N/A" || isNaN(item.sqft) ? 1 : Number(item.sqft);
  }
  return 1;
};

// A Square link for an invoice payment of `amount`
const invoicePaymentLink = (invoice, user, amount, paymentPurpose) =>
  generateInvoicePaymentLink({
    amount,
    clientName: invoice.to_company_name,
    customerEmail: user?.email,
    user_id: invoice.user_id,
    invoice_id: invoice.id,
    invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
    paymentPurpose,
  });

// The invoice PDF with these items and payment link; resolves with its public URL
const invoicePdfUrl = async (invoice, items, paymentLink) => {
  const serviceParts = invoice.service_dates ? invoice.service_dates.split(" - ") : ["", ""];
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
    payment_link: paymentLink,
  });
  return docUrl(pdfPath.split("/").pop());
};

// ----- creating an invoice

// An invoice made from a quote: the quote (404 if missing, 400 if it already has an invoice), its
// items and its total
const quoteForInvoice = async (quote_id) => {
  const quote = await ServiceQuote.findByPk(quote_id);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  // Prevent duplicate invoice for same quote
  if (quote.invoice_created) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invoice already exists for this quote.");
  }

  const quoteItems = await QuoteItem.findAll({
    where: { quote_id },
    order: [["id", "ASC"]],
  });

  const items = quoteItems.map((item) => ({
    description: item.description,
    frequency: item.frequency,
    quantity: item.quantity,
    calculation_type: item.calculation_type,
    sqft: item.sqft,
    hour: item.hour,
    unit_price: Number(item.unit_price),
    amount: Number(item.amount),
  }));

  return { quote, items, total: Number(quote.total_due || 0) };
};

// Items typed in by hand, with their amounts, and their total
const manualInvoiceItems = (items) => {
  let total = 0;

  const lines = items.map((item) => {
    const unit_price = Number(item.unit_price || 0);
    const quantity = Number(item.quantity || 1);
    const multiplier = lineMultiplier(item);
    const amount = quantity * unit_price * multiplier;

    total += amount;

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

  return { items: lines, total };
};

// The deposit terms of a new invoice. A deposit needs a balance date after the billing date (400).
const newInvoiceDepositTerms = ({ deposit_required, deposit_percentage, balance_date, total, billingDate }) => {
  // The UI should send a real boolean. This also handles string values safely.
  const required = toBoolean(deposit_required);
  const percentage = required ? Number(deposit_percentage ?? INVOICE.DEFAULT_DEPOSIT_PERCENT) : 0;

  if (required) assertDepositPercent(percentage);

  const { deposit, balance } = required ? splitDeposit(total, percentage) : { deposit: null, balance: null };

  const balanceDueDate = required ? (balance_date ? inZone(balance_date, timezone).format(DATE_FORMAT) : null) : null;

  if (required && !balanceDueDate) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please select the date for the remaining balance.");
  }

  if (required && balanceDueDate <= billingDate) {
    throw new ApiError(httpStatus.BAD_REQUEST, "The balance date must be after the billing date.");
  }

  return {
    required,
    percentage,
    deposit,
    balance,
    balanceDueDate,
    stage: required ? invoicePaymentStageTypes.DEPOSIT_PENDING : invoicePaymentStageTypes.FULL,
    purpose: required ? paymentPurposeTypes.DEPOSIT : paymentPurposeTypes.FULL,
  };
};

// The recurring schedule of a new invoice: at most MAX_RECURRING_OCCURRENCES occurrences, ending at
// most MAX_RECURRING_MONTHS after its billing date
const createRecurringSchedule = async (invoice, { recurring_frequency, recurring_end_date, recurring_max_occurrences }) => {
  let finalEndDate = recurring_end_date;
  let finalMaxOccurrences = recurring_max_occurrences;

  if (finalMaxOccurrences != null) {
    finalMaxOccurrences = Math.max(1, Math.min(Number(finalMaxOccurrences), MAX_RECURRING_OCCURRENCES));
  }

  if (finalEndDate) {
    const maxEndDate = dayjs(invoice.billing_date).add(MAX_RECURRING_MONTHS, "months");

    if (dayjs(finalEndDate).isAfter(maxEndDate, "day")) {
      finalEndDate = maxEndDate.format(DATE_FORMAT);
    }
  }

  const nextBillingDate = nextBillingAfter(inZone(invoice.billing_date, timezone), recurring_frequency);

  await InvoiceRecurring.create({
    invoice_id: invoice.id,
    user_id: invoice.user_id,
    frequency: recurring_frequency,
    start_date: invoice.billing_date,
    end_date: finalEndDate ? inZone(finalEndDate, timezone).format(DATE_FORMAT) : null,
    max_occurrences: finalMaxOccurrences,
    occurrences_generated: 1,
    next_billing_date: nextBillingDate.format(DATE_FORMAT),
    auto_send: true,
    status: recurringInvoiceStatusTypes.ACTIVE,
  });
};

const createInvoice = async (reqBody) => {
  try {
    const {
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
      deposit_percentage = INVOICE.DEFAULT_DEPOSIT_PERCENT,
      balance_date,
    } = reqBody;

    // A quote's items and total, or the items typed in
    const fromQuote = quote_id ? await quoteForInvoice(quote_id) : null;
    const quote = fromQuote ? fromQuote.quote : null;
    const { items: finalItems, total: total_due } = fromQuote || manualInvoiceItems(items);

    const finalRefType = quote?.ref_type || ref_type || "RHK";
    const { ref_no: ref } = await getNextInvoiceRef(finalRefType);

    const eventName = event_name?.trim() || null;

    const finalBillingDate = billing_date ? inZone(billing_date, timezone).format(DATE_FORMAT) : null;

    const finalDueDate = quote
      ? quote.due_date
        ? inZone(quote.due_date, timezone).format(DATE_FORMAT)
        : null
      : due_date
        ? inZone(due_date, timezone).format(DATE_FORMAT)
        : null;

    // 9:00 AM New York on the billing date (exact on DST-change days too)
    const scheduledSendAt = finalBillingDate ? zonedTimeToUtc(finalBillingDate, "09:00:00", timezone).toDate() : null;

    if (is_recurring && !recurring_end_date && !recurring_max_occurrences) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Please provide either recurring_end_date or recurring_max_occurrences.");
    }

    const deposit = newInvoiceDepositTerms({ deposit_required, deposit_percentage, balance_date, total: total_due, billingDate: finalBillingDate });

    const invoice = await Invoice.create({
      user_id: quote ? quote.user_id : user_id,
      quote_id: quote ? quote.id : null,

      ref_type: finalRefType,
      ref_no: ref,
      custom_ref_no: custom_ref_no || null,
      event_name: eventName,

      scheduled_send_at: scheduledSendAt,

      service_dates: quote ? quote.service_dates : `${service_start} - ${service_end}`,

      billing_date: finalBillingDate,

      date: invoice_date ? inZone(invoice_date, timezone).format(DATE_FORMAT) : dateInTz(),

      due_date: finalDueDate,

      to_company_name: quote ? quote.to_company_name : to_company_name,
      address_1: quote ? quote.address_1 : address_1,
      address_2: quote ? quote.address_2 : address_2,

      total_due,

      // Deposit configuration
      deposit_required: deposit.required,
      deposit_percentage: deposit.required ? deposit.percentage : INVOICE.DEFAULT_DEPOSIT_PERCENT,
      deposit_amount: deposit.deposit,
      balance_amount: deposit.balance,
      payment_stage: deposit.stage,
      balance_due_date: deposit.balanceDueDate,

      deposit_paid_at: null,
      balance_sent_at: null,
      balance_paid_at: null,

      signature: quote ? quote.signature : signature,
    });

    logger.info("Invoice created:", invoice.id, invoice.ref_no);

    if (quote) {
      await quote.update({
        invoice_created: true,
        invoice_id: invoice.id,
      });
    }

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

    if (is_recurring) {
      await createRecurringSchedule(invoice, { recurring_frequency, recurring_end_date, recurring_max_occurrences });
    }

    // The link for the first payment (the deposit, or the whole total), then the PDF with it
    const user = await User.findByPk(invoice.user_id);
    const initialPaymentAmount = deposit.required ? Number(invoice.deposit_amount || 0) : Number(invoice.total_due || 0);
    const { paymentUrl } = await invoicePaymentLink(invoice, user, initialPaymentAmount, deposit.purpose);
    const publicUrl = await invoicePdfUrl(invoice, payload, paymentUrl);

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
    throw ApiError.from(error);
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
    throw ApiError.from(error);
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
    throw ApiError.orInternal(error);
  }
};

// ----- updating an invoice

// A stored date as YYYY-MM-DD, so values can be compared; anything else as it is
const normalizeDate = (value) => {
  if (!value) return null;

  const parsed = dayjs(value, DATE_FORMAT, true);

  return parsed.isValid() ? parsed.format(DATE_FORMAT) : value;
};

// The fields of an invoice item that decide whether the client needs the invoice again
const comparableItem = (item) => ({
  id: item.id,
  description: item.description,
  frequency: item.frequency,
  quantity: Number(item.quantity || 1),
  calculation_type: item.calculation_type,
  sqft: item.sqft,
  hour: item.hour,
  unit_price: Number(item.unit_price || 0),
  amount: Number(item.amount || 0),
});

// The client, date and reference fields the request sends; the others keep their value
const invoiceDetailsUpdate = (invoice, body) => {
  const { billing_date, date, due_date, service_start, service_end, to_company_name, address_1, address_2, custom_ref_no, event_name } = body;

  return {
    billing_date:
      billing_date !== undefined
        ? billing_date
          ? inZone(billing_date, timezone).format(DATE_FORMAT)
          : null
        : invoice.billing_date,

    custom_ref_no: custom_ref_no !== undefined ? custom_ref_no : invoice.custom_ref_no,

    event_name: event_name !== undefined ? event_name?.trim() || null : invoice.event_name,

    date:
      date !== undefined
        ? date
          ? inZone(date, timezone).format(DATE_FORMAT)
          : null
        : invoice.date,

    due_date:
      due_date !== undefined
        ? due_date
          ? inZone(due_date, timezone).format(DATE_FORMAT)
          : null
        : invoice.due_date,

    service_dates:
      service_start !== undefined || service_end !== undefined
        ? service_start && service_end
          ? `${service_start} - ${service_end}`
          : invoice.service_dates
        : invoice.service_dates,

    to_company_name: to_company_name !== undefined ? to_company_name : invoice.to_company_name,

    address_1: address_1 !== undefined ? address_1 : invoice.address_1,

    address_2: address_2 !== undefined ? address_2 : invoice.address_2,
  };
};

// Saves the request's items: the ones with a known id are edited, the others added, and (only when
// the request sends items) the ones left out are removed. Without items the current ones are kept
// and recalculated. Resolves with the new total.
const saveInvoiceItems = async (invoice, body, items, t) => {
  const existingItems = invoice.service_invoice_item || [];
  const existingMap = new Map();

  existingItems.forEach((item) => {
    existingMap.set(String(item.id), item);
  });

  const itemsToProcess = body.items === undefined ? existingItems.map((item) => item.get({ plain: true })) : items;

  if (!Array.isArray(itemsToProcess)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "items must be an array.");
  }

  let total_due = 0;
  const processedIds = [];

  for (const item of itemsToProcess) {
    const quantity = Number(item.quantity || 1);
    const unit_price = Number(item.unit_price || 0);

    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unit_price) || unit_price < 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid invoice item quantity or unit price.");
    }

    const multiplier = lineMultiplier(item);
    const amount = quantity * unit_price * multiplier;
    total_due += amount;

    const values = {
      description: item.description,
      frequency: item.frequency,
      quantity,
      calculation_type: item.calculation_type,
      sqft: item.calculation_type === "sqft" ? multiplier : null,
      hour: item.calculation_type === "hour" ? multiplier : null,
      unit_price,
      amount,
    };

    if (item.id && existingMap.has(String(item.id))) {
      await existingMap.get(String(item.id)).update(values, { transaction: t });
      processedIds.push(String(item.id));
    } else {
      const newItem = await InvoiceItem.create({ invoice_id: invoice.id, ...values }, { transaction: t });
      processedIds.push(String(newItem.id));
    }
  }

  if (body.items !== undefined) {
    for (const dbItem of existingItems) {
      if (!processedIds.includes(String(dbItem.id))) {
        await dbItem.destroy({ transaction: t });
      }
    }
  }

  return total_due;
};

// The total and deposit fields after the update. A deposit needs a balance date (YYYY-MM-DD) after
// the billing date, and once a payment has been made the total and the deposit terms can't change
// here (400).
const updatedPaymentTerms = (invoice, { deposit_required, deposit_percentage, balance_date, billing_date }, finalTotalDue) => {
  const shouldUseDeposit = deposit_required !== undefined ? toBoolean(deposit_required) : Boolean(invoice.deposit_required);

  const percentage = shouldUseDeposit
    ? Number(
        deposit_percentage !== undefined && deposit_percentage !== null && deposit_percentage !== ""
          ? deposit_percentage
          : invoice.deposit_percentage || INVOICE.DEFAULT_DEPOSIT_PERCENT,
      )
    : 0;

  if (shouldUseDeposit) assertDepositPercent(percentage);

  // The frontend sends "balance_date"; the database field is "balance_due_date".
  const requestedBalanceDate = balance_date !== undefined ? balance_date : invoice.balance_due_date;

  let finalBalanceDueDate = null;

  if (shouldUseDeposit) {
    if (!requestedBalanceDate) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Please select the date for the remaining balance.");
    }

    const parsedBalanceDate = dayjs(requestedBalanceDate, DATE_FORMAT, true);

    if (!parsedBalanceDate.isValid()) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Please provide a valid balance due date in ${DATE_FORMAT} format.`);
    }

    finalBalanceDueDate = parsedBalanceDate.format(DATE_FORMAT);

    const effectiveBillingDate = billing_date !== undefined ? billing_date : invoice.billing_date;

    if (effectiveBillingDate) {
      const parsedBillingDate = dayjs(effectiveBillingDate, DATE_FORMAT, true);

      if (!parsedBillingDate.isValid()) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Please provide a valid billing date in ${DATE_FORMAT} format.`);
      }

      if (parsedBalanceDate.isSameOrBefore(parsedBillingDate, "day")) {
        throw new ApiError(httpStatus.BAD_REQUEST, "The balance date must be after the billing date.");
      }
    }
  }

  // Do not change financial terms after payment has started.
  const paymentAlreadyStarted = [
    invoicePaymentStageTypes.DEPOSIT_PAID,
    invoicePaymentStageTypes.BALANCE_PENDING,
    invoicePaymentStageTypes.COMPLETED,
  ].includes(invoice.payment_stage);

  const financialTermsChanged =
    finalTotalDue !== Number(invoice.total_due || 0) ||
    shouldUseDeposit !== Boolean(invoice.deposit_required) ||
    (shouldUseDeposit && percentage !== Number(invoice.deposit_percentage || INVOICE.DEFAULT_DEPOSIT_PERCENT));

  if (paymentAlreadyStarted && financialTermsChanged) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This invoice has already received a payment or progressed to a later payment stage. Its total and deposit terms cannot be changed through this update.",
    );
  }

  const { deposit, balance } = shouldUseDeposit ? splitDeposit(finalTotalDue, percentage) : { deposit: null, balance: null };

  const terms = {
    total_due: finalTotalDue,
    deposit_required: shouldUseDeposit,
    deposit_percentage: shouldUseDeposit ? percentage : INVOICE.DEFAULT_DEPOSIT_PERCENT,
    deposit_amount: deposit,
    balance_amount: balance,
    balance_due_date: finalBalanceDueDate,
  };

  // Only invoices awaiting their initial payment can change stages here.
  const currentStage = invoice.payment_stage || invoicePaymentStageTypes.FULL;
  if (currentStage === invoicePaymentStageTypes.FULL || currentStage === invoicePaymentStageTypes.DEPOSIT_PENDING) {
    terms.payment_stage = shouldUseDeposit ? invoicePaymentStageTypes.DEPOSIT_PENDING : invoicePaymentStageTypes.FULL;
  }

  return terms;
};

// Creates, updates or cancels the invoice's recurring schedule. Without is_recurring the schedule
// stays as active as it was. Occurrences and the end date are capped as for a new invoice.
const saveRecurringSchedule = async (invoice, { is_recurring, recurring_frequency, recurring_end_date, recurring_max_occurrences, billing_date }, t) => {
  const recurring = await InvoiceRecurring.findOne({
    where: {
      invoice_id: invoice.id,
    },
    transaction: t,
  });

  const effectiveIsRecurring =
    is_recurring !== undefined ? toBoolean(is_recurring) : Boolean(recurring && recurring.status === recurringInvoiceStatusTypes.ACTIVE);

  if (!effectiveIsRecurring) {
    if (recurring) {
      await recurring.update({ status: recurringInvoiceStatusTypes.CANCELLED }, { transaction: t });
    }
    return;
  }

  if (!recurring_end_date && !recurring_max_occurrences && !recurring) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please provide either recurring_end_date or recurring_max_occurrences.");
  }

  let finalEndDate = recurring_end_date !== undefined ? recurring_end_date : recurring?.end_date || null;

  let finalMaxOccurrences = recurring_max_occurrences !== undefined ? recurring_max_occurrences : recurring?.max_occurrences || null;

  if (finalMaxOccurrences != null) {
    finalMaxOccurrences = Math.max(1, Math.min(Number(finalMaxOccurrences), MAX_RECURRING_OCCURRENCES));
  }

  const effectiveBillingDate = billing_date !== undefined ? billing_date : invoice.billing_date;

  if (!effectiveBillingDate) {
    throw new ApiError(httpStatus.BAD_REQUEST, "A billing date is required for a recurring invoice.");
  }

  if (finalEndDate) {
    const maxEndDate = inZone(effectiveBillingDate, timezone).add(MAX_RECURRING_MONTHS, "months");

    if (inZone(finalEndDate, timezone).isAfter(maxEndDate, "day")) {
      finalEndDate = maxEndDate.format(DATE_FORMAT);
    } else {
      finalEndDate = inZone(finalEndDate, timezone).format(DATE_FORMAT);
    }
  }

  const billingMoment = inZone(effectiveBillingDate, timezone);
  const nextBillingDate = nextBillingAfter(billingMoment, recurring_frequency || recurring?.frequency);

  const recurringPayload = {
    frequency: recurring_frequency || recurring?.frequency || "MONTHLY",
    start_date: billingMoment.format(DATE_FORMAT),
    end_date: finalEndDate,
    max_occurrences: finalMaxOccurrences,
    next_billing_date: nextBillingDate.format(DATE_FORMAT),
    status: recurringInvoiceStatusTypes.ACTIVE,
  };

  if (recurring) {
    await recurring.update(recurringPayload, { transaction: t });
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
};

// A new Square link for the payment the invoice is waiting for: the deposit, or the whole total.
// BALANCE_PENDING, DEPOSIT_PAID and COMPLETED get none. Resolves with the link to use.
const currentPaymentLink = async (invoice, user) => {
  let paymentAmount = null;
  let paymentPurpose = null;

  if (invoice.payment_stage === invoicePaymentStageTypes.DEPOSIT_PENDING) {
    paymentAmount = Number(invoice.deposit_amount || 0);
    paymentPurpose = paymentPurposeTypes.DEPOSIT;
  } else if (invoice.payment_stage === invoicePaymentStageTypes.FULL || !invoice.payment_stage) {
    paymentAmount = Number(invoice.total_due || 0);
    paymentPurpose = paymentPurposeTypes.FULL;
  }

  if (paymentAmount !== null && paymentAmount > 0 && paymentPurpose) {
    return (await invoicePaymentLink(invoice, user, paymentAmount, paymentPurpose)).paymentUrl;
  }

  return invoice.payment_url || null;
};

// Whether the client should get the invoice again: a client-facing value changed (dates, client,
// references, items, total or deposit terms). Compares values, not which fields were sent, so an
// edit form that sends every field does not count as a change.
const clientFacingChange = (updatedInvoice, originalInvoice, originalItems) => {
  const currentItems = (updatedInvoice.service_invoice_item || []).map(comparableItem).sort((a, b) => Number(a.id) - Number(b.id));
  const previousItems = [...originalItems].sort((a, b) => Number(a.id) - Number(b.id));
  const itemsActuallyChanged = JSON.stringify(currentItems) !== JSON.stringify(previousItems);

  return (
    normalizeDate(updatedInvoice.billing_date) !== normalizeDate(originalInvoice.billing_date) ||
    normalizeDate(updatedInvoice.due_date) !== normalizeDate(originalInvoice.due_date) ||
    normalizeDate(updatedInvoice.date) !== normalizeDate(originalInvoice.date) ||
    (updatedInvoice.service_dates || null) !== (originalInvoice.service_dates || null) ||
    (updatedInvoice.to_company_name || null) !== (originalInvoice.to_company_name || null) ||
    (updatedInvoice.address_1 || null) !== (originalInvoice.address_1 || null) ||
    (updatedInvoice.address_2 || null) !== (originalInvoice.address_2 || null) ||
    (updatedInvoice.custom_ref_no || null) !== (originalInvoice.custom_ref_no || null) ||
    (updatedInvoice.event_name || null) !== (originalInvoice.event_name || null) ||
    itemsActuallyChanged ||
    Number(updatedInvoice.total_due || 0) !== Number(originalInvoice.total_due || 0) ||
    Boolean(updatedInvoice.deposit_required) !== Boolean(originalInvoice.deposit_required) ||
    Number(updatedInvoice.deposit_percentage || INVOICE.DEFAULT_DEPOSIT_PERCENT) !==
      Number(originalInvoice.deposit_percentage || INVOICE.DEFAULT_DEPOSIT_PERCENT)
  );
};

// When the invoice email goes out again: 9:00 AM New York on a future billing date; for today or
// earlier, 9:00 AM if that is still ahead, otherwise in 30 minutes; never without a billing date.
// Clears last_sent_at so the email job sends it.
const resendSchedule = (billingDate) => {
  if (!billingDate) {
    return { scheduled_send_at: null, last_sent_at: null };
  }

  const now = dayjs().tz(timezone);
  const billingMoment = parseDateInZone(billingDate, timezone);

  if (!billingMoment.isValid()) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Please provide a valid billing date in ${DATE_FORMAT} format.`);
  }

  let scheduledSendAt;
  if (billingMoment.isSameOrBefore(now, "day")) {
    const nineAM = zonedTimeToUtc(billingMoment.format(DATE_FORMAT), "09:00:00", timezone);

    scheduledSendAt = billingMoment.isSame(now, "day") && now.isBefore(nineAM) ? nineAM.toDate() : now.clone().add(30, "minutes").toDate();
  } else {
    scheduledSendAt = zonedTimeToUtc(billingMoment.format(DATE_FORMAT), "09:00:00", timezone).toDate();
  }

  return { scheduled_send_at: scheduledSendAt, last_sent_at: null };
};

const updateInvoice = async (invoice_id, body) => {
  const t = await sequelize.transaction();

  try {
    const {
      items = [],
      deposit_required,
      deposit_percentage,
      is_recurring,
      // not sent: the schedule keeps its frequency, end date and maximum
      recurring_frequency,
      recurring_end_date,
      recurring_max_occurrences,
      balance_date,
      billing_date,
    } = body;

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

    // What the invoice was before the update: decides below whether the email goes out again
    const originalInvoice = invoice.get({ plain: true });
    const originalItems = (invoice.service_invoice_item || []).map(comparableItem);

    await invoice.update(invoiceDetailsUpdate(invoice, body), { transaction: t });

    // total_due always represents the complete invoice amount.
    const finalTotalDue = roundMoney(await saveInvoiceItems(invoice, body, items, t));

    await invoice.update(updatedPaymentTerms(invoice, { deposit_required, deposit_percentage, balance_date, billing_date }, finalTotalDue), {
      transaction: t,
    });

    await saveRecurringSchedule(invoice, { is_recurring, recurring_frequency, recurring_end_date, recurring_max_occurrences, billing_date }, t);

    await t.commit();

    // The saved invoice, with its items in order, for the new link and PDF
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
      throw new ApiError(httpStatus.NOT_FOUND, "Updated invoice could not be retrieved.");
    }

    const user = await User.findByPk(updatedInvoice.user_id);
    const paymentUrl = await currentPaymentLink(updatedInvoice, user);

    const updatePayload = {
      pdf_url: await invoicePdfUrl(updatedInvoice, updatedInvoice.service_invoice_item, paymentUrl),
    };

    // Do not erase a previously stored link if no new link was generated.
    if (paymentUrl) {
      updatePayload.payment_url = paymentUrl;
    }

    // The email goes out again only when something the client sees changed and the invoice still
    // waits for its first payment (changing balance_due_date alone does not resend it)
    const isInitialPaymentStage = [invoicePaymentStageTypes.FULL, invoicePaymentStageTypes.DEPOSIT_PENDING].includes(
      updatedInvoice.payment_stage || invoicePaymentStageTypes.FULL,
    );

    if (clientFacingChange(updatedInvoice, originalInvoice, originalItems) && isInitialPaymentStage) {
      Object.assign(updatePayload, resendSchedule(updatedInvoice.billing_date));
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

    throw ApiError.from(error);
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
    throw ApiError.orInternal(err);
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
    logger.error("getAllInvoices error:", error);

    throw ApiError.orInternal(error);
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
        logger.warn(
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
    throw ApiError.from(error);
  }
};

const markInvoicePaidByCheck = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const paidStatuses = [
      invoicePaymentStatusTypes.PAID,
      invoicePaymentStatusTypes.CHECK_PAID,
      invoicePaymentStatusTypes.CASH_PAID,
      invoicePaymentStatusTypes.ACH_PAID,
    ];

    if (
      paidStatuses.includes(invoice.payment_status) ||
      invoice.payment_stage === invoicePaymentStageTypes.COMPLETED
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invoice already paid",
      );
    }

    const now = new Date();

    const updatePayload = {
      payment_status: invoicePaymentStatusTypes.CHECK_PAID,
      payment_stage: invoicePaymentStageTypes.COMPLETED,
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
    throw ApiError.from(error);
  }
};

const markInvoicePaidByACH = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const paidStatuses = [
      invoicePaymentStatusTypes.PAID,
      invoicePaymentStatusTypes.CHECK_PAID,
      invoicePaymentStatusTypes.CASH_PAID,
      invoicePaymentStatusTypes.ACH_PAID,
    ];

    if (
      paidStatuses.includes(invoice.payment_status) ||
      invoice.payment_stage === invoicePaymentStageTypes.COMPLETED
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invoice already paid",
      );
    }

    const now = new Date();

    const updatePayload = {
      payment_status: invoicePaymentStatusTypes.ACH_PAID,
      payment_stage: invoicePaymentStageTypes.COMPLETED,
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
    throw ApiError.from(error);
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

    throw ApiError.from(error);
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
  markInvoicePaidByCheck,
  markInvoicePaidByACH,
  reorderInvoiceItems,
};
