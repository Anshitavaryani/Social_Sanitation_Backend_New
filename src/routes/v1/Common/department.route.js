const express = require('express');
const router = express.Router();

const { departmentController } = require('../../../controllers');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/', requireAdmin, departmentController.createDepartment);
router.get('/', publicRoute, departmentController.getAllDeparments);
router.get('/:id', publicRoute, departmentController.findDepartmentById);
router.put('/:id', requireAdmin, departmentController.updateDepartment);
router.delete('/:id', requireAdmin, departmentController.deleteDepartment);

module.exports = router;