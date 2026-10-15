const express = require('express');
const router = express.Router();

const { bookingController } = require('../../../controllers');
const { userAuthMiddleware, roleMiddleware } = require('../../../middlewares');
const {adminAuthMiddleware} = require('../../../middlewares');


//user apis
router.post('/createBooking',[userAuthMiddleware.verifyAuthJWTToken], bookingController.createBooking);
router.post('/getAllUserBooking',[userAuthMiddleware.verifyAuthJWTToken], bookingController.getAllUserBooking);
router.get('/getBookingById/:id',bookingController.getBookingById);
router.post('/cancelBookingbyUser',[userAuthMiddleware.verifyAuthJWTToken], bookingController.cancelBookingbyUser);



//sp apis
router.post('/getAllEmployeeBooking',[userAuthMiddleware.verifyAuthJWTToken], bookingController.getAllEmployeeBooking);
router.post('/updateBookingStatusByEmployee',[userAuthMiddleware.verifyAuthJWTToken], bookingController.updateBookingStatusByEmployee);
router.post('/uploadImages',[userAuthMiddleware.verifyAuthJWTToken], bookingController.uploadImages);
router.get('/getAllServiceCheckList/:id',[userAuthMiddleware.verifyAuthJWTToken], bookingController.getAllServiceCheckList);
router.get('/getAllServiceCheckListByUserForBookingId/:id', bookingController.getAllServiceCheckListByUserForBookingId);
router.get('/getAllServiceCheckListByBookingId/:id', bookingController.getAllServiceCheckListByBookingId);
router.post('/markChecklistItemAsCompleted/:id',[userAuthMiddleware.verifyAuthJWTToken], bookingController.markChecklistItemAsCompleted);
router.get('/getTodaysBooking',[userAuthMiddleware.verifyAuthJWTToken], bookingController.getTodaysBooking);
router.get('/getCompletedBooking',[userAuthMiddleware.verifyAuthJWTToken], bookingController.getCompletedBooking);





module.exports = router;