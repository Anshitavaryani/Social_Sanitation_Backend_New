const express = require('express');
const router = express.Router();

const { userOpController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.use(userAuthMiddleware.setRoleIdIfNotPresent);

router.get('/profile', [userAuthMiddleware.verifyAuthJWTToken], userOpController.getProfile);
router.post('/notifications', [userAuthMiddleware.verifyAuthJWTToken], userOpController.notificationToogle);
router.delete('/deactivate', [userAuthMiddleware.verifyAuthJWTToken], userOpController.deactivateAccount);
router.put('/updateUserProfile', [userAuthMiddleware.verifyAuthJWTToken], userOpController.updateUserProfile);

router.post('/addNewAddress',[userAuthMiddleware.verifyAuthJWTToken], userOpController.addNewAddress);
router.put('/editAddress', userOpController.editAddress);
router.post('/deleteAddress/:id',[userAuthMiddleware.verifyAuthJWTToken], userOpController.deleteAddress);
// router.post('/syncWithCalendar',[userAuthMiddleware.verifyAuthJWTToken], userOpController.syncWithCalendar);
router.get('/getAllUserAddress',[userAuthMiddleware.verifyAuthJWTToken], userOpController.getAllUserAddress);
router.get('/getUserAddressById/:id', userOpController.getUserAddressById);

router.get('/getUserAddressByUserId/:id', userOpController.getUserAddressByUserId);

router.post('/createUserConsent', userOpController.createUserConsent);



module.exports = router;