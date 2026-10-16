const express = require('express');
const router = express.Router();

const { faqController } = require('../../../controllers');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/', requireAdmin , faqController.createFaq);
router.get('/', publicRoute , faqController.getAllFaq);
router.put('/:id', requireAdmin , faqController.updateFaq);
router.delete('/:id', requireAdmin , faqController.deleteFaq);

module.exports = router;