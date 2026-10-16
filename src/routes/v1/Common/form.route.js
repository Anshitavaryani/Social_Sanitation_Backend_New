const express = require("express");
const router = express.Router();

const { formController } = require("../../../controllers");
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post("/submitForm", publicRoute, formController.submitForm);
router.get("/getAllForm", requireAdmin, formController.getAllForm);
router.get("/getFormById/:id", requireAdmin, formController.getFormById);
router.post("/deleteForm", requireAdmin, formController.deleteForm);

router.get("/hiring-forms-by-email", requireAdmin, formController.getHiringFormsByEmail);

module.exports = router;
