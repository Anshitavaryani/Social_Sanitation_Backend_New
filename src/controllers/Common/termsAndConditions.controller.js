const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { termsAndConditionsService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createTermsAndConditons = catchAsync(async (req, res) => {
  await termsAndConditionsService.createTermsAndConditons(req.body);
  return responseWrapper(
    res,
    "",
    "New Content Created Successfully.",
    httpStatus.CREATED
  );
});

const getAllTermsAndConditons = catchAsync(async (req, res) => {
  const content = await termsAndConditionsService.getAllTermsAndConditons();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const getAllTermsAndConditonsByAdmin = catchAsync(async (req, res) => {
  const content = await termsAndConditionsService.getAllTermsAndConditonsByAdmin();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const findTermsAndConditonsById = catchAsync(async (req, res) => {
  const contentDoc = await termsAndConditionsService.findTermsAndConditonsById(
    req.params.id
  );
  return responseWrapper(res, contentDoc, "");
});

const updateTermsAndConditons = catchAsync(async (req, res) => {
  const contentDoc = await termsAndConditionsService.updateTermsAndConditons(
    req.body,
    req.params.id
  );
  return responseWrapper(
    res,
    contentDoc,
    "Service Updated Successfully",
    httpStatus.OK
  );
});

const deleteTermsAndConditons = catchAsync(async (req, res) => {
  await termsAndConditionsService.deleteTermsAndConditons(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});

module.exports = {
  createTermsAndConditons,
  getAllTermsAndConditons,
  getAllTermsAndConditonsByAdmin,
  findTermsAndConditonsById,
  updateTermsAndConditons,
  deleteTermsAndConditons,
};
