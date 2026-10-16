// Service estimate service: estimates, their PDFs (and the scope of work PDF), DocuSign signing and the rate table

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { UPLOAD_DIRS, docUrl } = require("../../../config/storage");
const { COMPANY, STAFF } = require("../../../config/company");
const { contractStatusTypes } = require("../../../config/types");
const path = require("path");
const fs = require("fs");
const { generateEstimatePDF, generateScopeOfWorkPdfBuffer } = require("../../Common/estimatePdf.service");
const { User, ServiceEstimate, Profile, BDMUser, Admin, ClientChecklist } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { formatUsd } = require("../../../utils/money");
const { resendSigningEmail } = require("../../Common/docusignSigning.service");
const { createEnvelope } = require("../../Common/docusignEnvelope.service");
const { getUserScopeView } = require("./userScope");

const RATE_MATRIX = {
  small: {
    // 1000–5999
    buff: 0.28,
    acid: 0.3,
    carpet: 0.33,
    strip: 0.38,
    initial: 0.09,
    deep: 0.11,
  },
  medium: {
    // 6000–15999
    buff: 0.27,
    acid: 0.29,
    carpet: 0.32,
    strip: 0.37,
    initial: 0.08,
    deep: 0.1,
  },
  large: {
    // 16000+
    buff: 0.25,
    acid: 0.27,
    carpet: 0.3,
    strip: 0.36,
    initial: 0.07,
    deep: 0.09,
  },
};

const getRates = (sqft) => {
  if (sqft >= 16000) return RATE_MATRIX.large;
  if (sqft >= 6000) return RATE_MATRIX.medium;
  return RATE_MATRIX.small;
};

