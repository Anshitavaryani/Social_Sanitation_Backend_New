const express = require('express');
const router = express.Router();

const { serviceController } = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/createService', requireAdmin, serviceController.createService);
router.get('/getAllServices', publicRoute, serviceController.getAllServices);
router.get('/getAllServicesByAdmin', [adminAuthMiddleware.validateJWTtoken],serviceController.getAllServicesByAdmin);
router.get('/findServiceById/:id', publicRoute, serviceController.findServiceById);
router.put('/updateService/:id', requireAdmin, serviceController.updateService);
router.post('/updateServicePrices', requireAdmin, serviceController.updateServicePrices);
router.get('/getServicePrices', publicRoute, serviceController.getServicePrices);
router.delete('/deleteService/:id', requireAdmin, serviceController.deleteService);

router.get('/getAllServiceNameByAdmin', requireAdmin,serviceController.getAllServiceNameByAdmin);

module.exports = router;