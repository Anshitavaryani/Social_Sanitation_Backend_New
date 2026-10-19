const express = require('express');
const router = express.Router();

const { serviceChecklistController,dailyChecklistController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const adminValidation = require("../../../validations/admin.validation");
const ownership = require("../../../middlewares/ownership.middleware");

router.post('/createServiceChecklist', requireAdmin, validate(adminValidation.createChecklist), serviceChecklistController.createServiceChecklist);
router.get('/getAllServiceChecklist', requireAuth, serviceChecklistController.getAllServiceChecklist);
router.get('/findServiceChecklistById/:id', requireAuth, serviceChecklistController.findServiceChecklistById);
router.put('/updateServiceChecklist/:id', requireAdmin, serviceChecklistController.updateServiceChecklist);
router.post('/deleteServiceChecklist', requireAdmin, serviceChecklistController.deleteServiceChecklist);



// dailychecklist

router.post('/createDailyChecklist', requireAdmin, validate(adminValidation.createChecklist), dailyChecklistController.createDailyChecklist);
router.post('/createOrUpdateChecklistMainTitle', requireAdmin, dailyChecklistController.createOrUpdateChecklistMainTitle);
router.get('/getChecklistMainTitle', requireAuth, dailyChecklistController.getChecklistMainTitle);
router.get('/getDailyChecklist', requireAuth, dailyChecklistController.getDailyChecklist);
router.get('/findDailyChecklistById/:id', requireAuth, dailyChecklistController.findDailyChecklistById);
router.put('/updateDailyChecklist/:id', requireAdmin, dailyChecklistController.updateDailyChecklist);
router.post('/deleteDailyChecklist', requireAdmin, dailyChecklistController.deleteDailyChecklist);
router.post('/markDailyChecklistItemAsCompleted/:id',[userAuthMiddleware.verifyAuthJWTToken], dailyChecklistController.markDailyChecklistItemAsCompleted);
router.get('/getDailyChecklistWithTodayStatus',[userAuthMiddleware.verifyAuthJWTToken], dailyChecklistController.getDailyChecklistWithTodayStatus);

router.post('/getWeeklyChecklistWithStatus', requireAuth, ownership.employeeRecords(ownership.bodyField("user_id")), dailyChecklistController.getWeeklyChecklistWithStatus);
router.get('/getJanitors', requireAuth, dailyChecklistController.getJanitors);

module.exports = router;