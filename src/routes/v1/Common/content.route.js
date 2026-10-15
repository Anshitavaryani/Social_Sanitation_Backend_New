const express = require('express');
const router = express.Router();

const { aboutUSController } = require('../../../controllers');
const { termsAndConditionsController } = require('../../../controllers');
const { bannerController} = require("../../../controllers");
const { roleMiddleware, adminAuthMiddleware } = require('../../../middlewares');


router.post('/createAboutUs', aboutUSController.createAboutUs);
router.get('/getAllAboutUs', aboutUSController.getAllAboutUs);
router.get('/getAllAboutUsByAdmin', [adminAuthMiddleware.validateJWTtoken,roleMiddleware.isAdminLevelOne], aboutUSController.getAllAboutUsByAdmin);
router.get('/findAboutUsById/:id', aboutUSController.findAboutUsById);
router.put('/updateAboutUs/:id', aboutUSController.updateAboutUs);
router.delete('/deleteAboutUs/:id', aboutUSController.deleteAboutUs);



router.post('/createTermsAndConditons', termsAndConditionsController.createTermsAndConditons);
router.get('/getAllTermsAndConditons', termsAndConditionsController.getAllTermsAndConditons);
router.get('/getAllTermsAndConditonsByAdmin', [adminAuthMiddleware.validateJWTtoken,roleMiddleware.isAdminLevelOne], termsAndConditionsController.getAllTermsAndConditonsByAdmin);
router.get('/findTermsAndConditonsById/:id', termsAndConditionsController.findTermsAndConditonsById);
router.put('/updateTermsAndConditons/:id', termsAndConditionsController.updateTermsAndConditons);
router.delete('/deleteTermsAndConditons/:id', termsAndConditionsController.deleteTermsAndConditons);


router.post('/createBanner', bannerController.createBanner);
router.get('/getAllBannerImgae', bannerController.getAllBannerImgae);
router.get('/findBannerImgaeById/:id', bannerController.findBannerImgaeById);
router.put('/updateBannerImgaeById/:id', bannerController.updateBannerImgaeById);
router.delete('/deleteBannerImgaeById/:id', bannerController.deleteBannerImgaeById);
router.get('/getAllBannerImgaeByAdmin',[adminAuthMiddleware.validateJWTtoken,roleMiddleware.isAdminLevelOne],  bannerController.getAllBannerImgaeByAdmin);

module.exports = router;