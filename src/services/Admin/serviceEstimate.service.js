/** @format */

const httpStatus = require("http-status");
const path = require("path");
const { Sequelize, Op } = require("sequelize");
const fs = require("fs");
const {
  generateEstimatePDF,
  generateContractPDF,
  generateScopeOfWorkPdfBuffer,
} = require("../../config/serviceEstimate");
const {
  User,
  ServiceEstimate,
  Profile,
  ContractAgreement,
  ScopeSection,
  ScopeItem,
  BDMUser,
  Admin,
  ClientChecklist,
  UserScopeItem,
  UserScopeSection,
  ClientChecklistDetail,
} = require("../../models");
const ApiError = require("../../utils/ApiError");
const { getSigningUrl } = require("../Common/docusignSigning.service");
const {
  createEnvelope,
  createContractEnvelope,
} = require("../Common/docusignEnvelope.service");
const { generateContractPaymentLink } = require("../Common/square.service");
const { sendContractReviewEmail } = require("../Common/email.service");

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
      bdm_id,

      contact_name,
      contact_phone,
      contact_fax,
      contact_email,

      signed_date,
      frequency = "Bi-Weekly",
      total_price = 0,
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
          minimumCharge: `$${(s.rate * s.minSqft).toFixed(2)}`,
        };
      }

      return s;
    });

    const bdmMapping = await BDMUser.findOne({
      where: { user_id },
    });

    let bdmName = "Marco Williams";
    let bdmEmail = "m.williams@socialsanitation.com";
    let bdmPhone = "(813) 296-9695";

    if (bdmMapping) {
      const bdm = await Admin.findOne({
        where: { id: bdmMapping.bdm_id },
        attributes: ["name", "email", "mobile"],
      });

      if (bdm) {
        bdmName = bdm.name;
        bdmEmail = bdm.email;
        bdmPhone = bdm.mobile || "(813) 296-9695";
      }
    }

    /* ================= FILE NAME ================= */
    const safeClientName = client_company_name
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase();

    const fileName = `Social-Sanitation-Service-Estimate-${safeClientName}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

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

    console.log(
      "CURRENT SCOPE DATA FOR PDF:",
      JSON.stringify(cleanScopeSections, null, 2),
    );

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
    const signerName = "Marco Williams";
    const envelopeId = await createEnvelope({
      pdfPath,
      signerEmail: userDocs.email,
      signerName: signerName,
    });

    // return { signingUrl };

    const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

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

      status: "pending_signature",
      scope_sections: cleanScopeSections,
    });

    return {
      success: true,
      data: {
        id: estimate.id,
      },
    };
  } catch (error) {
    console.error(error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

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

    const fileUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    return { fileUrl, fileName };
  } catch (error) {
    console.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
      scope_sections,
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
          minimumCharge: `$${(s.rate * s.minSqft).toFixed(2)}`,
        };
      }

      return s;
    });

    const bdmMapping = await BDMUser.findOne({
      where: { user_id },
    });

    let bdmName = "Marco Williams";
    let bdmEmail = "m.williams@socialsanitation.com";
    let bdmPhone = "(813) 296-9695";

    if (bdmMapping) {
      const bdm = await Admin.findOne({
        where: { id: bdmMapping.bdm_id },
        attributes: ["name", "email", "mobile"],
      });

      if (bdm) {
        bdmName = bdm.name;
        bdmEmail = bdm.email;
        bdmPhone = bdm.mobile || "(813) 296-9695";
      }
    }

    const safeClientName = client_company_name
      .replace(/[^a-zA-Z0-9]/g, "-")
      .toLowerCase();

    const fileName = `Social-Sanitation-Service-Estimate-${safeClientName}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

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

    const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    // await sendEstimateReviewEmail(
    //   userDocs.email,
    //   pdfPath,
    //   userDocs.user_profile.name,
    // );

    await estimate.update({
      client_company_name,

      signature,

      file_name: fileName,
      file_url: publicUrl,

      client_email: userDocs.email,

      docusign_envelope_id: envelopeId,

      status: "pending_signature",

      signed_file_name: null,
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

      scope_sections: currentScopeSections,
    });

    await estimate.reload();

    return {
      success: true,
      message: "Service Estimate updated successfully.",
      data: estimate,
    };
  } catch (error) {
    console.error(error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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

    const signerEmail = estimate.client_email;
    const signerName = "Marco Williams";

    const signingUrl = await getSigningUrl({
      envelopeId: estimate.docusign_envelope_id,
      signerEmail,
      signerName,
    });

    return {
      success: true,
      data: {
        signingUrl,
      },
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

// contact agreement service

const generateContractAgreementService = async (reqBody) => {
  try {
    console.log("REQ BODY:", reqBody);
    const {
      user_id,
      client_company_name,
      total_monthly_price,
      service_address,
      client_legal_name,
      client_representative,
      contract_date,
      signature,
    } = reqBody;

    const userDocs = await User.findOne({
      where: { id: user_id },
      include: [{ model: Profile, as: "user_profile" }],
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const { paymentUrl, paymentLinkId } = await generateContractPaymentLink({
      amount: total_monthly_price,
      clientName: client_legal_name,
      customerEmail: userDocs.email,
      user_id,
    });

    console.log(paymentUrl, "paymentUrl");

    const fileName = `Contract-Agreement-${client_company_name}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    /* ===== GENERATE PDF ===== */

    await generateContractPDF(
      {
        client_company_name,
        total_monthly_price,
        service_address,
        client_legal_name,
        client_representative,
        contract_date,
        paymentUrl,
        signature,
      },
      pdfPath,
    );

    console.log("reached here");

    /* ===== DOCUSIGN ===== */

    const signerName = userDocs.user_profile.name || "Client";
    console.log("ACCOUNT ID:", process.env.DOCUSIGN_ACCOUNT_ID);
    const envelopeId = await createContractEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    // await sendContractReviewEmail(userDocs.email, pdfPath, signerName);

    console.log(envelopeId, "envelopeId");

    const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    console.log({
      user_id,
      client_company_name,
      client_legal_name,
      client_representative,
      service_address,
      total_monthly_price,
      contract_date,
    });
    const contract = await ContractAgreement.create({
      user_id,

      client_company_name,
      client_legal_name,
      client_representative,
      service_address,

      total_monthly_price,
      contract_date,

      signature,

      client_name: signerName,
      client_email: userDocs.email,

      file_name: fileName,
      file_url: publicUrl,

      payment_url: paymentUrl,
      square_payment_link_id: paymentLinkId,

      docusign_envelope_id: envelopeId,
      status: "pending_signature",
    });

    return {
      success: true,
      data: {
        id: contract.id,
        // signingUrl,
      },
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllContractAgreement = async () => {
  try {
    const userDoc = await ContractAgreement.findAll({
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
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getContractAgreementById = async (id) => {
  const contract = await ContractAgreement.findOne({
    where: {
      id,
      is_active: true,
    },
  });

  if (!contract) {
    throw new ApiError(httpStatus.NOT_FOUND, "Contract Agreement not found");
  }

  return contract;
};

const updateContractAgreement = async (reqBody) => {
  try {
    const {
      contract_id,
      client_company_name,
      total_monthly_price,
      service_address,
      client_legal_name,
      client_representative,
      contract_date,
      signature,
    } = reqBody;

    /* ================= FIND CONTRACT ================= */

    const contract = await ContractAgreement.findOne({
      where: {
        id: contract_id,
        is_active: true,
      },
    });

    if (!contract) {
      throw new ApiError(httpStatus.NOT_FOUND, "Contract Agreement not found");
    }

    /* ================= USER ================= */

    const userDocs = await User.findOne({
      where: { id: contract.user_id },
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

    /* ================= NEW PAYMENT LINK ================= */

    const { paymentUrl, paymentLinkId } = await generateContractPaymentLink({
      amount: total_monthly_price,
      clientName: client_legal_name,
      customerEmail: userDocs.email,
      user_id: contract.user_id,
    });

    /* ================= PDF ================= */

    const fileName = `Contract-Agreement-${client_company_name}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateContractPDF(
      {
        client_company_name,
        total_monthly_price,
        service_address,
        client_legal_name,
        client_representative,
        contract_date,
        paymentUrl,
        signature,
      },
      pdfPath,
    );

    /* ================= DOCUSIGN ================= */

    const signerName = userDocs.user_profile?.name || "Client";

    const envelopeId = await createContractEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    // await sendContractReviewEmail(userDocs.email, pdfPath, signerName);

    /* ================= UPDATE RECORD ================= */

    /* ================= UPDATE RECORD ================= */

    const publicUrl = `https://node.socialsanitation.com/api/v1/docs/${fileName}`;

    await contract.update({
      client_company_name,
      client_legal_name,
      client_representative,
      service_address,
      total_monthly_price,
      contract_date,
      signature,

      file_name: fileName,
      file_url: publicUrl,

      payment_url: paymentUrl,
      square_payment_link_id: paymentLinkId,

      docusign_envelope_id: envelopeId,

      status: "pending_signature",
    });

    await contract.reload();

    return {
      success: true,
      message: "Contract Agreement updated successfully.",
      data: contract,
    };
  } catch (error) {
    console.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getContractAgreementByUserId = async (user_id) => {
  try {
    const contracts = await ContractAgreement.findAll({
      where: {
        user_id,
        is_active: true,
      },
      order: [["created_at", "DESC"]],
    });

    return {
      success: true,
      data: contracts,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteContractAgreement = async (id) => {
  try {
    const contract = await ContractAgreement.findOne({
      where: {
        id: Number(id),
        is_active: true,
      },
    });

    if (!contract) {
      throw new ApiError(httpStatus.NOT_FOUND, "Contract Agreement not found");
    }

    await contract.update({
      is_active: false,
      deleted_at: new Date(),
    });

    return {
      success: true,
      message: "Contract Agreement deleted successfully",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const resumeContractAgreement = async (estimateId) => {
  try {
    const estimate = await ContractAgreement.findOne({
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

    const signerEmail = "anshitavaryani@gmail.com";
    const signerName = "Marco Williams";

    const signingUrl = await getSigningUrl({
      envelopeId: estimate.docusign_envelope_id,
      signerEmail,
      signerName,
    });

    return {
      success: true,
      data: {
        signingUrl,
      },
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

// scope of work services

const createScopeSection = async (reqBody) => {
  try {
    const { title, is_red = false, client_type = "commercial" } = reqBody;

    if (!title) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Title is required");
    }

    if (!["commercial", "residential"].includes(client_type)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "client_type must be commercial or residential",
      );
    }

    // 🔥 AUTO ORDER
    const lastSection = await ScopeSection.findOne({
      where: {
        client_type,
        is_active: true,
      },
      order: [["order", "DESC"]],
    });
    const nextOrder = lastSection ? lastSection.order + 1 : 1;

    const section = await ScopeSection.create({
      title,
      order: nextOrder,
      is_red,
      client_type,
    });

    return { success: true, data: section };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateScopeSection = async (id, reqBody) => {
  try {
    const section = await ScopeSection.findByPk(id);
    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update(reqBody);

    return { success: true, data: section };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteScopeSection = async (id) => {
  try {
    const section = await ScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    // Store client type before soft deletion
    const clientType = section.client_type;

    // Soft delete section
    await section.update({ is_active: false });

    // Soft delete items belonging to this section
    await ScopeItem.update({ is_active: false }, { where: { section_id: id } });

    // Reorder only sections of the same client type
    const sections = await ScopeSection.findAll({
      where: {
        client_type: clientType,
        is_active: true,
      },
      order: [
        ["order", "ASC"],
        ["id", "ASC"],
      ],
    });

    for (let i = 0; i < sections.length; i++) {
      await sections[i].update({ order: i + 1 });
    }

    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createScopeItem = async (reqBody) => {
  try {
    const {
      scope_section_id,
      description,
      is_daily = false,
      is_weekly = false,
      is_monthly = false,
    } = reqBody;

    if (!scope_section_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "scope_section_id is required",
      );
    }

    if (!description) {
      throw new ApiError(httpStatus.BAD_REQUEST, "description is required");
    }

    const lastItem = await ScopeItem.findOne({
      where: { section_id: scope_section_id, is_active: true },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastItem ? lastItem.order + 1 : 1;

    const item = await ScopeItem.create({
      section_id: scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    });

    return { success: true, data: item };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateScopeItem = async (id, reqBody) => {
  try {
    const item = await ScopeItem.findByPk(id);
    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update(reqBody);

    return { success: true, data: item };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteScopeItem = async (id) => {
  try {
    const item = await ScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    const sectionId = item.section_id;

    // Soft delete
    await item.update({ is_active: false });

    // Reorder remaining active items in this section
    const items = await ScopeItem.findAll({
      where: {
        section_id: sectionId,
        is_active: true,
      },
      order: [["order", "ASC"]],
    });

    for (let i = 0; i < items.length; i++) {
      await items[i].update({ order: i + 1 });
    }

    return { success: true };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getScope = async (client_type = "commercial") => {
  try {
    if (!["commercial", "residential"].includes(client_type)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "client_type must be commercial or residential",
      );
    }

    const data = await ScopeSection.findAll({
      where: {
        client_type,
        is_active: true,
      },
      include: [
        {
          model: ScopeItem,
          as: "items",
          where: {
            is_active: true,
          },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: ScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    return { success: true, data };
  } catch (error) {
    if (error instanceof ApiError) throw error;

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getUserScope = async (user_id) => {
  try {
    // ============================================================
    // GET USER AND CLIENT TYPE
    // ============================================================
    const user = await User.findByPk(user_id);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
    }

    const clientType = String(
      user.client_type || "commercial",
    ).toLowerCase();

    if (!["commercial", "residential"].includes(clientType)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid client type");
    }

    // ============================================================
    // GET LATEST CLIENT CHECKLIST
    // ============================================================
    const checklist = await ClientChecklist.findOne({
      where: { user_id },
      order: [["created_at", "DESC"]],
    });

    if (!checklist) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please complete the Initial Client Chart before generating the Scope of Work.",
      );
    }

    const details = await ClientChecklistDetail.findAll({
      where: { checklist_id: checklist.id },
    });

    // Residential uses num_desks_trash_cans as its single
    // count field. Commercial retains its existing count fields.
    const hasValues = (detail) =>
      Number(detail.restrooms || 0) > 0 ||
      Number(detail.stalls || 0) > 0 ||
      Number(detail.sinks || 0) > 0 ||
      Number(detail.num_desks_trash_cans || 0) > 0;

    if (!details.some(hasValues)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please fill in the Initial Client Chart before generating the Scope of Work.",
      );
    }

    // Normalize titles and service-area labels for reliable matching.
    const normalize = (value) =>
      String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

    // ============================================================
    // GET ACTIVE MASTER SECTIONS FOR THIS CLIENT TYPE
    // ============================================================
    const masterSections = await ScopeSection.findAll({
      where: {
        client_type: clientType,
        is_active: true,
      },
      include: [
        {
          model: ScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: ScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    // ============================================================
    // COMMERCIAL MAPPINGS — PRESERVED
    // ============================================================
    const commercialSectionAreaMapping = {
      "GENERAL OFFICE AND COMMON AREAS": [
        "Office Areas",
        "Group / Common Rooms",
        "Classrooms / Conference Rooms",
      ],
      "BATHROOMS AND RESTROOM AREAS": ["Restrooms"],
      "KITCHEN AND BREAK AREAS": ["Kitchen Areas"],
      "HALLWAYS / LOBBY AREAS": ["Entrance / Lobby Areas"],
      "HALLWAYS / ALL AREAS": ["All Areas / Hallways"],
    };

    const commercialDirectRoomSections = {
      "Cubicle Areas": "CUBICLE AREAS",
      "Ballroom Area": "BALLROOM AREA",
      Conservatory: "CONSERVATORY",
      Salon: "SALON",
      "Pharmacy Room": "PHARMACY ROOM",
      "Mail Room": "MAIL ROOM",
    };

    // ============================================================
    // RESIDENTIAL MAPPINGS
    // Keys are master section titles.
    // Values are Initial Client Chart service_area values.
    // ============================================================
    const residentialSectionAreaMapping = {
      "Entrance / Lobby Areas": ["Entrance / Lobby Areas"],
      Bathrooms: ["Bathrooms"],
      Kitchen: ["Kitchen"],
      Bedrooms: ["Bedrooms"],
      "Dining Room": ["Dining Room"],
      "Living Room": ["Living Room"],
      Foyer: ["Foyer"],
    };

    const sectionAreaMapping =
      clientType === "commercial"
        ? commercialSectionAreaMapping
        : residentialSectionAreaMapping;

    const directRoomSections =
      clientType === "commercial"
        ? commercialDirectRoomSections
        : {};

    // Commercial dynamic sections keep using the existing template.
    const generalOfficeSection =
      clientType === "commercial"
        ? masterSections.find(
            (section) =>
              normalize(section.title) ===
              normalize("GENERAL OFFICE AND COMMON AREAS"),
          )
        : null;

    // ============================================================
    // FIND MASTER SECTIONS THAT MATCH THE CHECKLIST
    // ============================================================
    const allowedSections = masterSections.filter((section) => {
      return details.some((detail) => {
        if (!hasValues(detail)) {
          return false;
        }

        const mappedAreas = sectionAreaMapping[section.title] || [];

        if (
          mappedAreas.some(
            (area) => normalize(area) === normalize(detail.service_area),
          )
        ) {
          return true;
        }

        const directMatch = Object.entries(directRoomSections).find(
          ([area]) => normalize(area) === normalize(detail.service_area),
        );

        return (
          Boolean(directMatch) &&
          normalize(directMatch[1]) === normalize(section.title)
        );
      });
    });

    // ============================================================
    // GET EXISTING USER SECTIONS
    // ============================================================
    let existingSections = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
    });

    // ============================================================
    // CREATE OR REUSE USER SECTIONS AND POPULATE ITEMS
    // ============================================================
    for (const section of allowedSections) {
      // First look for a section already linked to this master section.
      let existingSection = existingSections.find(
        (item) =>
          Number(item.master_section_id) === Number(section.id),
      );

      // Reuse an old unlinked section when its title matches.
      if (!existingSection) {
        existingSection = existingSections.find(
          (item) =>
            !item.master_section_id &&
            normalize(item.title) === normalize(section.title),
        );
      }

      if (existingSection) {
        // Link legacy section records to the appropriate master section.
        if (!existingSection.master_section_id) {
          await existingSection.update({
            master_section_id: section.id,
            title: section.title,
            order: section.order,
            is_red: section.is_red,
          });
        }
      } else {
        existingSection = await UserScopeSection.create({
          user_id,
          master_section_id: section.id,
          title: section.title,
          order: section.order,
          is_red: section.is_red,
          is_active: true,
        });

        existingSections.push(existingSection);
      }

      const existingItems = await UserScopeItem.findAll({
        where: {
          user_scope_section_id: existingSection.id,
          is_active: true,
        },
      });

      for (const item of section.items || []) {
        const alreadyExists = existingItems.find(
          (existingItem) =>
            Number(existingItem.master_item_id) === Number(item.id),
        );

        if (!alreadyExists) {
          await UserScopeItem.create({
            user_scope_section_id: existingSection.id,
            master_item_id: item.id,
            description: item.description,
            is_daily: item.is_daily,
            is_weekly: item.is_weekly,
            is_monthly: item.is_monthly,
            order: item.order,
            is_active: true,
          });
        }
      }
    }

    // ============================================================
    // CREATE DYNAMIC SECTIONS FOR UNMAPPED SERVICE AREAS
    // ============================================================
    for (const detail of details) {
      if (!hasValues(detail) || !detail.service_area) {
        continue;
      }

      const isMapped =
        Object.values(sectionAreaMapping)
          .flat()
          .some(
            (area) => normalize(area) === normalize(detail.service_area),
          ) ||
        Object.keys(directRoomSections).some(
          (area) => normalize(area) === normalize(detail.service_area),
        );

      if (isMapped) {
        continue;
      }

      const dynamicTitle = detail.service_area.trim().toUpperCase();

      const existingDynamicSection = await UserScopeSection.findOne({
        where: {
          user_id,
          title: dynamicTitle,
          is_active: true,
        },
      });

      if (existingDynamicSection) {
        continue;
      }

      const lastSection = await UserScopeSection.findOne({
        where: { user_id },
        order: [
          ["order", "DESC"],
          ["id", "DESC"],
        ],
      });

      const nextOrder = lastSection
        ? Number(lastSection.order || 0) + 1
        : 1;

      const newSection = await UserScopeSection.create({
        user_id,
        title: dynamicTitle,
        order: nextOrder,
        is_red: false,
        is_active: true,
      });

      // Preserve the existing commercial behavior only.
      if (clientType === "commercial" && generalOfficeSection) {
        for (const item of generalOfficeSection.items || []) {
          await UserScopeItem.create({
            user_scope_section_id: newSection.id,
            master_item_id: item.id,
            description: item.description,
            is_daily: item.is_daily,
            is_weekly: item.is_weekly,
            is_monthly: item.is_monthly,
            order: item.order,
            is_active: true,
          });
        }
      }
    }

    // ============================================================
    // DEACTIVATE MASTER SECTIONS NO LONGER ALLOWED
    // Preserve custom/dynamic sections.
    // ============================================================
    existingSections = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
    });

    const allowedSectionIds = allowedSections.map((section) =>
      Number(section.id),
    );

    for (const existingSection of existingSections) {
      if (!existingSection.master_section_id) {
        continue;
      }

      if (
        !allowedSectionIds.includes(
          Number(existingSection.master_section_id),
        )
      ) {
        await UserScopeSection.update(
          { is_active: false },
          { where: { id: existingSection.id } },
        );

        await UserScopeItem.update(
          { is_active: false },
          {
            where: {
              user_scope_section_id: existingSection.id,
            },
          },
        );
      }
    }

    // ============================================================
    // RETURN FINAL USER SCOPE
    // ============================================================
    const finalData = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: UserScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    return {
      success: true,
      data: finalData,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getUserScopeView = async (userId) => {
  try {
    // ==========================================
    // GET CLIENT AND CLIENT TYPE
    // ==========================================
    const user = await User.findByPk(userId, {
      attributes: ["id", "client_type"],
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
    }

    const clientType = String(
      user.client_type || "commercial",
    ).toLowerCase();

    if (!["commercial", "residential"].includes(clientType)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid client type",
      );
    }

    // ==========================================
    // VERIFY INITIAL CLIENT CHART EXISTS
    // ==========================================
    const checklist = await ClientChecklist.findOne({
      where: {
        user_id: userId,
        is_active: true,
      },
    });

    if (!checklist) {
      return {
        success: true,
        data: [],
      };
    }

    // ==========================================
    // GET EXISTING USER SCOPE
    // ==========================================
    const sections = await UserScopeSection.findAll({
      where: {
        user_id: userId,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: {
            is_active: true,
          },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [
          {
            model: UserScopeItem,
            as: "items",
          },
          "order",
          "ASC",
        ],
      ],
    });

    // ==========================================
    // FIND MASTER-BACKED SECTIONS
    // ==========================================
    const masterSectionIds = [
      ...new Set(
        sections
          .filter(
            (section) =>
              section.master_section_id !== null &&
              section.master_section_id !== undefined,
          )
          .map((section) => Number(section.master_section_id)),
      ),
    ];

    let validMasterSectionIds = new Set();

    if (masterSectionIds.length > 0) {
      const matchingMasterSections = await ScopeSection.findAll({
        where: {
          id: {
            [Op.in]: masterSectionIds,
          },
          client_type: clientType,
          is_active: true,
        },
        attributes: ["id"],
      });

      validMasterSectionIds = new Set(
        matchingMasterSections.map((section) => Number(section.id)),
      );
    }

    // ==========================================
    // FILTER BY CLIENT TYPE
    // ==========================================
    const filteredSections = sections.filter((section) => {
      // Preserve custom sections that are not linked
      // to a master ScopeSection.
      if (
        section.master_section_id === null ||
        section.master_section_id === undefined
      ) {
        return true;
      }

      // Master-backed sections must match the client's type.
      return validMasterSectionIds.has(
        Number(section.master_section_id),
      );
    });

    return {
      success: true,
      data: filteredSections,
    };
  } catch (error) {
    console.error("Error getting user scope view:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
};

const checkUserScopeExists = async (userId) => {
  try {
    const scope = await UserScopeSection.findOne({
      where: {
        user_id: userId,
        is_active: true,
      },
      attributes: ["id"],
    });

    return {
      exists: !!scope,
    };
  } catch (error) {
    console.error("Error checking user scope:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
};

const updateUserScopeSection = async (id, reqBody) => {
  try {
    const section = await UserScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update(reqBody);

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createUserScopeItem = async (reqBody) => {
  try {
    const {
      user_scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
    } = reqBody;

    const lastItem = await UserScopeItem.findOne({
      where: {
        user_scope_section_id,
      },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastItem ? lastItem.order + 1 : 1;

    const item = await UserScopeItem.create({
      user_scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    });

    return {
      success: true,
      data: item,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateUserScopeItem = async (id, reqBody) => {
  try {
    const item = await UserScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update(reqBody);

    return {
      success: true,
      data: item,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteUserScopeItem = async (id) => {
  try {
    const item = await UserScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update({
      is_active: false,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createUserScopeSection = async (reqBody) => {
  try {
    const { user_id, title, is_red = false } = reqBody;

    const lastSection = await UserScopeSection.findOne({
      where: {
        user_id,
      },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastSection ? lastSection.order + 1 : 1;

    const section = await UserScopeSection.create({
      user_id,
      title,
      is_red,
      order: nextOrder,
    });

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteUserScopeSection = async (id) => {
  try {
    const section = await UserScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update({
      is_active: false,
    });

    await UserScopeItem.update(
      {
        is_active: false,
      },
      {
        where: {
          user_scope_section_id: id,
        },
      },
    );

    return {
      success: true,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const reorderUserScopeSections = async (reqBody) => {
  try {
    const { sections } = reqBody; // [{ id, order }, ...]
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "sections array is required");
    }

    await Promise.all(
      sections.map(({ id, order }) =>
        UserScopeSection.update({ order }, { where: { id } }),
      ),
    );

    return { success: true };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const reorderUserScopeItems = async (reqBody) => {
  try {
    const { items } = reqBody; // [{ id, order }, ...] — all from same section
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "items array is required");
    }

    await Promise.all(
      items.map(({ id, order }) =>
        UserScopeItem.update({ order }, { where: { id } }),
      ),
    );

    return { success: true };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getEstimateScope = async (estimate_id) => {
  try {
    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let scope = estimate.scope_sections || [];

    if (typeof scope === "string") {
      try {
        scope = JSON.parse(scope);
      } catch (e) {
        scope = [];
      }
    }

    return {
      success: true,
      data: scope,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createEstimateSection = async (reqBody, estimate_id) => {
  try {
    const { title, is_red = false } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }
    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    console.log("scope_sections raw:", estimate.scope_sections);
    console.log("typeof:", typeof estimate.scope_sections);
    console.log("isArray:", Array.isArray(estimate.scope_sections));

    const nextOrder =
      sections.length > 0
        ? Math.max(...sections.map((s) => s.order || 0)) + 1
        : 1;

    const newSection = {
      id: Date.now(),
      title,
      is_red,
      order: nextOrder,
      items: [],
    };

    sections.push(newSection);

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: newSection,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateEstimateSection = async (id, reqBody) => {
  try {
    const { estimate_id, title, is_red } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const section = sections.find((s) => Number(s.id) === Number(id));

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    if (title !== undefined) {
      section.title = title;
    }

    if (is_red !== undefined) {
      section.is_red = is_red;
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteEstimateSection = async (id, reqBody) => {
  try {
    const { estimate_id } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const sectionExists = sections.find((s) => Number(s.id) === Number(id));

    if (!sectionExists) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    const updatedSections = sections.filter((s) => Number(s.id) !== Number(id));

    await estimate.update({
      scope_sections: updatedSections,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createEstimateItem = async (reqBody, estimate_id) => {
  try {
    const {
      section_id,
      description,
      is_daily = false,
      is_weekly = false,
      is_monthly = false,
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

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const section = sections.find((s) => Number(s.id) === Number(section_id));

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    if (!section.items) {
      section.items = [];
    }

    const nextOrder =
      section.items.length > 0
        ? Math.max(...section.items.map((i) => i.order || 0)) + 1
        : 1;

    const newItem = {
      id: Date.now(),
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    };

    section.items.push(newItem);

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: newItem,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const updateEstimateItem = async (id, reqBody) => {
  try {
    const { estimate_id, description, is_daily, is_weekly, is_monthly } =
      reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    let updatedItem = null;

    for (const section of sections) {
      if (!section.items) continue;

      const item = section.items.find((i) => Number(i.id) === Number(id));

      if (item) {
        if (description !== undefined) {
          item.description = description;
        }

        if (is_daily !== undefined) {
          item.is_daily = is_daily;
        }

        if (is_weekly !== undefined) {
          item.is_weekly = is_weekly;
        }

        if (is_monthly !== undefined) {
          item.is_monthly = is_monthly;
        }

        updatedItem = item;
        break;
      }
    }

    if (!updatedItem) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: updatedItem,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteEstimateItem = async (id, reqBody) => {
  try {
    const { estimate_id } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    let itemFound = false;

    for (const section of sections) {
      if (!section.items) continue;

      const itemIndex = section.items.findIndex(
        (item) => Number(item.id) === Number(id),
      );

      if (itemIndex !== -1) {
        section.items.splice(itemIndex, 1);
        itemFound = true;
        break;
      }
    }

    if (!itemFound) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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

  generateContractAgreementService,
  getAllContractAgreement,
  getContractAgreementById,
  updateContractAgreement,
  getContractAgreementByUserId,
  deleteContractAgreement,
  resumeContractAgreement,

  createScopeSection,
  updateScopeSection,
  deleteScopeSection,
  createScopeItem,
  updateScopeItem,
  deleteScopeItem,
  getScope,

  getUserScope,
  getUserScopeView,
  checkUserScopeExists,
  updateUserScopeSection,
  createUserScopeItem,
  updateUserScopeItem,
  deleteUserScopeItem,
  createUserScopeSection,
  deleteUserScopeSection,
  reorderUserScopeSections,
  reorderUserScopeItems,

  getEstimateScope,
  createEstimateSection,
  updateEstimateSection,
  deleteEstimateSection,

  createEstimateItem,
  updateEstimateItem,
  deleteEstimateItem,
};
