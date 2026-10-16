const express = require("express");
const router = express.Router();

const { formController } = require("../../../controllers");
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const publicValidation = require("../../../validations/public.validation");

router.post("/submitForm", publicRoute, validate(publicValidation.submitForm), formController.submitForm);
router.get("/getAllForm", requireAdmin, formController.getAllForm);
router.get("/getFormById/:id", requireAdmin, formController.getFormById);
router.post("/deleteForm", requireAdmin, formController.deleteForm);

router.get("/hiring-forms-by-email", requireAdmin, formController.getHiringFormsByEmail);

module.exports = router;
