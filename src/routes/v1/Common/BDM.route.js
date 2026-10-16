const express = require('express');
const router = express.Router();

const {BDMController} = require('../../../controllers');
const {adminAuthMiddleware} = require('../../../middlewares');
const { requireAdmin } = require("../../../middlewares/access.middleware");


router.post('/assignUser', requireAdmin,BDMController.assignUser);
router.get('/getAllBDMs', requireAdmin,BDMController.getAllBDMs);
router.get("/bdm-by-user/:user_id", requireAdmin, BDMController.getBDMByUserIdController);
router.post('/deleteBDM', requireAdmin,BDMController.deleteBDM);
router.get('/getAllUsers', requireAdmin,BDMController.getAllUsers);
router.get('/getAllUsersByBDMId/:id', requireAdmin,BDMController.getAllUsersByBDMId);
router.get('/getAllBookingsByBDMId',[adminAuthMiddleware.validateJWTtoken],BDMController.getAllBookingsByBDMId);



module.exports = router;