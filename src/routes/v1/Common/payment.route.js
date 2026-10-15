const express = require('express');
const router = express.Router();
const { paymentController,squareUpPaymentController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/count', paymentController.getNewPaymentCount);
router.get('/sum', paymentController.getNewPaymentTotal);


router.get('/square/square-key', [userAuthMiddleware.verifyAuthJWTToken], squareUpPaymentController.getSquareKeys);
router.post('/square/create-payment', [userAuthMiddleware.verifyAuthJWTToken], squareUpPaymentController.createPayment);
router.post('/square/webhooks', express.raw({type: 'application/json'}), squareUpPaymentController.handlePaymentWebhook);
router.get('/status/:orderId', paymentController.getPaymentStatus);

module.exports = router;