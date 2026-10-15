const express = require('express');
const router = express.Router();

const { contactUsController } = require('../../../controllers');
const {adminAuthMiddleware, roleMiddleware} = require('../../../middlewares');

router.post('/createContactUs', contactUsController.createContactUs);
router.get('/findContactUsById/:id', contactUsController.findContactUsById);
router.put('/updateContactUs/:id', contactUsController.updateContactUs);
router.get('/getContactUs', contactUsController.getContactUs);
router.get('/getAllContactUs',[adminAuthMiddleware.validateJWTtoken,roleMiddleware.isAdminLevelOne], contactUsController.getAllContactUs);
router.delete('/deleteContactUs/:id', contactUsController.deleteContactUs);


module.exports = router;