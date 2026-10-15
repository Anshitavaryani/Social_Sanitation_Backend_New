const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { trendingVideosService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createTrendingVideo = catchAsync(async (req, res) => {
  await trendingVideosService.createTrendingVideo(req.body);
  return responseWrapper(
    res,
    "",
    "New Content Created Successfully.",
    httpStatus.CREATED
  );
});

const getAllTrendingVideos = catchAsync(async (req, res) => {
  const content = await trendingVideosService.getAllTrendingVideos(req.body);
  return responseWrapper(res, content, "", httpStatus.OK);
});

const findTrendingVideoById = catchAsync(async (req, res) => {
  const contentDoc = await trendingVideosService.findTrendingVideoById(req.params.id);
  return responseWrapper(res, contentDoc, "");
});

const updateTrendingVideo = catchAsync(async (req, res) => {
  const contentDoc = await trendingVideosService.updateTrendingVideo(
    req.body,
    req.params.id
  );
  return responseWrapper(
    res,
    contentDoc,
    "About Us Updated Successfully",
    httpStatus.OK
  );
});

const deleteTrendingVideo = catchAsync(async (req, res) => {
  await trendingVideosService.deleteTrendingVideo(req.body);
  return responseWrapper(res, "", "Deleted Successfull.");
});

module.exports = {
  createTrendingVideo,
  getAllTrendingVideos,
  findTrendingVideoById,
  updateTrendingVideo,
  deleteTrendingVideo,
};
