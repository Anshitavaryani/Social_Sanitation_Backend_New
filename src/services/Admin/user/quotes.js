// Admin user service: service quotes and drafts, their PDFs and payment links, and marking them booked or paid

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { docUrl } = require("../../../config/storage");
const { invoicePaymentStatusTypes, jobStatusTypes, quoteStatusTypes } = require("../../../config/types");
const { Op } = require("sequelize");
const path = require("path");
const { User, Profile, QuoteItem, ServiceQuote, Invoice } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { sendEmailWithPDF } = require("../../Common/email.service");
const { generateQuotePDF } = require("../../Common/pdf.service");
const { generateSquarePaymentLink, deleteSquarePaymentLink } = require("../../Common/square.service");
const sendSMS = require("../../../config/sendSMS");

const submitServiceQuote = async (reqBody) => {
  try {
    const {
      quote_id, // optional now
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
      cc_email,
    } = reqBody;

    /* ================= USER ================= */
    const userDocs = await User.findOne({
      where: { id: user_id },
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const userProfile = await Profile.findOne({
      where: { user_id },
    });

    /*
     * ================= CC EMAIL =================
     *
     * If cc_email is provided in the Service Quote request:
     * - normalize it
     * - save it in User table
     * - use it for this quote
     *
     * If cc_email is not provided:
     * - use the already saved cc_email from User table
     */
    let finalCcEmail = userDocs.cc_email || null;

    if (cc_email !== undefined && cc_email !== null) {
      const normalizedCcEmail = cc_email.trim().toLowerCase();

      finalCcEmail = normalizedCcEmail || null;

      await userDocs.update({
        cc_email: finalCcEmail,
      });
    }

    const mobile = userProfile?.mobile;
    const clientName = userProfile?.name;

    let finalRefNo = ref_no;

    // Auto-generate ONLY if empty
    if (!finalRefNo) {
      const generated = await getNextQuoteRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    const existingQuote = await ServiceQuote.findOne({
      where: {
        is_active: true,
        ref_no: finalRefNo,
        ...(quote_id && {
          id: {
            [Op.ne]: quote_id,
          },
        }),
      },
    });

    if (existingQuote) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Reference number already exists.",
      );
    }

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return sum + quantity * unit_price * multiplier;
    }, 0);

    if (total_due <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Total must be > 0");
    }

    /* ================= PAYMENT ================= */

    const { paymentUrl, paymentLinkId } = await generateSquarePaymentLink({
      amount: total_due,
      refNo: finalRefNo,
      customerEmail: userDocs.email,
      user_id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    let quote;

    /* ================= CASE 1: UPDATE DRAFT ================= */

    if (quote_id) {
      quote = await ServiceQuote.findOne({
        where: {
          id: quote_id,
          user_id,
          status: quoteStatusTypes.DRAFT,
        },
      });

      if (!quote) {
        throw new ApiError(httpStatus.NOT_FOUND, "Draft quote not found");
      }

      await quote.update({
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        total_due,
        date,
        signature,
        square_payment_url: paymentUrl,
        square_payment_link_id: paymentLinkId,
        expires_at: expiresAt,
        job_status: jobStatusTypes.NOT_BOOKED,
        payment_status: invoicePaymentStatusTypes.NOT_PAID,
        status: quoteStatusTypes.SAVED,
      });

      await QuoteItem.destroy({
        where: {
          quote_id: quote.id,
        },
      });
    } else {
      /* ================= CASE 2: CREATE NEW ================= */

      quote = await ServiceQuote.create({
        user_id,
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        total_due,
        date,
        signature,
        square_payment_url: paymentUrl,
        square_payment_link_id: paymentLinkId,
        expires_at: expiresAt,
        job_status: jobStatusTypes.NOT_BOOKED,
        payment_status: invoicePaymentStatusTypes.NOT_PAID,
        status: quoteStatusTypes.SAVED,
      });
    }

    /* ================= QUOTE ITEMS ================= */

    const itemPayload = items.map((item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);
      const amount = quantity * unit_price * multiplier;

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity: Number(item.quantity || 1),
        sqft: item.calculation_type === "sqft" ? multiplier : null,
        hour: item.calculation_type === "hour" ? multiplier : null,
        calculation_type: item.calculation_type,
        unit_price,
        amount,
        quote_id: quote.id,
      };
    });

    await QuoteItem.bulkCreate(itemPayload);

    /* ================= PDF + EMAIL ================= */

    const pdfPath = await generateQuotePDF({
      ...reqBody,
      ref_no: finalRefNo,
      total_due,
      quote_id: quote.id,
      square_payment_url: paymentUrl,
    });

    const pdfFileName = path.basename(pdfPath);

    const pdfPublicUrl = docUrl(pdfFileName);

    await quote.update({
      pdf_url: pdfPublicUrl,
    });

    /*
     * Send quote email.
     *
     * finalCcEmail comes from:
     * 1. Newly supplied cc_email, OR
     * 2. Previously saved User.cc_email
     */
    await sendEmailWithPDF(userDocs.email, pdfPath, clientName, finalCcEmail);

    /* ================= SMS ================= */

    if (mobile) {
      const smsText = `Social Sanitation:
Your service quote is ready.

View & download:
${pdfPublicUrl}

Ref #: ${finalRefNo}`;

      try {
        const smsResponse = await sendSMS({
          to: mobile,
          message: smsText,
        });

        logger.info("SMS sent:", smsResponse.sid);
      } catch (err) {
        logger.error("SMS failed:", err.message);
      }
    }


    return {
      success: true,
      message: "Quote saved and sent",
      data: {
        quote_id: quote.id,
        status: quoteStatusTypes.SAVED,
      },
    };
  } catch (error) {
    logger.error("submitServiceQuote failed:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Something went wrong",
    );
  }
};

