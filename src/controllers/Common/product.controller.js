const httpStatus = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { productService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createProduct = catchAsync(async (req, res) => {
  const product = await productService.createProduct(req.body,req.files);
  return responseWrapper(res, product, "Product created successfully", httpStatus.CREATED);
});

const getAllProducts = catchAsync(async (req, res) => {
  const products = await productService.getAllProducts();
  return responseWrapper(res, products, "", httpStatus.OK);
});

const getProductById = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return responseWrapper(res, product, "", httpStatus.OK);
});

const updateProductById = catchAsync(async (req, res) => {
  const product = await productService.updateProductById(req.params.id, req.body,req.files);
  return responseWrapper(res, product, "Product updated successfully", httpStatus.OK);
});

const deleteProductById = catchAsync(async (req, res) => {
  await productService.deleteProductById(req.body);
  return responseWrapper(res, "", "Product deleted successfully", httpStatus.OK);
});

const getAllRequestsByAdmin = catchAsync(async (req, res) => {
  const requests = await productService.getAllRequestsByAdmin();
  return responseWrapper(res, requests, "", httpStatus.OK);
});

const updateRequestStatus = catchAsync(async (req, res) => {

  const request = await productService.updateRequestStatus(req.params.id,req.body);
  return responseWrapper(res, request, "Request status updated successfully", httpStatus.OK);
});


//employee apis
const requestStock = catchAsync(async (req, res) => {
  const request = await productService.requestStock(req.body,req.files);
  return responseWrapper(res, request, "Stock request created successfully", httpStatus.CREATED);
});

const getAllRequests = catchAsync(async (req, res) => {
  const requests = await productService.getAllRequests(req.body);
  return responseWrapper(res, requests, "", httpStatus.OK);
});



module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProductById,
  deleteProductById,
  requestStock,
  getAllRequests,
  getAllRequestsByAdmin,
  updateRequestStatus,
};
