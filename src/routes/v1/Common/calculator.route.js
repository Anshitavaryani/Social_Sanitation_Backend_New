const express = require("express");
const { calculatorController } = require("../../../controllers");
const router = express.Router();


router.post("/cost-calculator", calculatorController.createCostCalculator);
router.get("/cost-calculator/:id", calculatorController.getCostCalculationById);
router.get("/cost-calculator", calculatorController.getAllCostCalculations);
router.delete("/cost-calculator/:id",calculatorController.deleteCostCalculation);
router.post("/bid-maximizer", calculatorController.createBidMaximizer);

router.get("/cost-calculation-settings", calculatorController.getCostCalculationSettings);
router.post("/update-calculation-settings", calculatorController.updateCostCalculationSetting);



module.exports = router;
