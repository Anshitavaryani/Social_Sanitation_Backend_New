const express = require('express');
const router = express.Router();

const { aboutUSController } = require('../../../controllers');
const { termsAndConditionsController } = require('../../../controllers');
const { bannerController} = require("../../../controllers");
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");


router.post('/createAboutUs', requireAdmin, aboutUSController.createAboutUs);
router.get('/getAllAboutUs', publicRoute, aboutUSController.getAllAboutUs);
router.get('/getAllAboutUsByAdmin', requireAdmin, aboutUSController.getAllAboutUsByAdmin);
router.get('/findAboutUsById/:id', publicRoute, aboutUSController.findAboutUsById);
router.put('/updateAboutUs/:id', requireAdmin, aboutUSController.updateAboutUs);
router.delete('/deleteAboutUs/:id', requireAdmin, aboutUSController.deleteAboutUs);



router.post('/createTermsAndConditons', requireAdmin, termsAndConditionsController.createTermsAndConditons);
router.get('/getAllTermsAndConditons', publicRoute, termsAndConditionsController.getAllTermsAndConditons);
router.get('/getAllTermsAndConditonsByAdmin', requireAdmin, termsAndConditionsController.getAllTermsAndConditonsByAdmin);
router.get('/findTermsAndConditonsById/:id', publicRoute, termsAndConditionsController.findTermsAndConditonsById);
router.put('/updateTermsAndConditons/:id', requireAdmin, termsAndConditionsController.updateTermsAndConditons);
router.delete('/deleteTermsAndConditons/:id', requireAdmin, termsAndConditionsController.deleteTermsAndConditons);


router.post('/createBanner', requireAdmin, bannerController.createBanner);
router.get('/getAllBannerImgae', publicRoute, bannerController.getAllBannerImgae);
router.get('/findBannerImgaeById/:id', publicRoute, bannerController.findBannerImgaeById);
router.put('/updateBannerImgaeById/:id', requireAdmin, bannerController.updateBannerImgaeById);
router.delete('/deleteBannerImgaeById/:id', requireAdmin, bannerController.deleteBannerImgaeById);
router.get('/getAllBannerImgaeByAdmin',requireAdmin,  bannerController.getAllBannerImgaeByAdmin);

module.exports = router;