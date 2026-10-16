const express = require('express');
const router = express.Router();

const {adminAuthController, serviceEstimateController} = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');
const { publicRoute, requireAdmin, requireAdminRole, requireAuth } = require("../../../middlewares/access.middleware");
const config = require("../../../config/config");

router.post('/register', ...requireAdminRole(config.SUP_ADM_ROLE_ID, config.ADM_ROLE_ID), adminAuthMiddleware.restrictSuperAdminCreation,  adminAuthController.createAdminUser);
router.post('/login', publicRoute, [adminAuthMiddleware.validateLoginAdminBody], adminAuthController.loginAdminUser);
router.post('/change-password',  [ adminAuthMiddleware.validateResetPassordBody, adminAuthMiddleware.validateJWTtoken], adminAuthController.resetAdminPassword);
router.post('/otp', publicRoute,  adminAuthController.sendOTP);
router.post('/verify-otp', publicRoute,  adminAuthController.verifyOTP);
router.post('/forgot-password', publicRoute,  adminAuthController.forgotAdminPassword);
router.put('/updateAdmin',[adminAuthMiddleware.validateJWTtoken],adminAuthController.updateAdmin);
router.delete('/deleteAdmin',[adminAuthMiddleware.validateJWTtoken],adminAuthController.deleteAdmin);
router.get('/getAllAdmins',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getAllAdmins);
router.get('/getProfile',[adminAuthMiddleware.validateJWTtoken],adminAuthController.getProfile);
router.get('/findAdminById', requireAuth,adminAuthController.findAdminById);


// pdf route
router.post('/generate-estimate-pdf', requireAdmin, serviceEstimateController.generateEstimatePDFController);
router.get('/scope-of-work-pdf/:userId', requireAdmin, serviceEstimateController.downloadScopeOfWorkPDFController);
router.get('/service-estimate/:id', requireAdmin, serviceEstimateController.getServiceEstimateById);
router.get('/getAllServiceEstimates', requireAdmin, serviceEstimateController.getAllServiceEstimate);
router.get('/service-estimate/user/:user_id', requireAdmin, serviceEstimateController.getServiceEstimateByUserId);
router.put('/update-service-estimate', requireAdmin,  serviceEstimateController.updateServiceEstimate);
router.get('/resume-signing/:id', requireAdmin,  serviceEstimateController.resumeSigningService);
router.delete('/deleteServiceEstimate/:id', requireAdmin, serviceEstimateController.deleteServiceEstimate);

router.post('/generate-contract-agreement', requireAdmin, serviceEstimateController.generateContractAgreementController);
router.get('/getAllContractAgreements', requireAdmin, serviceEstimateController.getAllContractAgreement);
router.get('/contract-agreement/:id', requireAdmin, serviceEstimateController.getContractAgreementById);
router.put('/updateContractAgreement', requireAdmin, serviceEstimateController.updateContractAgreement);
router.get('/contract-agreement/user/:user_id', requireAdmin, serviceEstimateController.getContractAgreementByUserId);
router.get('/resume-contract-signing/:id', requireAdmin,  serviceEstimateController.resumeContractAgreement);
router.delete('/deleteContractAgreement/:id', requireAdmin, serviceEstimateController.deleteContractAgreement);



router.post("/docusign/webhook", publicRoute, serviceEstimateController.handleDocusignWebhook);



router.post('/scope/section', requireAdmin, serviceEstimateController.createScopeSection);
router.put('/scope/section/:id', requireAdmin, serviceEstimateController.updateScopeSection);
router.delete('/scope/section/:id', requireAdmin, serviceEstimateController.deleteScopeSection);
router.post('/scope/item', requireAdmin, serviceEstimateController.createScopeItem);
router.put('/scope/item/:id', requireAdmin, serviceEstimateController.updateScopeItem);
router.delete('/scope/item/:id', requireAdmin, serviceEstimateController.deleteScopeItem);
router.get('/scope', requireAdmin, serviceEstimateController.getScope);

router.get('/user-scope/:userId', requireAdmin, serviceEstimateController.getUserScope);
router.get('/user-scope-view/:userId', requireAdmin, serviceEstimateController.getUserScopeView);
router.get('/user-scope/:userId/exists', requireAdmin, serviceEstimateController.checkUserScopeExists);
router.post('/user-scope-section', requireAdmin, serviceEstimateController.createUserScopeSection);
router.put('/user-scope-section/:id', requireAdmin, serviceEstimateController.updateUserScopeSection);
router.delete('/user-scope-section/:id', requireAdmin, serviceEstimateController.deleteUserScopeSection);
router.post('/user-scope-item/:id', requireAdmin, serviceEstimateController.createUserScopeItem);
router.put('/user-scope-item/:id', requireAdmin, serviceEstimateController.updateUserScopeItem);
router.delete('/user-scope-item/:id', requireAdmin, serviceEstimateController.deleteUserScopeItem);

router.patch("/scope/section/reorder", requireAdmin, serviceEstimateController.reorderUserScopeSections);
router.patch("/scope/item/reorder", requireAdmin, serviceEstimateController.reorderUserScopeItems);


router.get('/estimate-scope/:id', requireAdmin, serviceEstimateController.getEstimateScope);
router.post('/estimate-section/:id', requireAdmin, serviceEstimateController.createEstimateSection);
router.put('/estimate-section/:id', requireAdmin, serviceEstimateController.updateEstimateSection);
router.delete('/estimate-section/:id', requireAdmin, serviceEstimateController.deleteEstimateSection);

router.post('/estimate-item/:id', requireAdmin, serviceEstimateController.createEstimateItem);
router.put('/estimate-item/:id', requireAdmin, serviceEstimateController.updateEstimateItem);
router.delete('/estimate-item/:id', requireAdmin, serviceEstimateController.deleteEstimateItem);


module.exports = router;