// Service estimate service: contract agreements, their PDFs and DocuSign signing

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { UPLOAD_DIRS, docUrl } = require("../../../config/storage");
const { contractStatusTypes } = require("../../../config/types");
const path = require("path");
const fs = require("fs");
const { generateContractPDF } = require("../../Common/estimatePdf.service");
const { User, Profile, ContractAgreement } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { resendSigningEmail } = require("../../Common/docusignSigning.service");
const { createContractEnvelope } = require("../../Common/docusignEnvelope.service");
const { generateContractPaymentLink } = require("../../Common/square.service");

// contact agreement service

const generateContractAgreementService = async (reqBody) => {
  try {
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


    const fileName = `Contract-Agreement-${client_company_name}.pdf`;

    const pdfDir = UPLOAD_DIRS.docs;

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


    /* ===== DOCUSIGN ===== */

    const signerName = userDocs.user_profile.name || "Client";
    const envelopeId = await createContractEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });


    const publicUrl = docUrl(fileName);

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
      status: contractStatusTypes.PENDING_SIGNATURE,
    });

    return {
      success: true,
      data: {
        id: contract.id,
        // signingUrl,
      },
    };
  } catch (error) {
    throw ApiError.orInternal(error);
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
    throw ApiError.orInternal(error);
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

    const pdfDir = UPLOAD_DIRS.docs;

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

    /* ================= UPDATE RECORD ================= */

    /* ================= UPDATE RECORD ================= */

    const publicUrl = docUrl(fileName);

    await contract.update({
      client_name: signerName,
      client_email: userDocs.email,
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

      status: contractStatusTypes.PENDING_SIGNATURE,
    });

    await contract.reload();

    return {
      success: true,
      message: "Contract Agreement updated successfully.",
      data: contract,
    };
  } catch (error) {
    logger.error("updateContractAgreement failed:", error);
    throw ApiError.orInternal(error);
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
    throw ApiError.orInternal(error);
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
    throw ApiError.from(error);
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
  generateContractAgreementService,
  getAllContractAgreement,
  getContractAgreementById,
  updateContractAgreement,
  getContractAgreementByUserId,
  deleteContractAgreement,
  resumeContractAgreement,
};
