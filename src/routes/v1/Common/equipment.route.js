const express = require("express");
const { equipmentController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");
const ownership = require("../../../middlewares/ownership.middleware");
const router = express.Router();



router.get("/get-all-equipments", requireAdmin, equipmentController.getAllEquipments);
router.post("/create-equipment", requireAdmin, equipmentController.createEquipment);
router.put("/update-equipment/:id", requireAdmin, equipmentController.updateEquipment);
router.delete("/delete-equipment/:id", requireAdmin, equipmentController.deleteEquipment);

router.post("/assign-equipment", requireAdmin, equipmentController.assignEquipment);
router.put("/update-assignment/:id", requireAdmin, equipmentController.updateAssignment);
router.get("/get-all-assignments", requireAdmin, equipmentController.getAllAssignments);
router.get("/assignment-overview", requireAdmin, equipmentController.assignmentOverview);


router.get("/assignment/:assignmentId/history", requireAdmin,equipmentController.getAssignmentEquipmentHistory);
router.get("/employee/equipment-records", requireAdmin,equipmentController.getMonthlyEmployeeEquipmentRecords);
router.post("/assignment/:assignmentId/form/send", requireAdmin,equipmentController.sendEmployeeEquipmentForm);

// equipment signature routes

router.get("/my-equipment",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.getMyEquipment);
router.post("/my-equipment/sign/:assignmentId",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.signEquipment);
router.get("/my-equipment/:assignmentId/signatures",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.getEquipmentSignatureHistory);

router.get("/employee/:employeeId/equipment", requireAuth, ownership.employeeRecords(ownership.param("employeeId")),equipmentController.getEquipmentByEmployeeId);

module.exports = router;
