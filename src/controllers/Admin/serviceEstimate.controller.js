/** @format */

const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { serviceEstimateService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");
const fs = require("fs");
const path = require("path");
const { ServiceEstimate, ContractAgreement, User } = require("../../models");
const {
  downloadSignedPDF,
} = require("../../services/Common/docusignDownload.service");
const { sendSignedServiceRequestEmailWithPDF } = require("../../services/Common/email.service");
const ServiceRequest = require("../../models/serviceRequest.model");

const generateEstimatePDFController = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.generateEstimatePDFService(
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "Service estimate PDF generated successfully.",
  );
});

const downloadScopeOfWorkPDFController = catchAsync(async (req, res) => {
  const { userId } = req.params;
 
  const response = await serviceEstimateService.downloadScopeOfWorkPdfService(
    userId,
  );
 
  return responseWrapper(
    res,
    response,
    "Scope of Work PDF generated successfully.",
  );
});

const getServiceEstimateById = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getServiceEstimateById(
    req.params.id,
  );
  return responseWrapper(
    res,
    response,
    "Service estimate fetched successfully",
  );
});

const getAllServiceEstimate = catchAsync(async (req, res) => {
  const users = await serviceEstimateService.getAllServiceEstimate(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const getServiceEstimateByUserId = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getServiceEstimateByUserId(
    req.params.user_id,
  );
  return responseWrapper(
    res,
    response,
    "Service estimate fetched successfully",
  );
});

const updateServiceEstimate = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateServiceEstimate(req.body);

  return responseWrapper(
    res,
    response,
    "Service estimate PDF updated successfully.",
  );
});

const resumeSigningService = catchAsync(async (req, res) => {
  const bookings = await serviceEstimateService.resumeSigningService(
    req.params.id,
  );
  return responseWrapper(res, bookings, "");
});

const deleteServiceEstimate = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteServiceEstimate(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});

const generateContractAgreementController = catchAsync(async (req, res) => {
  const response =
    await serviceEstimateService.generateContractAgreementService(req.body);

  return responseWrapper(
    res,
    response,
    "Contract agreement generated successfully.",
  );
});

const getAllContractAgreement = catchAsync(async (req, res) => {
  const users = await serviceEstimateService.getAllContractAgreement(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const getContractAgreementById = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getContractAgreementById(
    req.params.id,
  );
  return responseWrapper(
    res,
    response,
    "Contract agreement fetched successfully",
  );
});

const updateContractAgreement = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateContractAgreement(
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "Contract agreement updated successfully.",
  );
});

const getContractAgreementByUserId = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getContractAgreementByUserId(
    req.params.user_id,
  );
  return responseWrapper(
    res,
    response,
    "Contract agreement fetched successfully",
  );
});

const resumeContractAgreement = catchAsync(async (req, res) => {
  const bookings = await serviceEstimateService.resumeContractAgreement(
    req.params.id,
  );
  return responseWrapper(res, bookings, "");
});

const deleteContractAgreement = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteContractAgreement(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});

const handleDocusignWebhook = async (req, res) => {
  try {
    console.log("DOCUSIGN WEBHOOK PAYLOAD:");

    const envelopeId =
      req.body?.data?.envelopeId ||
      req.body?.envelopeId ||
      req.body?.data?.envelopeSummary?.envelopeId;
    const event =
      req.body?.event ||
      req.body?.eventType ||
      req.body?.data?.event ||
      req.body?.data?.envelopeSummary?.status;

    console.log("Envelope ID:", envelopeId);
    console.log("Event:", event);

    // 🔥 HANDLE CLIENT SIGN FIRST

    /* ONLY PROCESS COMPLETED */
    if (event !== "envelope-completed") {
      return res.status(200).send("Ignored");
    }

    /* ================= DOWNLOAD ONCE ================= */
    let signedPdfBuffer;
    try {
      signedPdfBuffer = await downloadSignedPDF(envelopeId);
    } catch (error) {
      console.error("PDF download failed:", error);
      return res.status(200).send("Download failed");
    }

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    let handled = false;

    /* ================= SERVICE REQUEST ================= */
    const serviceRequest = await ServiceRequest.findOne({
      where: { docusign_envelope_id: envelopeId },
    });

    if (serviceRequest) {
      console.log("ServiceRequest found");

      const signedFileName = `signed-${serviceRequest.ref_no}.pdf`;
      const savePath = path.join(pdfDir, signedFileName);

      fs.writeFileSync(savePath, signedPdfBuffer);

      console.log("Before update:", serviceRequest.status);

      await serviceRequest.update({
        status: "SIGNED",
        signed_file_name: signedFileName,
      });

      await serviceRequest.reload();

      console.log("After update:", serviceRequest.status);

      try {
        const user = await User.findOne({
          where: { id: serviceRequest.user_id },
        });

        if (user?.email) {
          await sendSignedServiceRequestEmailWithPDF(
            user.email,
            savePath,
            serviceRequest.ref_no,
          );
        }
      } catch (error) {
        console.error("ServiceRequest email failed:", error);
      }

      handled = true;
    }

    /* ================= ESTIMATE / CONTRACT ================= */
    let document = await ServiceEstimate.findOne({
      where: { docusign_envelope_id: envelopeId },
    });

    if (!document) {
      document = await ContractAgreement.findOne({
        where: { docusign_envelope_id: envelopeId },
      });
    }

    if (document) {
      console.log("Estimate/Contract found");

      const signedFileName = `signed-${document.file_name}`;
      const savePath = path.join(pdfDir, signedFileName);

      fs.writeFileSync(savePath, signedPdfBuffer);
      const signedPublicUrl = `https://node.socialsanitation.com/api/v1/docs/${signedFileName}`;
      await document.update({
        status: "signed",
        signed_file_name: signedFileName,
        file_url: signedPublicUrl,
      });

      handled = true;
    }

    /* ================= FINAL SAFETY ================= */
    if (!handled) {
      console.log("No matching record for envelope:", envelopeId);
    }

    return res.status(200).send("Webhook processed");
  } catch (err) {
    console.error("DOCUSIGN WEBHOOK ERROR:", err);
    return res.status(200).send("Webhook error handled");
  }
};


