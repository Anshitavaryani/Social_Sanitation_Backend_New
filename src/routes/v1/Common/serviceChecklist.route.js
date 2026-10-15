const express = require('express');
const router = express.Router();

const { serviceChecklistController,dailyChecklistController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.post('/createServiceChecklist', serviceChecklistController.createServiceChecklist);
router.get('/getAllServiceChecklist', serviceChecklistController.getAllServiceChecklist);
router.get('/findServiceChecklistById/:id', serviceChecklistController.findServiceChecklistById);
router.put('/updateServiceChecklist/:id', serviceChecklistController.updateServiceChecklist);
router.post('/deleteServiceChecklist', serviceChecklistController.deleteServiceChecklist);



// dailychecklist

router.post('/createDailyChecklist', dailyChecklistController.createDailyChecklist);
router.post('/createOrUpdateChecklistMainTitle', dailyChecklistController.createOrUpdateChecklistMainTitle);
router.get('/getChecklistMainTitle', dailyChecklistController.getChecklistMainTitle);
router.get('/getDailyChecklist', dailyChecklistController.getDailyChecklist);
router.get('/findDailyChecklistById/:id', dailyChecklistController.findDailyChecklistById);
router.put('/updateDailyChecklist/:id', dailyChecklistController.updateDailyChecklist);
router.post('/deleteDailyChecklist', dailyChecklistController.deleteDailyChecklist);
router.post('/markDailyChecklistItemAsCompleted/:id',[userAuthMiddleware.verifyAuthJWTToken], dailyChecklistController.markDailyChecklistItemAsCompleted);
router.get('/getDailyChecklistWithTodayStatus',[userAuthMiddleware.verifyAuthJWTToken], dailyChecklistController.getDailyChecklistWithTodayStatus);

router.post('/getWeeklyChecklistWithStatus', dailyChecklistController.getWeeklyChecklistWithStatus);
router.get('/getJanitors', dailyChecklistController.getJanitors);

module.exports = router;