const getLatestDraftQuote = async (userId) => {
  try {
    const draft = await ServiceQuote.findOne({
      where: {
        user_id: userId,
        status: quoteStatusTypes.DRAFT,
      },
      order: [["updated_at", "DESC"]],
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
    });

    return draft;
  } catch (err) {
    throw ApiError.orInternal(err);
  }
};

const getAllDraftQuotesByUser = async (userId) => {
  try {
    const drafts = await ServiceQuote.findAll({
      where: {
        user_id: userId,
        status: quoteStatusTypes.DRAFT,
      },
      attributes: ["id", "ref_type", "ref_no", "updated_at"],
      order: [["updated_at", "DESC"]],
    });

    return drafts;
  } catch (err) {
    throw ApiError.orInternal(err);
  }
};

const deleteDraftQuote = async (id) => {
  const quote = await ServiceQuote.findOne({
    where: { id, status: quoteStatusTypes.DRAFT },
  });

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Draft not found");
  }

  await QuoteItem.destroy({ where: { quote_id: id } });
  await quote.destroy();
};

const saveDraftQuote = async (reqBody) => {
  try {
    const {
      quote_id,
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    let finalRefNo = ref_no;

    if (!user_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "user_id is required");
    }
    if (!finalRefNo && ref_type) {
      const generated = await getNextQuoteRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    const existingQuote = await ServiceQuote.findOne({
      where: {
        is_active: true,
        ref_no: finalRefNo,
        ...(quote_id && {
          id: {
            [Op.ne]: quote_id,
          },
        }),
      },
    });

    if (existingQuote) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Reference number already exists.",
      );
    }

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return sum + quantity * unit_price * multiplier;
    }, 0);

    let quote;

    if (quote_id) {
      quote = await ServiceQuote.findOne({
        where: { id: quote_id, status: quoteStatusTypes.DRAFT },
      });
      if (!quote) {
        throw new ApiError(httpStatus.NOT_FOUND, "Draft not found");
      }

      await quote.update({
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        date,
        signature,
        total_due, // ✅
      });

      await QuoteItem.destroy({ where: { quote_id: quote.id } });
    } else {
      quote = await ServiceQuote.create({
        user_id,
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        date,
        signature,
        total_due, // ✅
        status: quoteStatusTypes.DRAFT,
      });
    }

    if (items.length) {
      await QuoteItem.bulkCreate(
        items.map((item) => {
          const unit_price = Number(item.unit_price || 0);
          const quantity = Number(item.quantity || 1);

          let multiplier = 1;

          if (item.calculation_type === "hour") {
            multiplier =
              !item.hour || item.hour === "N/A" || isNaN(item.hour)
                ? 1
                : Number(item.hour);
          } else {
            multiplier =
              !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
                ? 1
                : Number(item.sqft);
          }

          return {
            quote_id: quote.id,
            description: item.description,
            frequency: item.frequency || null,
            quantity,
            sqft: item.calculation_type === "sqft" ? multiplier : null,
            hour: item.calculation_type === "hour" ? multiplier : null,
            calculation_type: item.calculation_type,
            unit_price,
            amount: quantity * unit_price * multiplier,
          };
        }),
      );
    }

    return {
      success: true,
      message: "Draft saved successfully",
      data: { quote_id: quote.id },
    };
  } catch (err) {
    logger.error("saveDraftQuote error:", err);

    if (err instanceof ApiError) {
      throw err;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      err.message || "Something went wrong",
    );
  }
};

