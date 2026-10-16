const express = require('express');
const router = express.Router();

const {userController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");


router.get('/getAllUsers',[adminAuthMiddleware.validateJWTtoken],userController.getAllUsers);
router.get('/getUserById', requireAdmin,userController.getUserById);
router.post('/getBookinsByUserId', requireAdmin,userController.getBookinsByUserId);
router.post('/getBookingByEmployeeId', requireAdmin,userController.getBookingByEmployeeId);
router.get('/getAllDrivers',[adminAuthMiddleware.validateJWTtoken],userController.getAllDrivers);
router.post('/deleteUser', requireAdmin,userController.deleteUser);
router.post('/createUser',[adminAuthMiddleware.validateJWTtoken],userController.adminAddUser);
router.post('/change-employee-role/:id', requireAdmin,userController.changeEmployeeRole);
router.post('/update-employee-type', requireAdmin,userController.updateEmployeeType);
router.post("/change-assigned-admin", requireAdmin, userController.changeAssignedAdmin);
router.post('/resetUserCredentials',[adminAuthMiddleware.validateJWTtoken],userController.resetUserCredentials);
router.post('/adminEditUser/:id', requireAdmin,userController.adminEditUser);
router.get('/getClientChecklistByUserId/:id', requireAdmin,userController.getClientChecklistByUserId);
router.post('/addNewUserAddress', requireAdmin,userController.addNewUserAddress);
router.delete("/delete-user-address/:address_id", requireAdmin,userController.deleteUserAddress);
router.get('/get-closest-employees/:client_id', requireAdmin,userController.getClosestEmployees);
router.get("/get-closest-employees-by-address/:address_id", requireAdmin,userController.getClosestEmployeesByAddress);

router.get('/getUserCount', requireAdmin,userController.getUserCount);
router.get('/getDriverCount', requireAdmin,userController.getDriverCount);
router.get('/getAdminCount', requireAdmin,userController.getAdminCount);
router.get('/getServiceCount', requireAdmin,userController.getServiceCount);
router.get('/getBookingCount', requireAdmin,userController.getBookingCount);
router.get('/getPendingBookingCount', requireAdmin,userController.getPendingBookingCount);
router.get('/getCompletedBookingCount', requireAdmin,userController.getCompletedBookingCount);
router.get('/getDeletedBookingCount', requireAdmin,userController.getDeletedBookingCount);
router.get('/getMostBookedService', requireAdmin,userController.getMostBookedService);
router.get('/getAllUserNameByAdmin', requireAdmin,userController.getAllUserNameByAdmin);
router.get('/getAllSupervisorByAdmin/:id', requireAdmin,userController.getAllSupervisorByAdmin);
router.get('/getAllQualityInspectorByAdmin/:id', requireAdmin,userController.getAllQualityInspectorByAdmin);
router.get('/getAllCleanerByAdmin/:id', requireAdmin,userController.getAllCleanerByAdmin);
router.get('/getAllTransactions', requireAdmin,userController.getAllTransactions);



router.get('/login/timings',  [ adminAuthMiddleware.validateJWTtoken], userController.getUserLoginTimings);
router.delete('/login/timings/clear',  [ adminAuthMiddleware.validateJWTtoken], userController.clearLoginRecords);

router.post('/submitServiceQuote', requireAdmin,  userController.submitServiceQuote);
router.get('/getAllServiceRequests', requireAdmin,userController.getAllServiceRequests);
router.get('/getServiceRequestsByUserId/:user_id', requireAdmin, userController.getServiceRequestsByUserId);
router.post('/submitServiceRequest', requireAdmin,  userController.submitServiceRequest);
router.get("/getServiceRequestById/:id", requireAdmin,userController.getServiceRequestById),
router.put("/editServiceRequest", requireAdmin,userController.editServiceRequest),
router.get('/getNextServiceRequestRef', requireAdmin,userController.getNextServiceRequestRef);
router.delete("/deleteServiceRequest/:id", requireAdmin, userController.deleteServiceRequest);

router.post('/sendReviewEmail', requireAdmin,  userController.sendReviewEmail);
router.get('/getServiceQuotesByUserId/:id', requireAdmin,  userController.getServiceQuotesByUserId);
router.get('/getServiceQuoteById/:id', requireAdmin,  userController.getServiceQuoteById);
router.put('/editServiceQuote', requireAdmin,  userController.editServiceQuote);


// draft quotes api
router.get('/getLatestDraftQuote/:id', requireAdmin,  userController.getLatestDraftQuote);
router.get('/getAllDraftQuotesByUser/:id', requireAdmin,  userController.getAllDraftQuotesByUser);
router.delete('/deleteDraftQuote/:id', requireAdmin,  userController.deleteDraftQuote);
router.post('/saveDraftQuote', requireAdmin,  userController.saveDraftQuote);
router.get('/getNextQuoteRef', requireAdmin,  userController.getNextQuoteRef);
router.delete("/deleteQuote/:id", requireAdmin, userController.deleteQuote);


router.put("/toggle-logout-image", requireAdmin, userController.toggleLogoutImageRequired);

router.post('/createOrUpdateReviewLink', requireAdmin,  userController.createOrUpdateReviewLink);
router.get('/getReviewLink', requireAdmin,  userController.getReviewLink);

router.put('/quotes/mark-check-paid/:id', requireAdmin,  userController.markQuoteAsCheckPaid);
router.put('/quotes/mark-ach-paid/:id', requireAdmin,  userController.markQuoteAsACHPaid);
router.put('/quotes/mark-booked/:id', requireAdmin,  userController.markQuoteAsBooked);
router.get('/invoices', requireAdmin,  userController.getAllInvoices);

router.post('/twilio/sms-status', publicRoute,  userController.handleTwilioSmsStatus);

router.get('/getAllUserName', requireAdmin,userController.getAllUserName);
router.get('/getUserAddressesByUserId/:userId', requireAdmin, userController.getUserAddressesByUserId);
router.get('/employee-dropdown', requireAdmin,userController.getEmployeeDropdown);

router.post('/getMonthlyInvoicesSummary', requireAdmin,  userController.getMonthlyInvoicesSummary);

router.post("/live-working-employees", requireAdmin, userController.getLiveWorkingEmployeesController);
router.post("/late-absent-employees", requireAdmin, userController.getLateAbsentEmployeesController);
router.post("/upcoming-scheduled-bookings", requireAdmin, userController.getUpcomingScheduledBookingsController);


router.get("/employee-hiring-forms", requireAdmin, userController.getEmployeeHiringForms);


module.exports = router;