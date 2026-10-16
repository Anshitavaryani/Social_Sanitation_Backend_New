const express = require("express");
const { calculatorController } = require("../../../controllers");
const { requireAdmin } = require("../../../middlewares/access.middleware");
const router = express.Router();


router.post("/cost-calculator", requireAdmin, calculatorController.createCostCalculator);
router.get("/cost-calculator/:id", requireAdmin, calculatorController.getCostCalculationById);
router.get("/cost-calculator", requireAdmin, calculatorController.getAllCostCalculations);
router.delete("/cost-calculator/:id", requireAdmin,calculatorController.deleteCostCalculation);
router.post("/bid-maximizer", requireAdmin, calculatorController.createBidMaximizer);

router.get("/cost-calculation-settings", requireAdmin, calculatorController.getCostCalculationSettings);
router.post("/update-calculation-settings", requireAdmin, calculatorController.updateCostCalculationSetting);



module.exports = router;
