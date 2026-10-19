/** @format */

const { status: httpStatus } = require("http-status");
const logger = require("../../config/logger");
const ApiError = require("../../utils/ApiError");
const { ROLE, EMPLOYEE_ROLE_IDS } = require("../../config/roles");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { sendPushNotification, getUserActiveFCMTokens } = require("./notification.service");
const { User, Admin, Profile, UserAttachment, BDMUser } = require("../../models");
const { uploadFileToFirebase } = require("../../config/firebaseStorage");

const sendMessage = async (body, files, headers) => {
	try {
		const { user, message, receiverUserId, user_type } = body;

		let receiverType = "USER";
		if (user_type === "USER") {
			receiverType = "ADMIN";
		} else {
			receiverType = "USER";
		}

		let chatType;
		if (user_type === "USER") {
			chatType = user.role_id === ROLE.CLIENT ? "USER_ADMIN_CHAT" : "EMPLOYEE_ADMIN_CHAT";
		} else {
			const receiverDetails = await User.findOne({
				where: { id: receiverUserId, is_active: true },
			});
			if (!receiverDetails) {
				throw new ApiError(httpStatus.NOT_FOUND, "Receiver not found");
			}
			chatType =
				receiverDetails.role_id === ROLE.CLIENT
					? "USER_ADMIN_CHAT"
					: "EMPLOYEE_ADMIN_CHAT";
		}

		const timestamp = ServerValue.TIMESTAMP;

		// Create references for sender and receiver messages
		const senderMessageRef = getDatabase()
			.ref(
				`${chatType}/messages/${user_type}_${user.id}/${receiverType}_${receiverUserId}`
			);
		const receiverMessageRef = getDatabase()
			.ref(
				`${chatType}/messages/${receiverType}_${receiverUserId}/${user_type}_${user.id}`
			);

		let imageUrls = await uploadImages(files);

		senderMessageRef.push({
			message,
			timestamp,
			source: "SENDER",
			read: true,
			imageUrls: imageUrls.length > 0 ? imageUrls : null,
		});

		// Save message for receiver
		receiverMessageRef.push({
			message,
			timestamp,
			source: "RECEIVER",
			read: false,
			imageUrls: imageUrls.length > 0 ? imageUrls : null,
		});

		// Push to the app user an admin wrote to. Messages from app users go to the admin panel,
		// which has no push tokens (receiverUserId is then an admin id, not a users row). The
		// message is already saved, so a failed push is logged, not reported as a failed send.
		if (user_type === "ADMIN") {
			try {
				await sendNotification({
					message,
					receiverUserId,
					senderUserId: user.id,
					senderType: user_type,
				});
			} catch (error) {
				logger.error("Chat push notification not sent:", error.message);
			}
		}
	} catch (error) {
		logger.error("sendMessage failed:", error);
		throw error;
	}
};

async function uploadImages(files) {
	const imageUrls = [];

	const imageArray = Array.isArray(files?.images) ? files.images : [];

	for (const file of imageArray) {
		try {
			const downloadURL = await uploadFileToFirebase(
				file.path,
				`files/images/${file.filename}`,
				file.mimetype
			);
			imageUrls.push(downloadURL);
		} catch (error) {
			logger.error("Error uploading image:", error);
		}
	}

	return imageUrls;
}

const getUserMessages = async (body) => {
	try {
		const { user, userId } = body;
		const receiverUser = await User.findOne({ where: { id: userId } });
		if (!receiverUser) {
			throw new ApiError(httpStatus.NOT_FOUND, "User not found");
		}
		const chatType =
			receiverUser.role_id === ROLE.CLIENT ? "USER_ADMIN_CHAT" : "EMPLOYEE_ADMIN_CHAT";

		const fixedPageSize = 10; // Set your desired page size
		const fixedPage = 1; // Set your desired page number

		const startIndex = (fixedPage - 1) * fixedPageSize;

		await markMessagesAsRead(user.id, userId, chatType);
		const userMessagesSnapshot = await getDatabase()
			.ref(`${chatType}/messages/ADMIN_${user.id}/USER_${userId}`)
			.orderByChild("timestamp") // Sort by timestamp
			.limitToLast(fixedPageSize + startIndex)
			.once("value");

		let userMessages = [];
		userMessagesSnapshot.forEach((childSnapshot) => {
			userMessages.unshift(childSnapshot.val());
		});

		userMessages = userMessages.slice(startIndex, startIndex + fixedPageSize);

		return userMessages;
	} catch (error) {
		logger.error("getUserMessages failed:", error);
		throw error;
	}
};