const generateEstimatePDFService = async (reqBody) => {
  try {
    const {
      user_id,
      client_company_name,
      address_line_1,
      address_line_2,
      city,
      state,
      zip,

      contact_name,
      contact_phone,
      contact_fax,
      contact_email,

      signed_date,
      frequency = "Bi-Weekly",
      signature,
    } = reqBody;

    if (!client_company_name) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Client company name is required",
      );
    }

    /* ================= USER ================= */
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

    const checklist = await ClientChecklist.findOne({
      where: { user_id },
      order: [["created_at", "DESC"]],
    });

    const estimatedSqft = checklist?.estimated_sqft || 0;

    const rates = getRates(estimatedSqft);

    const services = [
      // ✅ SQFT BASED
      {
        name: "High-Speed Buff",
        frequency: "Per 3 Months",
        rate: rates.buff,
        minSqft: 300,
      },
      {
        name: "Acid Wash",
        frequency: "Per 3 Months",
        rate: rates.acid,
        minSqft: 300,
      },
      {
        name: "Carpet Extraction",
        frequency: "Per 3 Months",
        rate: rates.carpet,
        minSqft: 400,
      },
      {
        name: "Strip & Wax",
        frequency: "Per 6 Months",
        rate: rates.strip,
        minSqft: 500,
      },
      {
        name: "Initial Clean",
        frequency: "<30 days / 1 Time Clean",
        rate: rates.initial,
        minSqft: 1200,
      },
      {
        name: "Deep Clean",
        frequency: ">30 Days",
        rate: rates.deep,
        minSqft: 1200,
      },

      // ✅ STATIC
      {
        name: "Refrigerator Deep Clean",
        frequency: "Monthly / Weekly",
        startingAt: "$60.00 / Month",
        minimumCharge: "$24.00 / Week",
      },
      {
        name: "Oven Deep Clean",
        frequency: "Per Month",
        startingAt: "$50.00",
        minimumCharge: "$50.00",
      },
      {
        name: "Paper Products, Toiletries",
        frequency: "Per Month",
        startingAt: "As Needed",
        minimumCharge: "Inventory Pricing",
      },
      {
        name: "Trash Bags, and Misc.",
        frequency: "Per Month",
        startingAt: "As Needed",
        minimumCharge: "Inventory Pricing",
      },
    ];

    const finalServices = services.map((s) => {
      if (s.rate) {
        return {
          name: s.name,
          frequency: s.frequency,
          startingAt: `$${s.rate} per s/f`,
          minimumCharge: formatUsd(s.rate * s.minSqft),
        };
      }

      return s;
    });

    const bdmMapping = await BDMUser.findOne({
      where: { user_id },
    });

    let bdmName = STAFF.ESTIMATE_CONTACT.NAME;
    let bdmEmail = STAFF.ESTIMATE_CONTACT.EMAIL;
    let bdmPhone = COMPANY.PHONE;

    if (bdmMapping) {
      const bdm = await Admin.findOne({
        where: { id: bdmMapping.bdm_id },
        attributes: ["name", "email", "mobile"],
      });

      if (bdm) {
        bdmName = bdm.name;
        bdmEmail = bdm.email;
        bdmPhone = bdm.mobile || COMPANY.PHONE;
      }
    }

    /* ================= FILE NAME ================= */
    const safeClientName = client_company_name
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase();

    const fileName = `Social-Sanitation-Service-Estimate-${safeClientName}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    /* ================= SCOPE OF WORK ================= */

    // Get the client's type
    const user = await User.findByPk(user_id, {
      attributes: ["id", "client_type"],
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const clientType = String(user.client_type || "commercial").toLowerCase();

    if (!["commercial", "residential"].includes(clientType)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid client type");
    }

    // Fetch the existing Scope of Work for this client.
    // getUserScopeView must filter using this client's type.
    const scopeResult = await getUserScopeView(user_id);
    const scopeSections = scopeResult?.data || [];

    const cleanScopeSections = scopeSections.map((section) => ({
      title: section.title,
      is_red: section.is_red,
      items: (section.items || []).map((item) => ({
        description: item.description,
        is_daily: !!item.is_daily,
        is_weekly: !!item.is_weekly,
        is_monthly: !!item.is_monthly,
      })),
    }));


    /* ================= GENERATE PDF ================= */
    await generateEstimatePDF(
      {
        client_company_name,
        client_name: userDocs.user_profile.name,
        address_line_1,
        address_line_2,
        city,
        state,
        zip,
        contact_name,
        contact_phone,
        contact_fax,
        contact_email,

        signed_date,
        signature,

        scopeSections: cleanScopeSections,
        frequency,

        bdmName,
        bdmEmail,
        bdmPhone,
        extendedServices: finalServices,
      },
      pdfPath,
    );
    const signerName = STAFF.ESTIMATE_CONTACT.NAME;
    const envelopeId = await createEnvelope({
      pdfPath,
      signerEmail: userDocs.email,
      signerName: signerName,
    });

    const publicUrl = docUrl(fileName);

    const estimate = await ServiceEstimate.create({
      user_id,

      client_company_name,

      address_line_1,
      address_line_2,
      city,
      state,
      zip,

      contact_name,
      contact_phone,
      contact_fax,
      contact_email,

      signed_date,
      frequency,

      signature,

      client_email: userDocs.email,

      file_name: fileName,
      file_url: publicUrl,

      docusign_envelope_id: envelopeId,

      status: contractStatusTypes.PENDING_SIGNATURE,
      scope_sections: cleanScopeSections,
    });

    return {
      success: true,
      data: {
        id: estimate.id,
      },
    };
  } catch (error) {
    logger.error("generateEstimatePDFService failed:", error);

    throw ApiError.orInternal(error);
  }
};

const downloadScopeOfWorkPdfService = async (userId) => {
  try {
    const userDocs = await User.findOne({
      where: { id: userId },
      include: [{ model: Profile, as: "user_profile" }],
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    /*
     * READ ONLY — same rule as generateEstimatePDFService above.
     * Do NOT call getUserScope(), only getUserScopeView().
     */
    const scopeResult = await getUserScopeView(userId);
    const scopeSections = scopeResult?.data || [];

    const cleanScopeSections = scopeSections.map((section) => ({
      title: section.title,
      is_red: section.is_red,
      items: (section.items || []).map((item) => ({
        description: item.description,
        is_daily: !!item.is_daily,
        is_weekly: !!item.is_weekly,
        is_monthly: !!item.is_monthly,
      })),
    }));

    const clientName = userDocs.user_profile?.name || "Client";

    const safeClientName = clientName
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase();

    // Timestamp keeps concurrent downloads for different users (or repeat
    // downloads for the same user) from overwriting the same file on disk.
    const fileName = `Scope-of-Work-${safeClientName}-${Date.now()}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    const pdfBuffer = await generateScopeOfWorkPdfBuffer({
      client_name: clientName,
      scopeSections: cleanScopeSections,
      frequency: "Bi-Weekly",
    });

    // Write to disk exactly like the full estimate PDF does — this is what
    // lets it be served back out as a plain static file below, sidestepping
    // every blob/interceptor issue that came from streaming a raw buffer
    // through a custom response handler.
    fs.writeFileSync(pdfPath, pdfBuffer);

    const fileUrl = docUrl(fileName);

    return { fileUrl, fileName };
  } catch (error) {
    logger.error("downloadScopeOfWorkPdfService failed:", error);
    throw ApiError.orInternal(error);
  }
};