// scope of work controllers

const checkUserScopeExists = catchAsync(async (req, res) => {
  const { userId } = req.params;

  const result = await serviceEstimateService.checkUserScopeExists(userId);

  res.status(httpStatus.OK).send({
    success: true,
    status: httpStatus.OK,
    message: "User scope status fetched successfully",
    data: result,
  });
});

const createScopeSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createScopeSection(req.body);
  return responseWrapper(res, response, "Scope section created successfully.");
});

const updateScopeSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateScopeSection(
    req.params.id,
    req.body,
  );
  return responseWrapper(res, response, "Scope section updated successfully.");
});

const deleteScopeSection = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteScopeSection(req.params.id);
  return responseWrapper(res, "", "Scope section deleted successfully.");
});

const createScopeItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createScopeItem(req.body);
  return responseWrapper(res, response, "Scope item created successfully.");
});

const updateScopeItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateScopeItem(
    req.params.id,
    req.body,
  );
  return responseWrapper(res, response, "Scope item updated successfully.");
});

const deleteScopeItem = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteScopeItem(req.params.id);
  return responseWrapper(res, "", "Scope item deleted successfully.");
});

const getScope = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getScope(
    req.query.client_type || "commercial",
  );

  return responseWrapper(
    res,
    response,
    "Scope retrieved successfully.",
  );
});

//user scope
const getUserScope = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getUserScope(req.params.userId);

  return responseWrapper(res, response, "User scope retrieved successfully.");
});

const getUserScopeView = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getUserScopeView(req.params.userId);

  return responseWrapper(res, response, "User scope retrieved successfully.");
});

const createUserScopeSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createUserScopeSection(
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "User scope section created successfully.",
  );
});

const reorderUserScopeSections = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.reorderUserScopeSections(
    req.body,
  );

  return responseWrapper(res, response, "Sections reordered successfully.");
});

const reorderUserScopeItems = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.reorderUserScopeItems(
    req.body,
  );

  return responseWrapper(res, response, "Items reordered successfully.");
});

const updateUserScopeSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateUserScopeSection(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "User scope section updated successfully.",
  );
});

const deleteUserScopeSection = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteUserScopeSection(req.params.id);

  return responseWrapper(res, "", "User scope section deleted successfully.");
});

const createUserScopeItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createUserScopeItem(req.body);

  return responseWrapper(
    res,
    response,
    "User scope item created successfully.",
  );
});

const updateUserScopeItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateUserScopeItem(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "User scope item updated successfully.",
  );
});

const deleteUserScopeItem = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteUserScopeItem(req.params.id);

  return responseWrapper(res, "", "User scope item deleted successfully.");
});

const getEstimateScope = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.getEstimateScope(req.params.id);

  return responseWrapper(
    res,
    response,
    "Estimate scope retrieved successfully.",
  );
});

const createEstimateSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createEstimateSection(
    req.body,
    req.params.id,
  );

  return responseWrapper(
    res,
    response,
    "Estimate section created successfully.",
  );
});

const updateEstimateSection = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateEstimateSection(
    req.params.id,
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "Estimate section updated successfully.",
  );
});

const deleteEstimateSection = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteEstimateSection(req.params.id, req.body);

  return responseWrapper(res, "", "Estimate section deleted successfully.");
});

const createEstimateItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.createEstimateItem(
    req.body,
    req.params.id,
  );

  return responseWrapper(res, response, "Estimate item created successfully.");
});

const updateEstimateItem = catchAsync(async (req, res) => {
  const response = await serviceEstimateService.updateEstimateItem(
    req.params.id,
    req.body,
  );

  return responseWrapper(res, response, "Estimate item updated successfully.");
});

const deleteEstimateItem = catchAsync(async (req, res) => {
  await serviceEstimateService.deleteEstimateItem(req.params.id, req.body);

  return responseWrapper(res, "", "Estimate item deleted successfully.");
});

module.exports = {
  generateEstimatePDFController,
  downloadScopeOfWorkPDFController,
  getServiceEstimateById,
  getAllServiceEstimate,
  getServiceEstimateByUserId,
  updateServiceEstimate,
  handleDocusignWebhook,
  resumeSigningService,
  deleteServiceEstimate,

  generateContractAgreementController,
  getAllContractAgreement,
  getContractAgreementById,
  updateContractAgreement,
  getContractAgreementByUserId,
  resumeContractAgreement,
  deleteContractAgreement,

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
  createUserScopeSection,
  updateUserScopeSection,
  deleteUserScopeSection,
  createUserScopeItem,
  updateUserScopeItem,
  deleteUserScopeItem,
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
