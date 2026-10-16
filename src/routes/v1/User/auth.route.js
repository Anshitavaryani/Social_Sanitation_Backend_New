const express = require('express');
const router = express.Router();

const {userAuthController } = require('../../../controllers');
const {userAuthMiddleware} = require('../../../middlewares');
const { publicRoute } = require("../../../middlewares/access.middleware");

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.post('/otp', publicRoute, userAuthController.sendOTP);
router.post('/verify-otp', publicRoute, userAuthController.verifyOTP);
router.post('/register', publicRoute, [userAuthMiddleware.validateRegisterUserBody], userAuthController.register);
router.post('/login', publicRoute, [userAuthMiddleware.validateSignInReqBody],userAuthController.login);
router.post('/reset-password', [ userAuthMiddleware.verifyAuthJWTToken], userAuthController.resetPassword);
router.post('/forgot-password', publicRoute,[userAuthMiddleware.validateForgetPassordToken], userAuthController.forgotPassword);
router.get('/logout', [userAuthMiddleware.verifyAuthJWTToken], userAuthController.logout);
router.post('/guestLogin', publicRoute, userAuthController.guestLogin);


module.exports = router;