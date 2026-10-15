const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { aboutUsService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createAboutUs = catchAsync(async (req, res) => {
  await aboutUsService.createAboutUs(req.body, req.files);
  return responseWrapper(
    res,
    "",
    "New Content Created Successfully.",
    httpStatus.CREATED
  );
});

const getAllAboutUs = catchAsync(async (req, res) => {
  const content = await aboutUsService.getAllAboutUs();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const getAllAboutUsByAdmin = catchAsync(async (req, res) => {
  const content = await aboutUsService.getAllAboutUsByAdmin();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const findAboutUsById = catchAsync(async (req, res) => {
  const contentDoc = await aboutUsService.findAboutUsById(req.params.id);
  return responseWrapper(res, contentDoc, "");
});

const updateAboutUs = catchAsync(async (req, res) => {
  const contentDoc = await aboutUsService.updateAboutUs(
    req.body,
    req.files,
    req.params.id
  );
  return responseWrapper(
    res,
    contentDoc,
    "About Us Updated Successfully",
    httpStatus.OK
  );
});

const deleteAboutUs = catchAsync(async (req, res) => {
  await aboutUsService.deleteAboutUs(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});

module.exports = {
  createAboutUs,
  getAllAboutUs,
  getAllAboutUsByAdmin,
  findAboutUsById,
  updateAboutUs,
  deleteAboutUs,
};
