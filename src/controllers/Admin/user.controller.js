/** @format */

const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const { userService } = require("../../services");
const responseWrapper = require("../../config/responseWrapper");

//=======================================USER APIS=========================================

const getAllUsers = catchAsync(async (req, res) => {
  const users = await userService.getAllUsers(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const getAllDrivers = catchAsync(async (req, res) => {
  const users = await userService.getAllDrivers(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const getUserById = catchAsync(async (req, res) => {
  const response = await userService.getUserById(req.query.id);
  return responseWrapper(res, response, "Successfully Get user", httpStatus.OK);
});

const getBookingsByUserId = catchAsync(async (req, res) => {
  const response = await userService.getBookingsByUserId(req.body);
  return responseWrapper(res, response, "Successfully Get user", httpStatus.OK);
});


const getBookingByEmployeeId = catchAsync(async (req, res) => {
  const response = await userService.getBookingByEmployeeId(req.body);
  return responseWrapper(res, response, "Successfully Get user", httpStatus.OK);
});

const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.body);
  res.status(httpStatus.OK).send({
    code: httpStatus.NO_CONTENT,
    message: "Deleted Successfull.",
    data: "",
  });
});

const adminAddUser = catchAsync(async (req, res) => {
  const response = await userService.adminAddUser(req.body);
  return responseWrapper(res, response, "Successfully add user", httpStatus.OK);
});

const changeAssignedAdmin = catchAsync(async (req, res) => {
  const response = await userService.changeAssignedAdmin(req.body);
  return responseWrapper(res, response, "Successfully add user", httpStatus.OK);
});

const updateEmployeeType = catchAsync(async (req, res) => {
  const result = await userService.updateEmployeeType(req.body);

  res.send({
    status: true,
    message: "Employee type updated successfully",
    data: result,
  });
});

const resetUserCredentials = catchAsync(async (req, res) => {
  const response = await userService.resetUserCredentials(req.body);
  return responseWrapper(res, response, "Successfully add user", httpStatus.OK);
});

const getClosestEmployees = catchAsync(async (req, res) => {
  const response = await userService.getClosestEmployees(
    req.params.client_id,
  );

  return responseWrapper(
    res,
    response,
    "Closest employees fetched successfully.",
    httpStatus.OK,
  );
});

const getClosestEmployeesByAddress = catchAsync(async (req, res) => {
  const response = await userService.getClosestEmployeesByAddress(
    req.params.address_id,
  );

  return responseWrapper(
    res,
    response,
    "Closest employees fetched successfully.",
    httpStatus.OK,
  );
});

const addNewUserAddress = catchAsync(async (req, res) => {
  const response = await userService.addNewUserAddress(req.body);
  return responseWrapper(
    res,
    response,
    "Successfully add user address",
    httpStatus.OK,
  );
});

const adminEditUser = catchAsync(async (req, res) => {
  const response = await userService.adminEditUser(req.body, req.params.id);
  return responseWrapper(
    res,
    response,
    "Successfully update user",
    httpStatus.OK,
  );
});

const changeEmployeeRole = catchAsync(async (req, res) => {
  const response = await userService.changeEmployeeRole(
    req.params.id,
    req.body.role_id
  );

  return responseWrapper(
    res,
    response,
    "Employee role updated successfully",
    httpStatus.OK
  );
});

const deleteUserAddress = catchAsync(async (req, res) => {
  const response = await userService.deleteUserAddress(
    req.params.address_id,
  );

  return responseWrapper(
    res,
    response,
    "Address deleted successfully.",
    httpStatus.OK,
  );
});

const getClientChecklistByUserId = catchAsync(async (req, res) => {
  const response = await userService.getClientChecklistByUserId(req.params.id);
  return responseWrapper(
    res,
    response,
    "Client checklists fetched successfully",
    httpStatus.OK,
  );
});

const getUserCount = catchAsync(async (req, res) => {
  const user = await userService.getUserCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: user ? "Success" : "Failed",
    data: user,
  });
});

const getDriverCount = catchAsync(async (req, res) => {
  const user = await userService.getDriverCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: user ? "Success" : "Failed",
    data: user,
  });
});

