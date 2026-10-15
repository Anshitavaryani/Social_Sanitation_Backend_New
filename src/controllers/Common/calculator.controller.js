const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { calculatorService } = require("../../services");

const createCostCalculator = catchAsync(async (req, res) => {
  const response = await calculatorService.createCostCalculator(req.body);

  return responseWrapper(
    res,
    response,
    "Cost calculator created successfully",
    httpStatus.OK,
  );
});

const getCostCalculationById = catchAsync(async (req, res) => {
  const response = await calculatorService.getCostCalculationById(
    req.params.id,
  );

  return responseWrapper(
    res,
    response,
    "Cost calculation fetched successfully",
    httpStatus.OK,
  );
});

const getAllCostCalculations = catchAsync(async (req, res) => {
  const response = await calculatorService.getAllCostCalculations(req.query);

  return responseWrapper(
    res,
    response,
    "Cost calculations fetched successfully",
    httpStatus.OK,
  );
});

const deleteCostCalculation = catchAsync(async (req, res) => {
  const response = await calculatorService.deleteCostCalculation(req.params.id);

  return responseWrapper(
    res,
    response,
    "Cost calculation deleted successfully",
    httpStatus.OK,
  );
});

const createBidMaximizer = catchAsync(async (req, res) => {
  const response = await calculatorService.createBidMaximizer(req.body);

  return responseWrapper(
    res,
    response,
    "Bid maximizer created successfully",
    httpStatus.OK,
  );
});

const getCostCalculationSettings = catchAsync(async (req, res) => {
  const response = await calculatorService.getCostCalculationSettings(req.query);

  return responseWrapper(
    res,
    response,
    "Cost calculations fetched successfully",
    httpStatus.OK,
  );
});

const updateCostCalculationSetting = catchAsync(async (req, res) => {
  const response = await calculatorService.updateCostCalculationSetting(req.body);

  return responseWrapper(
    res,
    response,
    "Cost calculations setting updated successfully",
    httpStatus.OK,
  );
});


module.exports = {
  createCostCalculator,
  getCostCalculationById,
  getAllCostCalculations,
  deleteCostCalculation,
  createBidMaximizer,
  getCostCalculationSettings,
  updateCostCalculationSetting
};
