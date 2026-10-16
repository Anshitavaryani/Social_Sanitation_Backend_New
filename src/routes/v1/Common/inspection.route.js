const express = require("express");
const router = express.Router();

const { inspectionController } = require("../../../controllers");
const { requireAuth } = require("../../../middlewares/access.middleware");
const {
  adminAuthMiddleware,
  userAuthMiddleware,
} = require("../../../middlewares");

// bdm api routes
router.post(
  "/create",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.createInspection,
);

router.post(
  "/getMyInspections",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.getMyInspectionsByBDM,
);

router.delete(
  "/deleteInspection/:inspectionId",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.deleteInspection,
);

router.post(
  "/sendToClient/:inspectionId",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.sendInspectionToClient,
);

router.get(
  "/getInspectionById/:inspectionId", requireAuth,
  inspectionController.getInspectionById,
);

router.put(
  "/reviewInspectionItem/:itemId",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.reviewInspectionItem,
);

router.put(
  "/reviewInspectionSection/:sectionReviewId",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.reviewInspectionSection,
);

router.post(
  "/reviewItem/:itemId/image",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.uploadBDMInspectionItemImage,
);

router.post(
  "/completeInspection/:inspectionId",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.completeInspection,
);

// employee api routes
router.get(
  "/getMyAssignedInspections",
  [userAuthMiddleware.verifyAuthJWTToken],
  inspectionController.getMyAssignedInspections,
);

router.put(
  "/updateInspectionItem/:itemId",
  [userAuthMiddleware.verifyAuthJWTToken],
  inspectionController.updateInspectionItem,
);

router.post(
  "/submitInspection/:inspectionId",
  [userAuthMiddleware.verifyAuthJWTToken],
  inspectionController.submitInspection,
);
router.post(
  "/item/:itemId/image",
  [userAuthMiddleware.verifyAuthJWTToken],
  inspectionController.uploadInspectionItemImage,
);

router.delete(
  "/item/image/:imageId",
  [userAuthMiddleware.verifyAuthJWTToken],
  inspectionController.deleteInspectionItemImage,
);

router.get(
  "/employee/:employeeId", requireAuth,
  inspectionController.getInspectionsByEmployeeId,
);

router.post(
  "/:inspectionId/reopen",
  [adminAuthMiddleware.validateJWTtoken],
  inspectionController.reopenInspection,
);

module.exports = router;
