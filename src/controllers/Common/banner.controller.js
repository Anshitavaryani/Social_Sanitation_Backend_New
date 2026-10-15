const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { bannerService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createBanner = catchAsync(async (req, res) => {
  await bannerService.createBanner(req.body, req.files);
  return responseWrapper(
    res,
    "",
    "New Content Created Successfully.",
    httpStatus.CREATED
  );
});

const getAllBannerImgae = catchAsync(async (req, res) => {
  const content = await bannerService.getAllBannerImgae();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const getAllBannerImgaeByAdmin = catchAsync(async (req, res) => {
  const content = await bannerService.getAllBannerImgaeByAdmin();
  return responseWrapper(res, content, "", httpStatus.OK);
});

const findBannerImgaeById = catchAsync(async (req, res) => {
  const contentDoc = await bannerService.findBannerImgaeById(req.params.id);
  return responseWrapper(res, contentDoc, "");
});

const updateBannerImgaeById = catchAsync(async (req, res) => {
  const contentDoc = await bannerService.updateBannerImgaeById(
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

const deleteBannerImgaeById = catchAsync(async (req, res) => {
  await bannerService.deleteBannerImgaeById(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});


module.exports={
    createBanner,
    getAllBannerImgae,
    getAllBannerImgaeByAdmin,
    findBannerImgaeById,
    updateBannerImgaeById,
    deleteBannerImgaeById

}