const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { inspectionService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const createInspection = catchAsync(async (req, res) => {
  const response = await inspectionService.createInspection(req.body);

  return responseWrapper(res, response, "Inspection created successfully.");
});

const getMyInspectionsByBDM = catchAsync(async (req, res) => {
  const response = await inspectionService.getMyInspectionsByBDM(req.body);

  return responseWrapper(
    res,
    response,
    "BDM inspections retrieved successfully.",
  );
});

const deleteInspection = catchAsync(async (req, res) => {
  const response =
    await inspectionService.deleteInspection({
      ...req.body,
      inspectionId: req.params.inspectionId,
    });

  return responseWrapper(
    res,
    response,
    "Inspection deleted successfully.",
  );
});

const getMyAssignedInspections = catchAsync(async (req, res) => {
  const response = await inspectionService.getMyAssignedInspections({
    user: req.user || req.body?.user,
  });

  return responseWrapper(
    res,
    response,
    "Assigned inspections retrieved successfully.",
  );
});

const getInspectionById = catchAsync(async (req, res) => {
  const response = await inspectionService.getInspectionById(
    req.params.inspectionId,
  );

  return responseWrapper(
    res,
    response,
    "Inspection retrieved successfully.",
  );
});

const updateInspectionItem = catchAsync(async (req, res) => {
  const response = await inspectionService.updateInspectionItem(
    req.params.itemId,
    req.body,
  );

  return responseWrapper(
    res,
    response,
    "Inspection item updated successfully.",
  );
});

const submitInspection = catchAsync(async (req, res) => {
  const response = await inspectionService.submitInspection({
    inspectionId: req.params.inspectionId,
    user: req.user || req.body?.user,
  });

  return responseWrapper(
    res,
    response,
    "Inspection submitted successfully.",
  );
});

const uploadInspectionItemImage = catchAsync(async (req, res) => {
  const response = await inspectionService.uploadInspectionItemImage(
    req.body,
    req.files,
    req.params.itemId
  );

  return responseWrapper(
    res,
    response,
    "Inspection image(s) uploaded successfully.",
    httpStatus.OK
  );
});

const reviewInspectionItem = catchAsync(async (req, res) => {
  const response = await inspectionService.reviewInspectionItem({
    itemId: req.params.itemId,
    user: req.user || req.body?.user,
    bdm_status: req.body.bdm_status,
    bdm_remark: req.body.bdm_remark,
  });

  return responseWrapper(
    res,
    response,
    "Inspection item reviewed successfully.",
  );
});

const reviewInspectionSection = catchAsync(async (req, res) => {
  const response = await inspectionService.reviewInspectionSection({
    sectionReviewId: req.params.sectionReviewId,
    user: req.user || req.body?.user,
    status: req.body.status,
    remark: req.body.remark,
  });

  return responseWrapper(
    res,
    response,
    "Inspection section reviewed successfully.",
  );
});

const uploadBDMInspectionItemImage = catchAsync(async (req, res) => {
  const response = await inspectionService.uploadBDMInspectionItemImage(
    {
      ...req.body,
      user: req.user || req.body?.user,
    },
    req.files,
    req.params.itemId,
  );

  return responseWrapper(
    res,
    response,
    "BDM inspection image(s) uploaded successfully.",
    httpStatus.OK,
  );
});

const completeInspection = catchAsync(async (req, res) => {
  const response = await inspectionService.completeInspection({
    inspectionId: req.params.inspectionId,
    user: req.user || req.body?.user,
    score: req.body.score,
    overall_remark: req.body.overall_remark,
  });

  return responseWrapper(
    res,
    response,
    "Inspection completed successfully.",
  );
});

const sendInspectionToClient = catchAsync(async (req, res) => {
  const response = await inspectionService.sendInspectionToClient({
    inspectionId: req.params.inspectionId,
    user: req.user || req.body?.user,
  });

  return responseWrapper(
    res,
    response,
    "Inspection sent to client successfully.",
  );
});

const deleteInspectionItemImage = catchAsync(async (req, res) => {
  const response = await inspectionService.deleteInspectionItemImage(
    { user: req.user || req.body?.user },
    req.params.imageId,
  );

  return responseWrapper(res, response, "Image deleted successfully.");
});

const getInspectionsByEmployeeId = catchAsync(
  async (req, res) => {
    const { employeeId } = req.params;

    const response =
      await inspectionService.getInspectionsByEmployeeId(
        employeeId,
      );

    return responseWrapper(
      res,
      response,
      "Employee inspections fetched successfully",
      httpStatus.OK,
    );
  },
);

const reopenInspection = catchAsync(async (req, res) => {
  const response = await inspectionService.reopenInspection({
    inspectionId: req.params.inspectionId,
    user: req.user || req.body?.user,
    remark: req.body.remark,
  });

  return responseWrapper(
    res,
    response,
    "Inspection reopened successfully.",
  );
});

module.exports = {
  createInspection,
  getMyInspectionsByBDM,
  deleteInspection,
  reopenInspection,
  
  getMyAssignedInspections,
  getInspectionById,
  updateInspectionItem,
  submitInspection,
  uploadInspectionItemImage,
  reviewInspectionItem,
  reviewInspectionSection,
  uploadBDMInspectionItemImage,
  completeInspection,
  sendInspectionToClient,
  deleteInspectionItemImage,
  getInspectionsByEmployeeId
};
