const express = require('express');
const router = express.Router();

const { adminBookingController } = require('../../../controllers/Admin');
const { requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/getAllBookings', requireAdmin,adminBookingController.getAllBookings);
router.get('/getBookingByBookingid/:id', requireAdmin,adminBookingController.getBookingById);
router.post('/updateBookingStatus', requireAdmin, adminBookingController.updateBookingStatus);
router.get('/checkBookingRequest', requireAdmin, adminBookingController.checkBookingRequest);
router.post('/adminCreateBooking', requireAdmin, adminBookingController.adminCreateBooking);
router.post('/adminCreateBookingForGuest', requireAdmin, adminBookingController.adminCreateBookingForGuest);
router.post('/deleteBooking', requireAdmin, adminBookingController.deleteBooking);

router.post('/getMonthlyBookingCalendar', requireAdmin, adminBookingController.getMonthlyBookingCalendar);


// weekly schedule api
router.post('/getDayOverview', requireAdmin, adminBookingController.getDayOverview);
router.get('/getBookingOverviewById/:id', requireAdmin, adminBookingController.getBookingOverviewById);

router.post('/getDayOverviewForGantt', requireAdmin, adminBookingController.getDayOverviewForGantt);


router.post('/getEmployeeDayOverview', requireAdmin, adminBookingController.getEmployeeDayOverview);
router.post('/getEmployeeRangeOverview', requireAdmin, adminBookingController.getEmployeeRangeOverview);
router.post('/updateEmployeeTimesheet', requireAdmin, adminBookingController.updateEmployeeTimesheet);

router.post('/send-two-week-schedule', requireAdmin, adminBookingController.sendEmployeeTwoWeekSchedule);



module.exports = router;