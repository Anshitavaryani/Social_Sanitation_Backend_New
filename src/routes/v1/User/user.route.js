const express = require('express');
const router = express.Router();

const { userOpController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');
const { publicRoute, requireAuth } = require("../../../middlewares/access.middleware");

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/profile', [userAuthMiddleware.verifyAuthJWTToken], userOpController.getProfile);
router.post('/notifications', [userAuthMiddleware.verifyAuthJWTToken], userOpController.notificationToggle);
router.delete('/deactivate', [userAuthMiddleware.verifyAuthJWTToken], userOpController.deactivateAccount);
router.put('/updateUserProfile', [userAuthMiddleware.verifyAuthJWTToken], userOpController.updateUserProfile);

router.post('/addNewAddress',[userAuthMiddleware.verifyAuthJWTToken], userOpController.addNewAddress);
router.put('/editAddress', requireAuth, userOpController.editAddress);
router.post('/deleteAddress/:id',[userAuthMiddleware.verifyAuthJWTToken], userOpController.deleteAddress);
router.get('/getAllUserAddress',[userAuthMiddleware.verifyAuthJWTToken], userOpController.getAllUserAddress);
router.get('/getUserAddressById/:id', requireAuth, userOpController.getUserAddressById);

router.get('/getUserAddressByUserId/:id', requireAuth, userOpController.getUserAddressByUserId);

router.post('/createUserConsent', publicRoute, userOpController.createUserConsent);



module.exports = router;