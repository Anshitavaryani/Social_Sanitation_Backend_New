const express = require('express');
const router = express.Router();

const { calendarController } = require('../../../controllers');
const { userAuthMiddleware, adminAuthMiddleware } = require('../../../middlewares');

router.get('/authorize', [userAuthMiddleware.verifyAuthJWTToken], calendarController.authorize);
router.get('/listEvents', [userAuthMiddleware.verifyAuthJWTToken], calendarController.listEvents);
router.get('/oauth2callback', calendarController.oauth2callback);
router.post('/createCalendarEvent', [userAuthMiddleware.verifyAuthJWTToken], calendarController.createCalendarEvent);
router.post('/deleteCalendarEvent', [userAuthMiddleware.verifyAuthJWTToken], calendarController.deleteCalendarEvent);


router.get('/adminAuthorize', [adminAuthMiddleware.validateJWTtoken], calendarController.adminAuthorize);

router.get('/getValidateToken', [adminAuthMiddleware.validateJWTtoken], calendarController.getValidateToken);

module.exports = router;
