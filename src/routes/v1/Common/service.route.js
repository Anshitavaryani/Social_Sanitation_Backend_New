const express = require('express');
const router = express.Router();

const { serviceController } = require('../../../controllers');
const { adminAuthMiddleware } = require('../../../middlewares');

router.post('/createService', serviceController.createService);
router.get('/getAllServices', serviceController.getAllServices);
router.get('/getAllServicesByAdmin', [adminAuthMiddleware.validateJWTtoken],serviceController.getAllServicesByAdmin);
router.get('/findServiceById/:id', serviceController.findServiceById);
router.put('/updateService/:id', serviceController.updateService);
router.post('/updateServicePrices', serviceController.updateServicePrices);
router.get('/getServicePrices', serviceController.getServicePrices);
router.delete('/deleteService/:id', serviceController.deleteService);

router.get('/getAllServiceNameByAdmin',serviceController.getAllServiceNameByAdmin);

module.exports = router;