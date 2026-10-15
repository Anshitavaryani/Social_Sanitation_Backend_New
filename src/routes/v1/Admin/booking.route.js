const express = require('express');
const router = express.Router();

const { adminBookingController } = require('../../../controllers/Admin');

router.post('/getAllBookings',adminBookingController.getAllBookings);
router.get('/getBookingByBookingid/:id',adminBookingController.getBookingById);
router.post('/updateBookingStatus', adminBookingController.updateBookingStatus);
router.get('/checkBookingRequest', adminBookingController.checkBookingRequest);
router.post('/adminCreateBooking', adminBookingController.adminCreateBooking);
router.post('/adminCreateBookingForGuest', adminBookingController.adminCreateBookingForGuest);
router.post('/deleteBooking', adminBookingController.deleteBooking);

router.post('/getMonthlyBookingCalendar', adminBookingController.getMonthlyBookingCalendar);


// weekly schedule api
router.post('/getDayOverview', adminBookingController.getDayOverview);
router.get('/getBookingOverviewById/:id', adminBookingController.getBookingOverviewById);

router.post('/getDayOverviewForGantt', adminBookingController.getDayOverviewForGantt);


router.post('/getEmployeeDayOverview', adminBookingController.getEmployeeDayOverview);
router.post('/getEmployeeRangeOverview', adminBookingController.getEmployeeRangeOverview);
router.post('/updateEmployeeTimesheet', adminBookingController.updateEmployeeTimesheet);

router.post('/send-two-week-schedule', adminBookingController.sendEmployeeTwoWeekSchedule);



module.exports = router;