const express = require('express');
const router = express.Router();

const {attendanceController} = require('../../../controllers');
const { userAuthMiddleware} = require('../../../middlewares');
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");


// attendence apis
router.post('/clockIn',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.clockIn);
router.post('/clockOut',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.clockOut);
router.post('/applyBreak',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.applyBreak);
router.get('/checkIfOnBreak',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.checkIfOnBreak);
router.get('/checkClockInStatus',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.checkClockInStatus);
router.post('/getAttendance',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.getAttendance);

// leave apis
router.post('/applyForLeave',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.applyForLeave);
router.get('/getAllUserLeaves',[userAuthMiddleware.verifyAuthJWTToken],attendanceController.getAllUserLeaves);

// admin apis
router.post('/updateLeaveStatus/:id', requireAdmin,attendanceController.updateLeaveStatus);
router.get('/getAllLeaveRequest', requireAdmin,attendanceController.getAllLeaveRequest);
router.post('/getAttendanceByUserId/:id', requireAuth,attendanceController.getAttendanceByUserId);
router.post('/getAllAttendance', requireAdmin,attendanceController.getAllAttendance);
router.post('/getTodayAttendanceStats', requireAdmin,attendanceController.getTodayAttendanceStats);

router.post('/getDailyPresenceForMonth', requireAdmin,attendanceController.getDailyPresenceForMonth);

router.post('/getAllBreaks', requireAdmin,attendanceController.getAllBreaks);
router.post('/manualClockInOut', requireAdmin,attendanceController.manualClockInOut);
module.exports = router;