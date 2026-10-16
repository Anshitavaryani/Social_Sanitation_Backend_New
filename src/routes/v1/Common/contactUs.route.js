const express = require('express');
const router = express.Router();

const { contactUsController } = require('../../../controllers');
const {adminAuthMiddleware, roleMiddleware} = require('../../../middlewares');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/createContactUs', publicRoute, contactUsController.createContactUs);
router.get('/findContactUsById/:id', requireAdmin, contactUsController.findContactUsById);
router.put('/updateContactUs/:id', requireAdmin, contactUsController.updateContactUs);
router.get('/getContactUs', publicRoute, contactUsController.getContactUs);
router.get('/getAllContactUs',[adminAuthMiddleware.validateJWTtoken,roleMiddleware.isAdminLevelOne], contactUsController.getAllContactUs);
router.delete('/deleteContactUs/:id', requireAdmin, contactUsController.deleteContactUs);


module.exports = router;