const express = require('express');
const router = express.Router();

const { contactUsController } = require('../../../controllers');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const publicValidation = require("../../../validations/public.validation");

router.post('/createContactUs', publicRoute, validate(publicValidation.createContactUs), contactUsController.createContactUs);
router.get('/findContactUsById/:id', requireAdmin, contactUsController.findContactUsById);
router.put('/updateContactUs/:id', requireAdmin, contactUsController.updateContactUs);
router.get('/getContactUs', publicRoute, contactUsController.getContactUs);
router.get('/getAllContactUs',requireAdmin, contactUsController.getAllContactUs);
router.delete('/deleteContactUs/:id', requireAdmin, contactUsController.deleteContactUs);


module.exports = router;