const getAdminCount = catchAsync(async (req, res) => {
  const user = await userService.getAdminCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: user ? "Success" : "Failed",
    data: user,
  });
});

const getServiceCount = catchAsync(async (req, res) => {
  const service = await userService.getServiceCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: service ? "Success" : "Failed",
    data: service,
  });
});

const getBookingCount = catchAsync(async (req, res) => {
  const booking = await userService.getBookingCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: booking ? "Success" : "Failed",
    data: booking,
  });
});

const getPendingBookingCount = catchAsync(async (req, res) => {
  const booking = await userService.getPendingBookingCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: booking ? "Success" : "Failed",
    data: booking,
  });
});

const getCompletedBookingCount = catchAsync(async (req, res) => {
  const booking = await userService.getCompletedBookingCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: booking ? "Success" : "Failed",
    data: booking,
  });
});

const getDeletedBookingCount = catchAsync(async (req, res) => {
  const booking = await userService.getDeletedBookingCount();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: booking ? "Success" : "Failed",
    data: booking,
  });
});

const getMostBookedService = catchAsync(async (req, res) => {
  const user = await userService.getMostBookedService();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: user ? "Success" : "Failed",
    data: user,
  });
});

const getUserLoginTimings = catchAsync(async (req, res) => {
  const response = await userService.getUserLoginTimings();
  return responseWrapper(res, response, "Success");
});

const clearLoginRecords = catchAsync(async (req, res) => {
  const response = await userService.clearLoginRecords();
  return responseWrapper(res, response, "Login records cleared successfully");
});

const getAllUserNameByAdmin = catchAsync(async (req, res) => {
  const response = await userService.getAllUserNameByAdmin(req.params.id);
  return responseWrapper(res, response, "Success");
});

const getAllSupervisorByAdmin = catchAsync(async (req, res) => {
  const response = await userService.getAllSupervisorByAdmin(req.params.id);
  return responseWrapper(res, response, "Success");
});

const getAllQualityInspectorByAdmin = catchAsync(async (req, res) => {
  const response = await userService.getAllQualityInspectorByAdmin(
    req.params.id,
  );
  return responseWrapper(res, response, "Success");
});

const getAllCleanerByAdmin = catchAsync(async (req, res) => {
  const response = await userService.getAllCleanerByAdmin(req.params.id);
  return responseWrapper(res, response, "Success");
});

const getAllTransactions = catchAsync(async (req, res) => {
  const response = await userService.getAllTransactions();
  return responseWrapper(res, response, "Success");
});

const submitServiceQuote = catchAsync(async (req, res) => {
  const response = await userService.submitServiceQuote(req.body);
  return responseWrapper(res, response, "Quote saved and sent successfully.");
});

const submitServiceRequest = catchAsync(async (req, res) => {
  const response = await userService.submitServiceRequest(req.body);
  return responseWrapper(res, response, "Request submitted successfully.");
});

const getServiceRequestById = async (req, res) => {
  const data = await userService.getServiceRequestById(req.params.id);

  res.status(httpStatus.OK).send({
    success: true,
    status: httpStatus.OK,
    message: "Service request fetched successfully",
    data,
  });
};

const editServiceRequest = catchAsync(async (req, res) => {
  const response = await userService.editServiceRequest(req.body);
  return responseWrapper(
    res,
    response,
    "Service request updated successfully.",
  );
});

