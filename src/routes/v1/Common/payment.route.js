const express = require('express');
const router = express.Router();
const { paymentController,squareUpPaymentController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/count', requireAdmin, paymentController.getNewPaymentCount);
router.get('/sum', requireAdmin, paymentController.getNewPaymentTotal);


router.get('/square/square-key', [userAuthMiddleware.verifyAuthJWTToken], squareUpPaymentController.getSquareKeys);
router.post('/square/create-payment', [userAuthMiddleware.verifyAuthJWTToken], squareUpPaymentController.createPayment);
router.post('/square/webhooks', publicRoute, express.raw({type: 'application/json'}), squareUpPaymentController.handlePaymentWebhook);
router.get('/status/:orderId', publicRoute, paymentController.getPaymentStatus);

module.exports = router;