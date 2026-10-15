const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { invoiceService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

const createInvoice = catchAsync(async (req, res) => {
  const response = await invoiceService.createInvoice(req.body);
  return responseWrapper(res, response, "Success.");
});

const reorderInvoiceItems = catchAsync(async (req, res) => {
  const { invoice_id } = req.params;
  const { items } = req.body;

  const response = await invoiceService.reorderInvoiceItems(invoice_id, items);

  return responseWrapper(res, response, "Invoice items reordered successfully");
});

const getInvoiceById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const response = await invoiceService.getInvoiceById(id);

  return responseWrapper(res, response, "Invoice fetched successfully");
});

const getInvoicesByUserId = catchAsync(async (req, res) => {
  const response = await invoiceService.getInvoicesByUserId(req.params.user_id);
  return responseWrapper(res, response, "Invoice fetched successfully");
});

const updateInvoice = catchAsync(async (req, res) => {
  const { id } = req.params;

  const response = await invoiceService.updateInvoice(id, req.body);

  return responseWrapper(res, response, "Invoice updated successfully");
});

const sendInvoiceBalance = catchAsync(async (req, res) => {
  const response = await invoiceService.sendInvoiceBalance(
    req.params.invoice_id,
  );

  return responseWrapper(
    res,
    response,
    "Remaining invoice amount sent successfully",
  );
});

const getAllInvoices = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await invoiceService.getAllInvoices({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const getNextInvoiceRef = catchAsync(async (req, res) => {
  const { ref_type } = req.query;
  const invoices = await invoiceService.getNextInvoiceRef(ref_type);
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const deleteInvoice = catchAsync(async (req, res) => {
  await invoiceService.deleteInvoice(req.params.id);
  return responseWrapper(
    res,
    "",
    "Invoice deleted successfully",
    httpStatus.OK,
  );
});

const getMonthlyAllInvoicesSummary = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await invoiceService.getMonthlyAllInvoicesSummary({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const markInvoicePaidByACH = catchAsync(async (req, res) => {
  const result = await invoiceService.markInvoicePaidByACH(
    req.params.invoice_id,
  );
  res.status(httpStatus.OK).send(result);
});

const markInvoicePaidByCheck = catchAsync(async (req, res) => {
  const result = await invoiceService.markInvoicePaidByCheck(
    req.params.invoice_id,
  );
  res.status(httpStatus.OK).send(result);
});

const getBusinessAnalytics = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await invoiceService.getBusinessAnalytics({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const getUpcomingInvoices = catchAsync(async (req, res) => {
  const invoices = await invoiceService.getUpcomingInvoices();
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const importHistoricalInvoicesCSV = catchAsync(async (req, res) => {
  // csvUpload uses .single("docs"), so the file is on req.file with a memory buffer
  if (!req.file) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: "CSV file is required",
    });
  }

  const result = await invoiceService.importHistoricalInvoicesCSV(
    req.file.buffer,
  );

  return res.status(httpStatus.OK).json(result);
});

const uploadHistoricalInvoicePDF = catchAsync(async (req, res) => {
  // The global multer in app.js puts the file on req.files.docs
  const file = req.files?.docs?.[0];

  const result = await invoiceService.uploadHistoricalInvoicePDF(
    req.params.invoice_id,
    file,
  );

  return res.status(httpStatus.OK).json(result);
});

module.exports = {
  createInvoice,
  getInvoiceById,
  getInvoicesByUserId,
  reorderInvoiceItems,
  updateInvoice,
  getAllInvoices,
  getNextInvoiceRef,
  deleteInvoice,
  getMonthlyAllInvoicesSummary,
  markInvoicePaidByACH,
  markInvoicePaidByCheck,
  getBusinessAnalytics,
  getUpcomingInvoices,
  sendInvoiceBalance,
  importHistoricalInvoicesCSV,
  uploadHistoricalInvoicePDF
};
