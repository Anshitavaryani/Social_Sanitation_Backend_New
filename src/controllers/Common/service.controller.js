const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { serviceService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const createService = catchAsync(async (req, res) => {
  await serviceService.createService(req.body,req.files);
  return responseWrapper(
    res,
    "",
    "New Service Created Successfully.",
    httpStatus.CREATED
  );
});

const getAllServices = catchAsync(async (req, res) => {
  const services = await serviceService.getAllServices();
  return responseWrapper(res, services, "", httpStatus.OK);
});

const getAllServicesByAdmin = catchAsync(async (req, res) => {
  const services = await serviceService.getAllServicesByAdmin();
  return responseWrapper(res, services, "", httpStatus.OK);
});

const findServiceById = catchAsync(async (req, res) => {
  const serviceDoc = await serviceService.findServiceById(req.params.id);
  return responseWrapper(res, serviceDoc, "");
});

const updateService = catchAsync(async (req, res) => {
  const serviceDoc = await serviceService.updateService(
    req.body,
    req.files,
    req.params.id
  );
  return responseWrapper(
    res,
    serviceDoc,
    "Service Updated Successfully",
    httpStatus.OK
  );
});

const updateServicePrices = catchAsync(async (req, res) => {
  const serviceDoc = await serviceService.updateServicePrices(
    req.body
  );
  return responseWrapper(
    res,
    serviceDoc,
    "Service Updated Successfully",
    httpStatus.OK
  );
});

const getServicePrices = catchAsync(async (req, res) => {
  const services = await serviceService.getServicePrices();
  return responseWrapper(res, services, "", httpStatus.OK);
});

const deleteService = catchAsync(async (req, res) => {
  await serviceService.deleteService(req.params.id);
  return responseWrapper(res, "", "Deleted Successfull.");
});


const getAllServiceNameByAdmin = catchAsync(async (req, res) => {
  const services = await serviceService.getAllServiceNameByAdmin();
  return responseWrapper(res, services, "", httpStatus.OK);
});

module.exports = {
  createService,
  getAllServices,
  getAllServicesByAdmin,
  findServiceById,
  updateService,
  updateServicePrices,
  getServicePrices,
  deleteService,
  getAllServiceNameByAdmin
};
