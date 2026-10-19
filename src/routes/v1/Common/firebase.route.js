const express = require("express");
const router = express.Router();

const { chatController } = require("../../../controllers");
const { userAuthMiddleware } = require("../../../middlewares");
const { adminAuthMiddleware } = require("../../../middlewares");
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");
const {
  notificationController,
  groupChatController,
} = require("../../../controllers/Common");
const {
  verifyAnyAuthJWTToken,
} = require("../../../middlewares/userAuth.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const adminValidation = require("../../../validations/admin.validation");

//chat apis
router.post(
  "/sendMessage",
  [userAuthMiddleware.verifyAuthJWTToken],
  chatController.sendMessage,
);
router.post(
  "/getAdminMessages",
  [userAuthMiddleware.verifyAuthJWTToken],
  chatController.getAdminMessages,
);
router.post(
  "/markAdminMessagesAsRead/:receiverUserId",
  [userAuthMiddleware.verifyAuthJWTToken],
  chatController.markAdminMessagesAsRead,
);
router.get(
  "/getLastMessage/:receiverUserId",
  [userAuthMiddleware.verifyAuthJWTToken],
  chatController.getLastMessage,
);
router.get(
  "/getChatList",
  [userAuthMiddleware.verifyAuthJWTToken],
  chatController.getChatList,
);

//admin api
router.post(
  "/sendMessageAsAdmin",
  [adminAuthMiddleware.validateJWTtoken],
  chatController.sendMessage,
);
router.post(
  "/sendNotification",
  [adminAuthMiddleware.validateJWTtoken],
  chatController.sendNotification,
);
router.post(
  "/getUserMessages",
  [adminAuthMiddleware.validateJWTtoken],
  chatController.getUserMessages,
);
router.post(
  "/getUserChatList",
  [adminAuthMiddleware.validateJWTtoken],
  chatController.getUserChatList,
);
router.post(
  "/markUserMessagesAsRead",
  [adminAuthMiddleware.validateJWTtoken],
  chatController.markUserMessagesAsRead,
);

//push notification apis
router.post(
  "/sendPushNotification", requireAdmin, validate(adminValidation.sendPushNotification),
  notificationController.sendPushNotification,
);
router.get(
  "/getAllNotificationsOfUser",
  [userAuthMiddleware.verifyAuthJWTToken],
  notificationController.getAllNotificationsOfUser,
);
router.post(
  "/markOneNotificationAsRead",
  [userAuthMiddleware.verifyAuthJWTToken],
  notificationController.markOneNotificationAsRead,
);
router.post(
  "/markAllNotificationAsRead",
  [userAuthMiddleware.verifyAuthJWTToken],
  notificationController.markAllNotificationAsRead,
);

// group chat

router.post(
  "/sendGroupMessage",
  [verifyAnyAuthJWTToken],
  groupChatController.sendGroupMessage,
);
router.get(
  "/myGroups",
  [verifyAnyAuthJWTToken],
  groupChatController.getMyGroups,
);
router.get(
  "/groupMessages/:id",
  [verifyAnyAuthJWTToken],
  groupChatController.getGroupMessages,
);
router.put("/updateGroupName", requireAuth, groupChatController.updateGroupName);
router.get(
  "/getGroupParticipants/:id", requireAuth,
  groupChatController.getGroupParticipants,
);
router.delete("/deleteGroup/:id", requireAuth, groupChatController.deleteGroup);

// Team APIs
router.post(
  "/createTeam",
  [verifyAnyAuthJWTToken],
  groupChatController.createTeam,
);

router.get(
  "/myTeams",
  [verifyAnyAuthJWTToken],
  groupChatController.getMyTeams,
);


router.get(
  "/teamParticipants",
  [verifyAnyAuthJWTToken],
  groupChatController.getAvailableTeamParticipants,
);


router.post(
  "/addTeamMembers",
  [verifyAnyAuthJWTToken],
  groupChatController.addTeamMembers,
);

router.delete(
  "/removeTeamMember",
  [verifyAnyAuthJWTToken],
  groupChatController.removeTeamMember,
);

router.delete(
  "/deleteTeam",
  [verifyAnyAuthJWTToken],
  groupChatController.deleteTeam,
);

module.exports = router;