const getAllServiceRequests = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await userService.getAllServiceRequests({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const getServiceRequestsByUserId = catchAsync(async (req, res) => {
  const invoices = await userService.getServiceRequestsByUserId(
    req.params.user_id,
  );
  return responseWrapper(
    res,
    invoices,
    "Service requests fetched successfully",
  );
});

const deleteServiceRequest = catchAsync(async (req, res) => {
  await userService.deleteServiceRequest(req.params.id);
  return responseWrapper(
    res,
    "",
    "Service request deleted successfully",
    httpStatus.OK,
  );
});

const getNextServiceRequestRef = catchAsync(async (req, res) => {
  const { ref_type } = req.query;
  const invoices = await userService.getNextServiceRequestRef(ref_type);
  return responseWrapper(
    res,
    invoices,
    "Service request reference fetched successfully",
  );
});

const handleTwilioSmsStatus = async (req, res) => {

  // Example:
  // req.body.MessageSid
  // req.body.MessageStatus

  await userService.handleTwilioSmsStatus(req.body);

  res.sendStatus(200); // IMPORTANT
};

const getServiceQuotesByUserId = catchAsync(async (req, res) => {
  const response = await userService.getServiceQuotesByUserId(req.params.id);
  return responseWrapper(res, response, "Success.");
});

const getServiceQuoteById = async (req, res) => {
  const data = await userService.getServiceQuoteById(req.params.id);

  res.status(httpStatus.OK).send({
    success: true,
    status: httpStatus.OK,
    message: "Service quote fetched successfully",
    data,
  });
};

const editServiceQuote = async (req, res) => {
  const data = await userService.editServiceQuote(req.body);

  res.status(httpStatus.OK).send({
    success: true,
    status: httpStatus.OK,
    message: "Service quote updated successfully",
    data,
  });
};

const getLatestDraftQuote = catchAsync(async (req, res) => {
  const response = await userService.getLatestDraftQuote(req.params.id);
  return responseWrapper(res, response, "Success.");
});

const getAllDraftQuotesByUser = catchAsync(async (req, res) => {
  const response = await userService.getAllDraftQuotesByUser(req.params.id);
  return responseWrapper(res, response, "Success.");
});

const deleteDraftQuote = catchAsync(async (req, res) => {
  const response = await userService.deleteDraftQuote(req.params.id);
  return responseWrapper(res, response, "Success.");
});

const saveDraftQuote = catchAsync(async (req, res) => {
  const response = await userService.saveDraftQuote(req.body);
  return responseWrapper(res, response, "Success.");
});

const getNextQuoteRef = catchAsync(async (req, res) => {
  const { ref_type } = req.query;
  const invoices = await userService.getNextQuoteRef(ref_type);
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const deleteQuote = catchAsync(async (req, res) => {
  await userService.deleteQuote(req.params.id);
  return responseWrapper(res, "", "Quote deleted successfully", httpStatus.OK);
});

const toggleLogoutImageRequired = catchAsync(async (req, res) => {
  const response = await userService.toggleLogoutImageRequired(req.body, res);
  return responseWrapper(res, response, "Toggle successfully.");
});

const sendReviewEmail = catchAsync(async (req, res) => {
  const response = await userService.sendReviewEmail(req.body);
  return responseWrapper(res, response, "Review email sent successfully.");
});

const createOrUpdateReviewLink = catchAsync(async (req, res) => {
  const response = await userService.createOrUpdateReviewLink(req.body);
  return responseWrapper(res, response, "Review email sent successfully.");
});

const markQuoteAsBooked = catchAsync(async (req, res) => {
  const response = await userService.markQuoteAsBooked(req.params.id);
  return responseWrapper(res, response, "Quote marked as booked successfully.");
});

const markQuoteAsCheckPaid = catchAsync(async (req, res) => {
  const response = await userService.markQuoteAsCheckPaid(req.params.id);

  return responseWrapper(res, response, "Quote marked as paid by check.");
});

const markQuoteAsACHPaid = catchAsync(async (req, res) => {
  const response = await userService.markQuoteAsACHPaid(req.params.id);

  return responseWrapper(
    res,
    response,
    "Quote marked as paid by ACH.",
  );
});

const getAllInvoices = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await userService.getAllInvoices({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const getReviewLink = catchAsync(async (req, res) => {
  const response = await userService.getReviewLink();
  return responseWrapper(res, response, "Success.");
});

const getAllUserName = catchAsync(async (req, res) => {
  const users = await userService.getAllUserName();
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: users ? "Success" : "Failed",
    data: users,
  });
});

const getUserAddressesByUserId = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const addresses = await userService.getUserAddressesByUserId(userId);
  res.status(httpStatus.OK).send({
    code: httpStatus.OK,
    message: addresses ? "Success" : "Failed",
    data: addresses,
  });
});


const getMonthlyInvoicesSummary = catchAsync(async (req, res) => {
  const { month } = req.query;
  const invoices = await userService.getMonthlyInvoicesSummary({ month });
  return responseWrapper(res, invoices, "Invoices fetched successfully");
});

const getLiveWorkingEmployeesController = catchAsync(async (req, res) => {
  const response = await userService.getLiveWorkingEmployees(req.body);

  return responseWrapper(
    res,
    response,
    "Live working employees fetched successfully",
    httpStatus.OK,
  );
});

const getLateAbsentEmployeesController = catchAsync(async (req, res) => {
  const response = await userService.getLateAbsentEmployees(req.body);

  return responseWrapper(
    res,
    response,
    "Late/Absent employees fetched successfully",
    httpStatus.OK,
  );
});

const getUpcomingScheduledBookingsController = catchAsync(async (req, res) => {
  const response = await userService.getUpcomingScheduledBookings();

  return responseWrapper(
    res,
    response,
    "Upcoming scheduled bookings fetched successfully",
    httpStatus.OK,
  );
});

const getEmployeeDropdown = catchAsync(async (req, res) => {
  const result = await userService.getEmployeeDropdown();

  return responseWrapper(
    res,
    result,
    "Employees fetched successfully.",
    httpStatus.OK,
  );
});

const getEmployeeHiringForms = catchAsync(async (req, res) => {
  const response = await userService.getEmployeeHiringForms(req.query);

  return responseWrapper(
    res,
    response,
    "Employee hiring forms fetched successfully",
    httpStatus.OK,
  );
});

module.exports = {
  getAllUsers,
  getAllDrivers,
  getUserById,
  getBookingByEmployeeId,
  getBookingsByUserId,
  deleteUser,
  adminAddUser,
  resetUserCredentials,
  getClosestEmployees,
  addNewUserAddress,
  adminEditUser,
  changeEmployeeRole,
  deleteUserAddress,
  changeAssignedAdmin,
  getClientChecklistByUserId,
  getUserCount,
  getAdminCount,
  getDriverCount,
  getUserLoginTimings,
  clearLoginRecords,
  getServiceCount,
  getBookingCount,
  getPendingBookingCount,
  getCompletedBookingCount,
  getDeletedBookingCount,
  getMostBookedService,
  getAllUserNameByAdmin,
  getNextServiceRequestRef,
  getAllSupervisorByAdmin,
  getAllQualityInspectorByAdmin,
  getAllCleanerByAdmin,
  getAllTransactions,
  submitServiceQuote,
  getAllServiceRequests,
  getServiceRequestsByUserId,
  getServiceRequestById,
  editServiceRequest,
  deleteServiceRequest,
  submitServiceRequest,
  getLatestDraftQuote,
  getAllDraftQuotesByUser,
  saveDraftQuote,
  deleteQuote,
  deleteDraftQuote,
  getNextQuoteRef,
  getServiceQuotesByUserId,
  getServiceQuoteById,
  editServiceQuote,
  toggleLogoutImageRequired,
  sendReviewEmail,
  createOrUpdateReviewLink,
  getReviewLink,
  markQuoteAsCheckPaid,
  markQuoteAsBooked,
  getAllInvoices,
  handleTwilioSmsStatus,
  getAllUserName,
  updateEmployeeType,
  getMonthlyInvoicesSummary,
  getLiveWorkingEmployeesController,
  getLateAbsentEmployeesController,
  getUpcomingScheduledBookingsController,
  getEmployeeDropdown,
  getClosestEmployeesByAddress,
  getUserAddressesByUserId,
  markQuoteAsACHPaid,
  getEmployeeHiringForms
};
