/** @format */

const express = require("express");
const router = express.Router();

const { quoteController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");

router.post("/createQuestions", quoteController.createQuestions);
router.get("/getAllQuestions", quoteController.getAllQuestions);
router.put("/editQuestion/:id", quoteController.editQuestion);
router.delete("/delete/:id", quoteController.deleteQuestion);
router.get("/getQuoteRequests", quoteController.getQuoteRequests);
router.put("/updateStatus/:id", quoteController.updateStatus);



//user apis
router.post("/submitForm",[userAuthMiddleware.verifyAuthJWTToken], quoteController.submitForm);
router.get("/getQuoteRequestsByUser",[userAuthMiddleware.verifyAuthJWTToken], quoteController.getQuoteRequestsByUser);

module.exports = router;
