const express = require('express');
const router = express.Router();

const {stateController} = require('../../../controllers');
const { publicRoute } = require("../../../middlewares/access.middleware");


router.get('/', publicRoute,stateController.getAllState);
router.get('/:id', publicRoute,stateController.getStateById);

module.exports = router;