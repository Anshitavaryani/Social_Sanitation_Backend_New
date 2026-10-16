const express = require('express');
const router = express.Router();

const { reportController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');
const {adminAuthMiddleware} = require('../../../middlewares');
const { requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/reportBooking/:id', [userAuthMiddleware.verifyAuthJWTToken], reportController.reportBooking);
router.get('/getAllReport', requireAdmin , reportController.getAllReport);
router.get('/getAllUserReport' ,[userAuthMiddleware.verifyAuthJWTToken],  reportController.getAllUserReport);
router.post('/updateReportStatus',  [ adminAuthMiddleware.validateJWTtoken], reportController.updateReportStatus);








module.exports = router;