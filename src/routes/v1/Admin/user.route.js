const express = require('express');
const router = express.Router();

const {userController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');
const {roleMiddleware} = require('../../../middlewares')


router.get('/getAllUsers',[adminAuthMiddleware.validateJWTtoken],userController.getAllUsers);
router.get('/getUserById',userController.getUserById);
router.post('/getBookinsByUserId',userController.getBookinsByUserId);
router.post('/getBookingByEmployeeId',userController.getBookingByEmployeeId);
router.get('/getAllDrivers',[adminAuthMiddleware.validateJWTtoken],userController.getAllDrivers);
router.post('/deleteUser',userController.deleteUser);
router.post('/createUser',[adminAuthMiddleware.validateJWTtoken],userController.adminAddUser);
router.post('/change-employee-role/:id',userController.changeEmployeeRole);
router.post('/update-employee-type',userController.updateEmployeeType);
router.post("/change-assigned-admin", userController.changeAssignedAdmin);
router.post('/resetUserCredentials',[adminAuthMiddleware.validateJWTtoken],userController.resetUserCredentials);
router.post('/adminEditUser/:id',userController.adminEditUser);
router.get('/getClientChecklistByUserId/:id',userController.getClientChecklistByUserId);
router.post('/addNewUserAddress',userController.addNewUserAddress);
router.delete("/delete-user-address/:address_id",userController.deleteUserAddress);
router.get('/get-closest-employees/:client_id',userController.getClosestEmployees);
router.get("/get-closest-employees-by-address/:address_id",userController.getClosestEmployeesByAddress);

router.get('/getUserCount',userController.getUserCount);
router.get('/getDriverCount',userController.getDriverCount);
router.get('/getAdminCount',userController.getAdminCount);
router.get('/getServiceCount',userController.getServiceCount);
router.get('/getBookingCount',userController.getBookingCount);
router.get('/getPendingBookingCount',userController.getPendingBookingCount);
router.get('/getCompletedBookingCount',userController.getCompletedBookingCount);
router.get('/getDeletedBookingCount',userController.getDeletedBookingCount);
router.get('/getMostBookedService',userController.getMostBookedService);
router.get('/getAllUserNameByAdmin',userController.getAllUserNameByAdmin);
router.get('/getAllSupervisorByAdmin/:id',userController.getAllSupervisorByAdmin);
router.get('/getAllQualityInspectorByAdmin/:id',userController.getAllQualityInspectorByAdmin);
router.get('/getAllCleanerByAdmin/:id',userController.getAllCleanerByAdmin);
router.get('/getAllTransactions',userController.getAllTransactions);



router.get('/login/timings',  [ adminAuthMiddleware.validateJWTtoken], userController.getUserLoginTimings);
router.delete('/login/timings/clear',  [ adminAuthMiddleware.validateJWTtoken], userController.clearLoginRecords);

router.post('/submitServiceQuote',  userController.submitServiceQuote);
router.get('/getAllServiceRequests',userController.getAllServiceRequests);
router.get('/getServiceRequestsByUserId/:user_id', userController.getServiceRequestsByUserId);
router.post('/submitServiceRequest',  userController.submitServiceRequest);
router.get("/getServiceRequestById/:id",userController.getServiceRequestById),
router.put("/editServiceRequest",userController.editServiceRequest),
router.get('/getNextServiceRequestRef',userController.getNextServiceRequestRef);
router.delete("/deleteServiceRequest/:id", userController.deleteServiceRequest);

router.post('/sendReviewEmail',  userController.sendReviewEmail);
router.get('/getServiceQuotesByUserId/:id',  userController.getServiceQuotesByUserId);
router.get('/getServiceQuoteById/:id',  userController.getServiceQuoteById);
router.put('/editServiceQuote',  userController.editServiceQuote);


// draft quotes api
router.get('/getLatestDraftQuote/:id',  userController.getLatestDraftQuote);
router.get('/getAllDraftQuotesByUser/:id',  userController.getAllDraftQuotesByUser);
router.delete('/deleteDraftQuote/:id',  userController.deleteDraftQuote);
router.post('/saveDraftQuote',  userController.saveDraftQuote);
router.get('/getNextQuoteRef',  userController.getNextQuoteRef);
router.delete("/deleteQuote/:id", userController.deleteQuote);


router.put("/toggle-logout-image", userController.toggleLogoutImageRequired);

router.post('/createOrUpdateReviewLink',  userController.createOrUpdateReviewLink);
router.get('/getReviewLink',  userController.getReviewLink);

router.put('/quotes/mark-check-paid/:id',  userController.markQuoteAsCheckPaid);
router.put('/quotes/mark-ach-paid/:id',  userController.markQuoteAsACHPaid);
router.put('/quotes/mark-booked/:id',  userController.markQuoteAsBooked);
router.get('/invoices',  userController.getAllInvoices);

router.post('/twilio/sms-status',  userController.handleTwilioSmsStatus);

router.get('/getAllUserName',userController.getAllUserName);
router.get('/getUserAddressesByUserId/:userId', userController.getUserAddressesByUserId);
router.get('/employee-dropdown',userController.getEmployeeDropdown);

router.post('/getMonthlyInvoicesSummary',  userController.getMonthlyInvoicesSummary);

router.post("/live-working-employees", userController.getLiveWorkingEmployeesController);
router.post("/late-absent-employees", userController.getLateAbsentEmployeesController);
router.post("/upcoming-scheduled-bookings", userController.getUpcomingScheduledBookingsController);


router.get("/employee-hiring-forms", userController.getEmployeeHiringForms);


module.exports = router;