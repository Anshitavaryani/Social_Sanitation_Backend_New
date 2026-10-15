const express = require("express");
const router = express.Router();

const { formController } = require("../../../controllers");

router.post("/submitForm", formController.submitForm);
router.get("/getAllForm", formController.getAllForm);
router.get("/getFormById/:id", formController.getFormById);
router.post("/deleteForm", formController.deleteForm);

router.get("/hiring-forms-by-email", formController.getHiringFormsByEmail);

module.exports = router;
