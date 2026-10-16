const express = require('express');
const router = express.Router();

const {roleController} = require('../../../controllers');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/', requireAdmin , roleController.createRole);
router.get('/:id', publicRoute , roleController.findRoleById);
router.get('/', publicRoute , roleController.getAllRoles);
router.put('/:id', requireAdmin , roleController.updateRole);
router.delete('/:id', requireAdmin , roleController.deleteRole);

module.exports = router;