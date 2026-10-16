const express = require('express');
const router = express.Router();

const {countryController} = require('../../../controllers');
const { publicRoute } = require("../../../middlewares/access.middleware");


router.get('/', publicRoute,countryController.getAllCountry);
router.get('/:id', publicRoute,countryController.getCountryId);

module.exports = router;