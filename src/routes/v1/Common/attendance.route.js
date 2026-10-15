const express = require('express');
const router = express.Router();

const {attendanceController} = require('../../../controllers');
const { userAuthMiddleware} = require('../../../middlewares');


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
router.post('/updateLeaveStatus/:id',attendanceController.updateLeaveStatus);
router.get('/getAllLeaveRequest',attendanceController.getAllLeaveRequest);
router.post('/getAttendanceByUserId/:id',attendanceController.getAttendanceByUserId);
router.post('/getAllAttendance',attendanceController.getAllAttendance);
router.post('/getTodayAttendanceStats',attendanceController.getTodayAttendanceStats);

router.post('/getDailyPresenceForMonth',attendanceController.getDailyPresenceForMonth);

router.post('/getAllBreaks',attendanceController.getAllBreaks);
router.post('/manualClockInOut',attendanceController.manualClockInOut);
module.exports = router;