const markUserMessagesAsRead = async (body) => {
	try {
		const { user, receiverUserId } = body;

		// Check if receiverUserId is provided
		if (!receiverUserId) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Required Receiver Id.");
		}


		// Find the receiver user document
		let receiverDoc = await User.findOne({
			where: { id: receiverUserId },
		});


		// Check if receiverDoc exists
		if (!receiverDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Receiver Id.");
		}

		// Determine chat type based on receiver's role
		const chatType =
			receiverDoc.role_id === ROLE.CLIENT ? "USER_ADMIN_CHAT" : "EMPLOYEE_ADMIN_CHAT";

		// Update the messages to mark them as read
		await markAsRead(user.id, receiverUserId, chatType);

		return true;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const markAsRead = async (userId, receiverUserId, chatType) => {
	try {
		const userMessagesRef = getDatabase()
			.ref(`${chatType}/messages/ADMIN_${userId}/USER_${receiverUserId}`);

		// Fetch the messages
		const userMessagesSnapshot = await userMessagesRef.once("value");

		// Update each message to mark it as read
		userMessagesSnapshot.forEach((childSnapshot) => {
			const messageKey = childSnapshot.key;

			// Update the message's read property to true
			userMessagesRef.child(messageKey).update({ read: true });
		});
	} catch (error) {
		logger.error("Error marking messages as read:", error);
		throw error;
	}
};

const getChatList = async (body) => {
	try {
		const { user } = body;

		let chatType, userType;
		if (user.role_id === ROLE.CLIENT) {
			chatType = "USER_ADMIN_CHAT";
			userType = "USER";
		} else if (EMPLOYEE_ROLE_IDS.includes(user.role_id)) {
			chatType = "EMPLOYEE_ADMIN_CHAT";
			userType = "USER";
		} else {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Invalid role_id for chat access"
			);
		}

		// Correct Firebase ref for the user
		const chatRoomRef = getDatabase()
			.ref(`${chatType}/messages/${userType}_${user.id}`);


		const snapshot = await chatRoomRef.once("value");

		let list = [];

		snapshot.forEach((adminSnapshot) => {
			const adminId = adminSnapshot.key.split("_")[1]; // ADMIN_<id>
			const userMessages = adminSnapshot.val();
			const lastMessage = Object.values(userMessages).pop();
			const unseenCount = Object.values(userMessages).filter(
				(msg) => !msg.read
			).length;

			let displayMessage = "";
			if (lastMessage.imageUrls && lastMessage.imageUrls.length > 0) {
				displayMessage = `${lastMessage.imageUrls.length} attachment(s)`;
			} else {
				displayMessage = lastMessage.message;
			}

			list.push({
				lastMessageTime: lastMessage.timestamp,
				unseenCount,
				displayMessage,
				adminId,
			});
		});


		list.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

		const adminDocsPromises = list.map(async (chat) => {
			const adminDoc = await Admin.findOne({
				where: { id: chat.adminId },
				attributes: ["id", "name"],
			});

			if (adminDoc) {
				return {
					id: adminDoc.id,
					name: adminDoc.name,
					// profile_image: adminDoc.profile_image,
					lastMessageTime: chat.lastMessageTime,
					unseenCount: chat.unseenCount,
					displayMessage: chat.displayMessage,
				};
			}
			return null;
		});

		const result = await Promise.all(adminDocsPromises);
		return result.filter(Boolean);
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const getAdminMessages = async (body) => {
	try {
		const { user, receiverUserId } = body;

		if (!receiverUserId) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Required Receiver Id.");
		}

		// Determine the chat type based on the user's role_id
		const chatType =
			user.role_id === ROLE.CLIENT ? "USER_ADMIN_CHAT" : "EMPLOYEE_ADMIN_CHAT";

		const adminMessagesSnapshot = await getDatabase()
			.ref(`${chatType}/messages/ADMIN_${receiverUserId}/USER_${user.id}`)
			.orderByChild("timestamp")
			.once("value");

		let adminMessages = [];
		adminMessagesSnapshot.forEach((childSnapshot) => {
			adminMessages.unshift(childSnapshot.val());
		});

		return adminMessages;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const getUserChatList = async (body) => {
	try {
		const { user, chat_type } = body;

		let chatType;

		if (chat_type === "user") {
			chatType = "USER_ADMIN_CHAT";
		} else if (chat_type === "employee") {
			chatType = "EMPLOYEE_ADMIN_CHAT";
		} else {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid User Type");
		}

		// Step 1: Get all users assigned to this BDM
		const assignedUsers = await BDMUser.findAll({
			where: {
				bdm_id: user.id,
			},
			attributes: ["user_id"],
		});

		// No users assigned to this BDM
		if (!assignedUsers || assignedUsers.length === 0) {
			return [];
		}

		const userIds = assignedUsers.map((u) => u.user_id);

		// Step 2: Fetch chat snapshot from Firebase
		const chatRoomRef = getDatabase()
			.ref(`${chatType}/messages/ADMIN_${user.id}`);

		const snapshot = await chatRoomRef.once("value");

		// Step 3: Parse Firebase chat data
		const chatMap = {};

		snapshot.forEach((userSnapshot) => {
			const userId = userSnapshot.key.split("_")[1];
			const userMessages = userSnapshot.val();

			if (!userMessages) return;

			const messages = Object.values(userMessages);

			if (!messages.length) return;

			const lastMessage = messages[messages.length - 1];

			const unseenCount = messages.filter(
				(msg) => !msg.read
			).length;

			let displayMessage = "";

			if (lastMessage?.imageUrls?.length > 0) {
				displayMessage = `${lastMessage.imageUrls.length} attachment(s)`;
			} else {
				displayMessage = lastMessage?.message || "";
			}

			chatMap[userId] = {
				lastMessageTime: lastMessage?.timestamp || null,
				unseenCount,
				displayMessage,
			};
		});

		// Step 4: Load user profiles
		const userDocs = await User.findAll({
			where: {
				is_active: true,
				id: userIds,
			},
			attributes: ["id", "role_id"],
			include: [
				{
					model: Profile,
					as: "user_profile",
					attributes: ["id", "name"],
				},
				{
					model: UserAttachment,
					as: "user_attachments",
					attributes: ["id", "file_name", "file_uri"],
					order: [["id", "desc"]],
					limit: 1,
				},
			],
		});

		// In case assigned users exist but none are active
		if (!userDocs || userDocs.length === 0) {
			return [];
		}

		// Step 5: Attach chat information
		const result = userDocs.map((userDoc) => {
			const chat = chatMap[userDoc.id] || {};

			userDoc.dataValues.lastMessageTime =
				chat.lastMessageTime || null;

			userDoc.dataValues.unseenCount =
				chat.unseenCount || 0;

			userDoc.dataValues.displayMessage =
				chat.displayMessage || "No messages yet";

			return userDoc;
		});

		// Step 6: Sort newest chat first
		result.sort((a, b) => {
			const timeA = a.dataValues.lastMessageTime || 0;
			const timeB = b.dataValues.lastMessageTime || 0;

			return timeB - timeA;
		});

		return result;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};



// 	try {

// 		snapshot.forEach((userSnapshot) => {

// 		});

// 		const userDocsPromises = list.map(async (chat) => {
// 			try {

// 			} catch (error) {
// 		});

// 	} catch (error) {

const getLastMessage = async (body, params) => {
	try {
		const { receiverUserId } = params;
		const { user } = body;

		if (!receiverUserId) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Receiver user id is required."
			);
		}

		let chatType;
		if (user.role_id === ROLE.CLIENT) {
			chatType = "USER_ADMIN_CHAT";
		} else if (user.role_id === ROLE.SUPERVISOR) {
			chatType = "EMPLOYEE_ADMIN_CHAT";
		} else {
			throw new ApiError(httpStatus.UNAUTHORIZED, "Unauthorized access.");
		}
		const adminMessagesSnapshot = await getDatabase()
			.ref(`${chatType}/messages/USER_${user.id}/ADMIN_${receiverUserId}/`)
			.orderByChild("timestamp")
			.limitToLast(1) // Limit to last message
			.once("value");

		let adminMessages = [];
		adminMessagesSnapshot.forEach((childSnapshot) => {
			adminMessages.unshift(childSnapshot.val());
		});

		return adminMessages;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const markAdminMessagesAsRead = async (body, param) => {
	try {
		const { user } = body;
		const { receiverUserId } = param;

		if (!receiverUserId) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Required Receiver Id.");
		}

		// Find the receiver user document
		const receiverDoc = await User.findOne({ where: { id: receiverUserId } });

		if (!receiverDoc) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid Receiver Id.");
		}

		// Determine chat type based on receiver's role
		const chatType =
			receiverDoc.role_id === ROLE.CLIENT ? "USER_ADMIN_CHAT" : "EMPLOYEE_ADMIN_CHAT";

		// Update the messages to mark them as read
		await markMessagesAsRead(user.id, receiverUserId, chatType);

		return true;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Internal Server Error"
		);
	}
};

const markMessagesAsRead = async (userId, receiverUserId, chatType) => {
	try {
		const userMessagesRef = getDatabase()
			.ref(`${chatType}/messages/USER_${userId}/ADMIN_${receiverUserId}`);

		// Fetch the messages
		const userMessagesSnapshot = await userMessagesRef.once("value");

		let lastMessageKey = null;
		// Find the key of the last message
		userMessagesSnapshot.forEach((childSnapshot) => {
			lastMessageKey = childSnapshot.key;
		});

		// Update the last message to mark it as read
		if (lastMessageKey) {
			userMessagesRef.child(lastMessageKey).update({ read: true });
		}
	} catch (error) {
		logger.error("Error marking messages as read:", error);
		throw error;
	}
};

const sendNotification = async (body) => {
    try {
        const { message, receiverUserId, senderUserId, senderType } = body;
        const receiverUser = await User.findByPk(receiverUserId);
        if (!receiverUser) {
            throw new ApiError(httpStatus.NOT_FOUND, "Receiver not found");
        }

        // Determine notification title based on sender type
        let notificationTitle = 'You have received a message';
        if (senderType === 'ADMIN') {
            notificationTitle = 'You have received a message from Admin';
        } else if (senderType === 'USER') {
            const sender = await User.findByPk(senderUserId);
            notificationTitle = `You have received a message from ${sender.name || 'User'}`;
        }

        // Fetch receiver's FCM tokens
        const fcmTokens = await getUserActiveFCMTokens(receiverUser);
        if (!fcmTokens.length) {
            throw new ApiError(httpStatus.BAD_REQUEST, "No active FCM tokens found for this user");
        }

        // Craft the notification payload
        const notificationObj = {
            title: notificationTitle,
            body: message,
        };

        // Send notifications to the receiver
        await sendPushNotification(notificationObj, fcmTokens);
    } catch (error) {
        logger.error("Error sending notification:", error);
        throw error;
    }
};




module.exports = {
	sendMessage,
	sendNotification,
	getUserMessages,
	markAdminMessagesAsRead,
	getChatList,
	getAdminMessages,
	getUserChatList,
	getLastMessage,
	markUserMessagesAsRead,
};
