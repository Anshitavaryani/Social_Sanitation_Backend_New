/** @format */

const express = require("express");
const router = express.Router();

const { quoteController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const adminValidation = require("../../../validations/admin.validation");

router.post("/createQuestions", requireAdmin, quoteController.createQuestions);
router.get("/getAllQuestions", publicRoute, quoteController.getAllQuestions);
router.put("/editQuestion/:id", requireAdmin, validate(adminValidation.editQuestion), quoteController.editQuestion);
router.delete("/delete/:id", requireAdmin, quoteController.deleteQuestion);
router.get("/getQuoteRequests", requireAdmin, quoteController.getQuoteRequests);
router.put("/updateStatus/:id", requireAdmin, quoteController.updateStatus);



//user apis
router.post("/submitForm",[userAuthMiddleware.verifyAuthJWTToken], quoteController.submitForm);
router.get("/getQuoteRequestsByUser",[userAuthMiddleware.verifyAuthJWTToken], quoteController.getQuoteRequestsByUser);

module.exports = router;
