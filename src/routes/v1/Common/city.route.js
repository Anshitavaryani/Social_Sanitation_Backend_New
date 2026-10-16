const express = require('express');
const router = express.Router();

const {cityController} = require('../../../controllers');
const { publicRoute } = require("../../../middlewares/access.middleware");


router.get('/', publicRoute,cityController.getAllCity);
router.get('/:id', publicRoute,cityController.getCityById);

module.exports = router;