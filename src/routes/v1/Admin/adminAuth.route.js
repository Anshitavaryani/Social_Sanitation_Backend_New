const express = require('express');
const router = express.Router();

const {adminAuthController, serviceEstimateController} = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');

router.post('/register',  adminAuthController.createAdminUser);
router.post('/login', [adminAuthMiddleware.validateLoginAdminBody], adminAuthController.loginAdminUser);
router.post('/change-password',  [ adminAuthMiddleware.validateResetPassordBody, adminAuthMiddleware.validateJWTtoken], adminAuthController.resetAdminPassword);
router.post('/otp',  adminAuthController.sendOTP);
router.post('/verify-otp',  adminAuthController.verifyOTP);
router.post('/forgot-password',  adminAuthController.forgotAdminPassword);
router.put('/updateAdmin',[adminAuthMiddleware.validateJWTtoken],adminAuthController.updateAdmin);
router.delete('/deleteAdmin',[adminAuthMiddleware.validateJWTtoken],adminAuthController.deleteAdmin);
router.get('/getAllAdmins',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getAllAdmins);
router.get('/getProfile',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getProfile);
router.get('/findAdminById',adminAuthController.findAdminById);


// pdf route
router.post('/generate-estimate-pdf', serviceEstimateController.generateEstimatePDFController);
router.get('/scope-of-work-pdf/:userId', serviceEstimateController.downloadScopeOfWorkPDFController);
router.get('/service-estimate/:id', serviceEstimateController.getServiceEstimateById);
router.get('/getAllServiceEstimates', serviceEstimateController.getAllServiceEstimate);
router.get('/service-estimate/user/:user_id', serviceEstimateController.getServiceEstimateByUserId);
router.put('/update-service-estimate',  serviceEstimateController.updateServiceEstimate);
router.get('/resume-signing/:id',  serviceEstimateController.resumeSigningService);
router.delete('/deleteServiceEstimate/:id', serviceEstimateController.deleteServiceEstimate);

router.post('/generate-contract-agreement', serviceEstimateController.generateContractAgreementController);
router.get('/getAllContractAgreements', serviceEstimateController.getAllContractAgreement);
router.get('/contract-agreement/:id', serviceEstimateController.getContractAgreementById);
router.put('/updateContractAgreement', serviceEstimateController.updateContractAgreement);
router.get('/contract-agreement/user/:user_id', serviceEstimateController.getContractAgreementByUserId);
router.get('/resume-contract-signing/:id',  serviceEstimateController.resumeContractAgreement);
router.delete('/deleteContractAgreement/:id', serviceEstimateController.deleteContractAgreement);



router.post("/docusign/webhook", serviceEstimateController.handleDocusignWebhook);



router.post('/scope/section', serviceEstimateController.createScopeSection);
router.put('/scope/section/:id', serviceEstimateController.updateScopeSection);
router.delete('/scope/section/:id', serviceEstimateController.deleteScopeSection);
router.post('/scope/item', serviceEstimateController.createScopeItem);
router.put('/scope/item/:id', serviceEstimateController.updateScopeItem);
router.delete('/scope/item/:id', serviceEstimateController.deleteScopeItem);
router.get('/scope', serviceEstimateController.getScope);

router.get('/user-scope/:userId', serviceEstimateController.getUserScope);
router.get('/user-scope-view/:userId', serviceEstimateController.getUserScopeView);
router.get('/user-scope/:userId/exists', serviceEstimateController.checkUserScopeExists);
router.post('/user-scope-section', serviceEstimateController.createUserScopeSection);
router.put('/user-scope-section/:id', serviceEstimateController.updateUserScopeSection);
router.delete('/user-scope-section/:id', serviceEstimateController.deleteUserScopeSection);
router.post('/user-scope-item/:id', serviceEstimateController.createUserScopeItem);
router.put('/user-scope-item/:id', serviceEstimateController.updateUserScopeItem);
router.delete('/user-scope-item/:id', serviceEstimateController.deleteUserScopeItem);

router.patch("/scope/section/reorder", serviceEstimateController.reorderUserScopeSections);
router.patch("/scope/item/reorder", serviceEstimateController.reorderUserScopeItems);


router.get('/estimate-scope/:id', serviceEstimateController.getEstimateScope);
router.post('/estimate-section/:id', serviceEstimateController.createEstimateSection);
router.put('/estimate-section/:id', serviceEstimateController.updateEstimateSection);
router.delete('/estimate-section/:id', serviceEstimateController.deleteEstimateSection);

router.post('/estimate-item/:id', serviceEstimateController.createEstimateItem);
router.put('/estimate-item/:id', serviceEstimateController.updateEstimateItem);
router.delete('/estimate-item/:id', serviceEstimateController.deleteEstimateItem);


module.exports = router;