const deleteQuote = async (quoteId) => {
  try {
    const quote = await ServiceQuote.findByPk(quoteId);

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
    }

    /* ========================================= */
    /* DELETE SQUARE PAYMENT LINK */
    /* ========================================= */

    if (quote.square_payment_link_id) {
      try {
        await deleteSquarePaymentLink(quote.square_payment_link_id);
      } catch (err) {
        logger.warn("Failed to delete Square payment link:", err.message);
      }
    }

    /* ========================================= */
    /* DETACH INVOICE */
    /* ========================================= */

    if (quote.invoice_id) {
      await Invoice.update(
        {
          quote_id: null,
        },
        {
          where: {
            id: quote.invoice_id,
          },
        },
      );
    }

    /* ========================================= */
    /* CLEAR PAYMENT LINK DATA */
    /* ========================================= */

    await quote.update({
      square_payment_url: null,

      square_payment_link_id: null,
    });

    /* ========================================= */
    /* SOFT DELETE QUOTE */
    /* ========================================= */

    await quote.destroy();

    return {
      success: true,

      message: "Quote deleted successfully",
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getNextQuoteRef = async (ref_type) => {
  try {
    if (!ref_type) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ref_type is required");
    }

    const quotes = await ServiceQuote.findAll({
      where: {
        is_active: true,
      },
      attributes: ["ref_no"],
      raw: true,
    });

    let maxNumber = 0;

    for (const quote of quotes) {
      const match = quote.ref_no?.match(/\d+$/);

      if (!match) continue;

      const number = Number(match[0]);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }

    const nextNumber = maxNumber + 1;


    return {
      ref_no: `${ref_type}${nextNumber}`,
      sequence: nextNumber,
    };
  } catch (err) {
    throw ApiError.orInternal(err);
  }
};

const getServiceQuotesByUserId = async (id) => {
  try {
    // Fetch all quotes for the user, including related items
    const quotes = await ServiceQuote.findAll({
      where: { user_id: id, is_active: true, status: quoteStatusTypes.SAVED },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    if (!quotes || quotes.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No quotes found for this user");
    }

    return quotes;
  } catch (error) {
    logger.error("getServiceQuotesByUser error:", error);
    throw ApiError.orInternal(error);
  }
};

const getServiceQuoteById = async (id) => {
  try {
    const quote = await ServiceQuote.findOne({
      where: {
        id,
        is_active: true,
      },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
    });

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Quote not found");
    }

    return quote;
  } catch (error) {
    logger.error("getServiceQuoteById:", error);
    throw ApiError.orInternal(error);
  }
};

const editServiceQuote = async (reqBody) => {
  try {
    const {
      quote_id,
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    const quote = await ServiceQuote.findOne({
      where: {
        id: quote_id,
        user_id,
        is_active: true,
      },
    });

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Quote not found");
    }

    const userDocs = await User.findOne({
      where: { id: user_id },
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const userProfile = await Profile.findOne({
      where: { user_id },
    });

    const mobile = userProfile?.mobile;
    const clientName = userProfile?.name;

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      return sum + Number(item.quantity || 1) * unit_price * multiplier;
    }, 0);

    const { paymentUrl, paymentLinkId } = await generateSquarePaymentLink({
      amount: total_due,
      refNo: ref_no,
      customerEmail: userDocs.email,
      user_id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await quote.update({
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,
      square_payment_url: paymentUrl,
      square_payment_link_id: paymentLinkId,
      expires_at: expiresAt,
      payment_status: invoicePaymentStatusTypes.NOT_PAID,
      job_status: jobStatusTypes.NOT_BOOKED,
      status: quoteStatusTypes.SAVED,
    });

    /* ================= DELETE OLD ITEMS ================= */

    await QuoteItem.destroy({
      where: {
        quote_id,
      },
    });

    /* ================= INSERT NEW ITEMS ================= */

    const itemPayload = items.map((item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity,
        sqft: item.calculation_type === "sqft" ? multiplier : null,
        hour: item.calculation_type === "hour" ? multiplier : null,
        calculation_type: item.calculation_type,
        unit_price,
        amount: quantity * unit_price * multiplier,
        quote_id,
      };
    });

    await QuoteItem.bulkCreate(itemPayload);

    /* ================= PDF ================= */

    const pdfPath = await generateQuotePDF({
      ...reqBody,
      quote_id,
      total_due,
      square_payment_url: paymentUrl,
    });

    const pdfFileName = path.basename(pdfPath);

    const pdfPublicUrl = docUrl(pdfFileName);

    await quote.update({
      pdf_url: pdfPublicUrl,
    });

    await sendEmailWithPDF(userDocs.email, pdfPath, clientName);

    if (mobile) {
      try {
        await sendSMS({
          to: mobile,
          message: `Social Sanitation:

Your updated service quote is ready.

View & download:
${pdfPublicUrl}

Ref #: ${ref_no}`,
        });
      } catch (err) {
        logger.error("editServiceQuote failed:", err);
      }
    }

    return {
      success: true,
      message: "Service Quote updated successfully",
      data: quote,
    };
  } catch (error) {
    logger.error("editServiceQuote failed:", error);
    throw ApiError.orInternal(error);
  }
};

const markQuoteAsBooked = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (quote.job_status === jobStatusTypes.EXPIRED) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Expired quotes cannot be booked",
    );
  }

  await quote.update({
    job_status: jobStatusTypes.BOOKED,
    payment_status: invoicePaymentStatusTypes.NOT_PAID,
  });

  return {
    success: true,
    message: "Quote marked as BOOKED",
    data: {
      id: quote.id,
      job_status: quote.job_status,
      payment_status: quote.payment_status,
    },
  };
};

