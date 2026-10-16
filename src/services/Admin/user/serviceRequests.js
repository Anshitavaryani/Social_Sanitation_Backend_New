// Admin user service: service requests, their PDFs and DocuSign envelopes

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { UPLOAD_DIRS } = require("../../../config/storage");
const { invoicePaymentStatusTypes, jobStatusTypes, quoteStatusTypes } = require("../../../config/types");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs");
const { User, Profile } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { sendServiceRequestEmailWithPDF } = require("../../Common/email.service");
const { generateServiceRequestPDF } = require("../../Common/pdf.service");
const sequelize = require("../../../config/central.db");
const ServiceRequest = require("../../../models/serviceRequest.model");
const ServiceRequestQuoteItem = require("../../../models/serviceRequestQuoteItem.model");
const { createServiceRequestEnvelope } = require("../../Common/docusignEnvelope.service");

const submitServiceRequest = async (reqBody) => {
  try {
    const {
      user_id,
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;


    /* ================= USER ================= */
    const userDocs = await User.findOne({ where: { id: user_id } });
    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const signerName =
      userDocs.user_profile?.name || to_company_name || "Client";

    /* ================= REF NO ================= */
    let finalRefNo = ref_no;

    if (!finalRefNo) {
      const generated = await getNextServiceRequestRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    /* ================= TOTAL ================= */
    const total_due = items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 1);
      const unit_price = Number(item.unit_price || 0);

      const amount = quantity * unit_price;

      return sum + amount;
    }, 0);

    if (total_due <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Total must be > 0");
    }

    /* ================= CREATE SERVICE REQUEST ================= */
    const serviceRequest = await ServiceRequest.create({
      user_id,
      ref_type,
      ref_no: finalRefNo,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,
      job_status: jobStatusTypes.NOT_BOOKED,
      payment_status: invoicePaymentStatusTypes.NOT_PAID,
      status: quoteStatusTypes.SAVED,
    });

    /* ================= ITEMS ================= */
    const itemPayload = items.map((item) => {
      const quantity = Number(item.quantity || 1);
      const unit_price = Number(item.unit_price || 0);

      const amount = quantity * unit_price;

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity,
        unit_price,
        amount,
        service_request_id: serviceRequest.id,
      };
    });

    await ServiceRequestQuoteItem.bulkCreate(itemPayload);

    /* ================= PDF GENERATION ================= */

    const fileName = `service-request-${finalRefNo}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateServiceRequestPDF({
      ...reqBody,
      total_due,
      quote_id: serviceRequest.id,
      pdfPath, // make sure your generator supports this
    });

    await sendServiceRequestEmailWithPDF(userDocs.email, pdfPath, finalRefNo);

    /* ================= DOCUSIGN (CLIENT EMAIL FLOW) ================= */
    const envelopeId = await createServiceRequestEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    /* ================= SAVE ENVELOPE ================= */
    await serviceRequest.update({
      docusign_envelope_id: envelopeId,
    });

    return {
      success: true,
      message: "Service Request created and sent for signature",
      data: {
        quote_id: serviceRequest.id,
        status: quoteStatusTypes.SAVED,
      },
    };
  } catch (error) {
    logger.error("submitServiceRequest failed:", error);
    throw ApiError.orInternal(error);
  }
};

const getServiceRequestById = async (id) => {
  try {
    const request = await ServiceRequest.findOne({
      where: {
        id,
        is_active: true,
      },
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
      ],
    });

    if (!request) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    return request;
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const editServiceRequest = async (reqBody) => {
  try {
    const {
      request_id,
      user_id,
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    const request = await ServiceRequest.findOne({
      where: {
        id: request_id,
        is_active: true,
      },
    });

    if (!request) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    const userDocs = await User.findOne({
      where: { id: user_id },
      include: [
        {
          model: Profile,
          as: "user_profile",
        },
      ],
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const signerName =
      userDocs.user_profile?.name || to_company_name || "Client";

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      return sum + Number(item.amount || item.unit_price || 0);
    }, 0);

    /* ================= UPDATE REQUEST ================= */

    await request.update({
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,

      // reset signature status
      status: quoteStatusTypes.SAVED,
      docusign_envelope_id: null,
      signed_file_name: null,
      updated_at: new Date(),
    });

    /* ================= DELETE OLD ITEMS ================= */

    await ServiceRequestQuoteItem.destroy({
      where: {
        service_request_id: request.id,
      },
    });

    /* ================= CREATE NEW ITEMS ================= */

    await ServiceRequestQuoteItem.bulkCreate(
      items.map((item) => ({
        description: item.description,
        frequency: item.frequency || null,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        amount: Number(item.amount || item.unit_price || 0),
        service_request_id: request.id,
      })),
    );

    /* ================= REGENERATE PDF ================= */

    const fileName = `service-request-${request.ref_no}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateServiceRequestPDF({
      ...reqBody,
      total_due,
      quote_id: request.id,
      pdfPath,
    });

    await sendServiceRequestEmailWithPDF(
      userDocs.email,
      pdfPath,
      request.ref_no,
    );

    /* ================= SEND AGAIN TO DOCUSIGN ================= */

    const envelopeId = await createServiceRequestEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    await request.update({
      docusign_envelope_id: envelopeId,
      status: quoteStatusTypes.SAVED,
    });

    return {
      success: true,
      message: "Service Request updated successfully",
      data: request,
    };
  } catch (error) {
    logger.error("editServiceRequest failed:", error);
    throw ApiError.orInternal(error);
  }
};

const getNextServiceRequestRef = async (ref_type) => {
  try {
    if (!ref_type) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ref_type is required");
    }

    const lastQuote = await ServiceRequest.findOne({
      where: {
        // ref_type,
        user_id: { [Op.ne]: 1 }, // 🚫 exclude test user
      },
      order: [["created_at", "DESC"]],
      attributes: ["ref_no"],
    });

    let nextNumber = 1;

    if (lastQuote?.ref_no) {
      // extract numeric part: RM453 → 453
      const match = lastQuote.ref_no.match(/\d+$/);
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

const getAllServiceRequests = async ({ month } = {}) => {
  try {
    const where = {
      is_active: true,
    };

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

    const invoices = await ServiceRequest.findAll({
      where, // ✅ now using month filter
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
        {
          model: User,
          as: "request_user",
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

    if (!invoices || invoices.length === 0) {
      return []; // better than throwing error for empty month
    }

    return invoices;
  } catch (error) {
    logger.error("getAllInvoices error:", error);
    throw ApiError.orInternal(error);
  }
};

const getServiceRequestsByUserId = async (user_id) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return {
      success: true,
      data: requests,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteServiceRequest = async (serviceRequestId) => {
  const transaction = await sequelize.transaction();

  try {
    const serviceRequest = await ServiceRequest.findByPk(serviceRequestId, {
      transaction,
    });

    if (!serviceRequest) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    // Soft delete parent
    await serviceRequest.update({ is_active: false }, { transaction });

    // Soft delete all items
    await ServiceRequestQuoteItem.update(
      { is_active: false },
      {
        where: {
          service_request_id: serviceRequestId,
        },
        transaction,
      },
    );

    await transaction.commit();

    return {
      success: true,
      message: "Service Request deleted successfully",
    };
  } catch (error) {
    await transaction.rollback();

    throw ApiError.from(error);
  }
};

module.exports = {
  getAllServiceRequests,
  deleteServiceRequest,
  submitServiceRequest,
  getServiceRequestById,
  editServiceRequest,
  getServiceRequestsByUserId,
  getNextServiceRequestRef,
};
