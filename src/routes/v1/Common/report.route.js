const express = require('express');
const router = express.Router();

const { reportController } = require('../../../controllers');
const { userAuthMiddleware, roleMiddleware } = require('../../../middlewares');
const {adminAuthMiddleware} = require('../../../middlewares');

router.post('/reportBooking/:id', [userAuthMiddleware.verifyAuthJWTToken], reportController.reportBooking);
router.get('/getAllReport' , reportController.getAllReport);
router.get('/getAllUserReport' ,[userAuthMiddleware.verifyAuthJWTToken],  reportController.getAllUserReport);
router.post('/updateReportStatus',  [ adminAuthMiddleware.validateJWTtoken], reportController.updateReportStatus);








module.exports = router;