const markQuoteAsCheckPaid = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (
    quote.payment_status === invoicePaymentStatusTypes.PAID ||
    quote.payment_status === invoicePaymentStatusTypes.CHECK_PAID
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Quote is already marked as paid",
    );
  }

  /* ================= DELETE SQUARE LINK ================= */

  if (quote.square_payment_link_id) {
    try {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    } catch (err) {
      logger.warn("Failed to delete Square link:", err.message);
    }
  }

  /* ================= UPDATE QUOTE ================= */

  await quote.update({
    payment_status: invoicePaymentStatusTypes.CHECK_PAID,

    paid_at: new Date(),

    square_payment_url: null,

    square_payment_link_id: null,

    job_status: quote.job_status === jobStatusTypes.NOT_BOOKED ? jobStatusTypes.BOOKED : quote.job_status,
  });

  return {
    success: true,

    message: "Quote marked as PAID BY CHECK",

    data: {
      id: quote.id,

      job_status:
        quote.job_status === jobStatusTypes.NOT_BOOKED ? jobStatusTypes.BOOKED : quote.job_status,

      payment_status: invoicePaymentStatusTypes.CHECK_PAID,
    },
  };
};

const markQuoteAsACHPaid = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (
    quote.payment_status === invoicePaymentStatusTypes.PAID ||
    quote.payment_status === invoicePaymentStatusTypes.CHECK_PAID ||
    quote.payment_status === invoicePaymentStatusTypes.CASH_PAID ||
    quote.payment_status === invoicePaymentStatusTypes.ACH_PAID
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Quote is already marked as paid",
    );
  }

  /* ================= DELETE SQUARE LINK ================= */

  if (quote.square_payment_link_id) {
    try {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    } catch (err) {
      logger.warn("Failed to delete Square link:", err.message);
    }
  }

  /* ================= UPDATE QUOTE ================= */

  await quote.update({
    payment_status: invoicePaymentStatusTypes.ACH_PAID,

    paid_at: new Date(),

    square_payment_url: null,

    square_payment_link_id: null,

    job_status: quote.job_status === jobStatusTypes.NOT_BOOKED ? jobStatusTypes.BOOKED : quote.job_status,
  });

  return {
    success: true,

    message: "Quote marked as paid by ACH",

    data: {
      id: quote.id,

      job_status:
        quote.job_status === jobStatusTypes.NOT_BOOKED ? jobStatusTypes.BOOKED : quote.job_status,

      payment_status: invoicePaymentStatusTypes.ACH_PAID,
    },
  };
};

const expireQuotesJob = async () => {
  const expiredQuotes = await ServiceQuote.findAll({
    where: {
      job_status: jobStatusTypes.NOT_BOOKED,
      expires_at: { [Op.lt]: new Date() },
    },
  });

  for (const quote of expiredQuotes) {
    if (quote.square_payment_link_id) {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    }

    await quote.update({
      job_status: jobStatusTypes.EXPIRED,
      // square_payment_url: null,
      // square_payment_link_id: null,
    });
  }
};

module.exports = {
  submitServiceQuote,
  getLatestDraftQuote,
  getAllDraftQuotesByUser,
  deleteDraftQuote,
  getNextQuoteRef,
  saveDraftQuote,
  getServiceQuotesByUserId,
  getServiceQuoteById,
  editServiceQuote,
  expireQuotesJob,
  markQuoteAsBooked,
  markQuoteAsCheckPaid,
  deleteQuote,
  markQuoteAsACHPaid,
};
