const express = require('express');
const router = express.Router();

const {BDMController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');


router.post('/assignUser',BDMController.assignUser);
router.get('/getAllBDMs',BDMController.getAllBDMs);
router.get("/bdm-by-user/:user_id", BDMController.getBDMByUserIdController);
router.post('/deleteBDM',BDMController.deleteBDM);
router.get('/getAllUsers',BDMController.getAllUsers);
router.get('/getAllUsersByBDMId/:id',BDMController.getAllUsersByBDMId);
router.get('/getAllBookingsByBDMId',[adminAuthMiddleware.validateJWTtoken],BDMController.getAllBookingsByBDMId);



module.exports = router;