const getServiceEstimateById = async (id) => {
  try {
    const estimate = await ServiceEstimate.findOne({
      where: {
        id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    return estimate;
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getAllServiceEstimate = async () => {
  try {
    const userDoc = await ServiceEstimate.findAll({
      where: { is_active: true },
    });

    if (!userDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    return userDoc;
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getServiceEstimateByUserId = async (user_id) => {
  try {
    const estimates = await ServiceEstimate.findAll({
      where: {
        user_id,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return {
      success: true,
      data: estimates,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateServiceEstimate = async (reqBody) => {
  try {
    const {
      estimate_id,
      user_id,

      client_company_name,
      address_line_1,
      address_line_2,
      city,
      state,
      zip,

      contact_name,
      contact_phone,
      contact_fax,
      contact_email,

      signed_date,
      frequency,
      signature,
    } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
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

    /* ================= CHECKLIST ================= */

    const checklist = await ClientChecklist.findOne({
      where: { user_id },
      order: [["created_at", "DESC"]],
    });

    const estimatedSqft = checklist?.estimated_sqft || 0;

    // Get the current scope based on the latest Initial Client Chart.
    // This is READ-ONLY and does not generate a new scope.
    const scopeResult = await getUserScopeView(user_id);
    const currentScopeSections = scopeResult?.data || [];

    const rates = getRates(estimatedSqft);

    const services = [
      {
        name: "High-Speed Buff",
        frequency: "Per 3 Months",
        rate: rates.buff,
        minSqft: 300,
      },
      {
        name: "Acid Wash",
        frequency: "Per 3 Months",
        rate: rates.acid,
        minSqft: 300,
      },
      {
        name: "Carpet Extraction",
        frequency: "Per 3 Months",
        rate: rates.carpet,
        minSqft: 400,
      },
      {
        name: "Strip & Wax",
        frequency: "Per 6 Months",
        rate: rates.strip,
        minSqft: 500,
      },
      {
        name: "Initial Clean",
        frequency: "<30 days / 1 Time Clean",
        rate: rates.initial,
        minSqft: 1200,
      },
      {
        name: "Deep Clean",
        frequency: ">30 Days",
        rate: rates.deep,
        minSqft: 1200,
      },

      {
        name: "Refrigerator Deep Clean",
        frequency: "Monthly / Weekly",
        startingAt: "$60.00 / Month",
        minimumCharge: "$24.00 / Week",
      },
      {
        name: "Oven Deep Clean",
        frequency: "Per Month",
        startingAt: "$50.00",
        minimumCharge: "$50.00",
      },
      {
        name: "Paper Products, Toiletries",
        frequency: "Per Month",
        startingAt: "As Needed",
        minimumCharge: "Inventory Pricing",
      },
      {
        name: "Trash Bags, and Misc.",
        frequency: "Per Month",
        startingAt: "As Needed",
        minimumCharge: "Inventory Pricing",
      },
    ];

    const finalServices = services.map((s) => {
      if (s.rate) {
        return {
          name: s.name,
          frequency: s.frequency,
          startingAt: `$${s.rate} per s/f`,
          minimumCharge: formatUsd(s.rate * s.minSqft),
        };
      }

      return s;
    });

    const bdmMapping = await BDMUser.findOne({
      where: { user_id },
    });

    let bdmName = STAFF.ESTIMATE_CONTACT.NAME;
    let bdmEmail = STAFF.ESTIMATE_CONTACT.EMAIL;
    let bdmPhone = COMPANY.PHONE;

    if (bdmMapping) {
      const bdm = await Admin.findOne({
        where: { id: bdmMapping.bdm_id },
        attributes: ["name", "email", "mobile"],
      });

      if (bdm) {
        bdmName = bdm.name;
        bdmEmail = bdm.email;
        bdmPhone = bdm.mobile || COMPANY.PHONE;
      }
    }

    const safeClientName = client_company_name
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase();

    const fileName = `Social-Sanitation-Service-Estimate-${safeClientName}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateEstimatePDF(
      {
        client_company_name,
        client_name: userDocs.user_profile?.name || client_company_name,
        address_line_1,
        address_line_2,
        city,
        state,
        zip,

        contact_name,
        contact_phone,
        contact_fax,
        contact_email,

        signed_date,
        signature,

        scopeSections: currentScopeSections,
        frequency,

        bdmName,
        bdmEmail,
        bdmPhone,
        extendedServices: finalServices,
      },
      pdfPath,
    );

    const envelopeId = await createEnvelope({
      pdfPath,
      signerEmail: userDocs.email,
      signerName: userDocs.user_profile.name,
    });

    const publicUrl = docUrl(fileName);

    await estimate.update({
      client_company_name,

      signature,

      file_name: fileName,
      file_url: publicUrl,

      client_email: userDocs.email,

      docusign_envelope_id: envelopeId,

      status: contractStatusTypes.PENDING_SIGNATURE,

      signed_file_name: null,

      address_line_1,
      address_line_2,
      city,
      state,
      zip,

      contact_name,
      contact_phone,
      contact_fax,
      contact_email,

      signed_date,
      frequency,

      scope_sections: currentScopeSections,
    });

    await estimate.reload();

    return {
      success: true,
      message: "Service Estimate updated successfully.",
      data: estimate,
    };
  } catch (error) {
    logger.error("updateServiceEstimate failed:", error);

    throw ApiError.orInternal(error);
  }
};

const deleteServiceEstimate = async (id) => {
  try {
    const serviceDoc = await ServiceEstimate.findByPk(Number(id));

    if (!serviceDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    await serviceDoc.update({
      is_active: false,
      deleted_at: new Date(),
    });

    return {
      success: true,
      message: "Service Estimate deleted successfully",
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const resumeSigningService = async (estimateId) => {
  try {
    const estimate = await ServiceEstimate.findOne({
      where: { id: estimateId },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Estimate not found");
    }

    if (!estimate.docusign_envelope_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Envelope ID not found for this estimate",
      );
    }

    await resendSigningEmail(estimate.docusign_envelope_id);

    return {
      success: true,
      data: {
        signingUrl: null, // signing happens from the email DocuSign just sent again
        resent: true,
        sent_to: estimate.client_email,
      },
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  generateEstimatePDFService,
  downloadScopeOfWorkPdfService,
  getServiceEstimateById,
  getAllServiceEstimate,
  getServiceEstimateByUserId,
  updateServiceEstimate,
  resumeSigningService,
  deleteServiceEstimate,
};
