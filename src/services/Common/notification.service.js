const { getMessaging } = require('firebase-admin/messaging');
const logger = require("../../config/logger");
const { Notification, UserToken } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { status: httpStatus } = require("http-status");
const { Op } = require("sequelize");

const sendPushNotification = async (notificationObj, registrationTokens, sound = "default") => {
  if (!registrationTokens || registrationTokens.length === 0) {
    throw new Error("Registration tokens must be a non-empty array");
  }
  const message = {
    notification: {
      ...notificationObj,
    },
    tokens: registrationTokens,
    android: {
      priority: "high",
      ttl: 60 * 60 * 24 * 1000, // 24 hours in ms
    },
    apns: {
      headers: {
        "apns-priority": "10", // high priority
      },
      payload: {
        aps: {
          sound, // e.g., "default" or custom sound name
        },
      },
    },
  };


  try {
    await getMessaging().sendEachForMulticast(message);
 
    return "Notification sent successfully";
  } catch (error) {
    logger.error("Error sending push notification:", error);
    throw error;
  }
};

// Push tokens of the user's active sessions; empty when the user has none (notifications off,
// or never signed in on a phone). Callers skip the push in that case.
const getUserActiveFCMTokens = async (user) => {
	if (!user?.id || !user?.role_id) {
		throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user object");
	}

	const fcmTokenDocs = await UserToken.findAll({
		where: {
			user_id: user.id,
			role_id: user.role_id,
			is_active: true,
			fcm_token: {
				[Op.ne]: null,
			},
		},
		attributes: ["fcm_token"],
	});

	const receiverUniqueFCMTokensSet = new Set(
		fcmTokenDocs.map((token) => token.fcm_token)
	);

	return Array.from(receiverUniqueFCMTokensSet);
};


const getAllNotificationsOfUser = async (body) => {
  try {
    const { user } = body;

    // Find all active notifications for the user
    const notificationDocs = await Notification.findAll({
      where: {
        user_id: user.id,
        is_active: true,
      },
    });

    if (!notificationDocs || notificationDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "No active notifications found"
      );
    }

    // Count active notifications
    const activeNotificationCount = notificationDocs.length;

    // Return the result along with the active notifications count
    return {
      notifications: notificationDocs,
      activeNotificationCount: activeNotificationCount,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const markOneNotificationAsRead = async (body) => {
  try {
    const { user, notification_id } = body;

    // Find the notification for the user by ID
    const notificationDoc = await Notification.findOne({
      where: {
        user_id: user.id,
        id: notification_id,
        is_active: true,
      },
    });

    if (!notificationDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "This notification id doesn't exist or is not active"
      );
    }

    // Mark the notification as read (set is_active to false)
    await notificationDoc.update({ is_active: false });

    // Optionally, you can return the updated notification
    return notificationDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const markAllNotificationAsRead = async (body) => {
  try {
    const { user } = body;

    // Find all active notifications for the user
    const notifications = await Notification.findAll({
      where: {
        user_id: user.id,
        is_active: true,
      },
    });

    if (!notifications || notifications.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "No active notifications found"
      );
    }

    // Mark all notifications as read (set is_active to false)
    await Notification.update(
      { is_active: false },
      {
        where: {
          user_id: user.id,
          is_active: true,
        },
      }
    );

    // Optionally, you can return the updated notifications
    return "";
  } catch (error) {
    throw ApiError.from(error);
  }
};

module.exports = {
  sendPushNotification,
  getUserActiveFCMTokens,
  getAllNotificationsOfUser,
  markOneNotificationAsRead,
  markAllNotificationAsRead,
};
