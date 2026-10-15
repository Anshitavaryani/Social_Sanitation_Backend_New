const express = require("express");
const { equipmentController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");
const router = express.Router();



router.get("/get-all-equipments", equipmentController.getAllEquipments);
router.post("/create-equipment", equipmentController.createEquipment);
router.put("/update-equipment/:id", equipmentController.updateEquipment);
router.delete("/delete-equipment/:id", equipmentController.deleteEquipment);

router.post("/assign-equipment", equipmentController.assignEquipment);
router.put("/update-assignment/:id", equipmentController.updateAssignment);
router.get("/get-all-assignments", equipmentController.getAllAssignments);
router.get("/assignment-overview", equipmentController.assignmentOverview);


router.get("/assignment/:assignmentId/history",equipmentController.getAssignmentEquipmentHistory);
router.get("/employee/equipment-records",equipmentController.getMonthlyEmployeeEquipmentRecords);
router.post("/assignment/:assignmentId/form/send",equipmentController.sendEmployeeEquipmentForm);

// equipment signature routes

router.get("/my-equipment",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.getMyEquipment);
router.post("/my-equipment/sign/:assignmentId",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.signEquipment);
router.get("/my-equipment/:assignmentId/signatures",[userAuthMiddleware.verifyAuthJWTToken],equipmentController.getEquipmentSignatureHistory);

router.get("/employee/:employeeId/equipment",equipmentController.getEquipmentByEmployeeId);

module.exports = router;
