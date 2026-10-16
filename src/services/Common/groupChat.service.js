/** @format */

const { status: httpStatus } = require("http-status");
const logger = require("../../config/logger");
const ApiError = require("../../utils/ApiError");
const { getDatabase, ServerValue } = require("firebase-admin/database");
const { User, Profile, Admin } = require("../../models");
const fs = require("fs");
const path = require("path");

const { uploadFileToFirebase } = require("../../config/firebaseStorage");
const { ROLE, ROLE_NAMES, EMPLOYEE_ROLE_IDS, APP_USER_ROLE_IDS, TEAM_CHAT_ADMIN_ROLE_IDS } = require("../../config/roles");

const getParticipantKey = (id, roleId) => {
  if (roleId === ROLE.BDM) return `bdm_${id}`;
  if (roleId === ROLE.SUPER_ADMIN || roleId === ROLE.OPERATIONS_ADMIN) return `admin_${id}`;
  if (roleId === ROLE.CLIENT) return `user_${id}`;

  if (EMPLOYEE_ROLE_IDS.includes(roleId)) {
    return `employee_${id}`;
  }

  throw new ApiError(httpStatus.BAD_REQUEST, "Unsupported participant role.");
};

const getRoleId = (user) => Number(user?.role_id);

const getAuthenticatedUser = (reqBody) => {
  const user = reqBody?.user;

  if (!user?.id || !Number.isInteger(Number(user.role_id))) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Authenticated user information is required.",
    );
  }

  return {
    ...user,
    id: Number(user.id),
    role_id: Number(user.role_id),
  };
};

const getGroupRef = (groupId) => {
  if (!groupId || typeof groupId !== "string") {
    throw new ApiError(httpStatus.BAD_REQUEST, "Valid groupId is required.");
  }

  return getDatabase().ref(`GroupChats/${groupId}`);
};

const assertTeamCreator = (user) => {
  if (!TEAM_CHAT_ADMIN_ROLE_IDS.includes(getRoleId(user))) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only admins and BDMs can manage teams.",
    );
  }
};

const assertGroupExists = async (groupRef) => {
  const snapshot = await groupRef.once("value");

  if (!snapshot.exists()) {
    throw new ApiError(httpStatus.NOT_FOUND, "Team not found.");
  }

  return snapshot.val();
};

const assertTeamManager = (group, user) => {
  assertTeamCreator(user);

  // Existing groups don't necessarily have a createdBy field.
  // Authorization for existing groups is therefore role-based here.
  if (
    group.createdBy &&
    group.createdBy !== getParticipantKey(user.id, user.role_id)
  ) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "Only the team creator can manage this team.",
    );
  }
};

const assertTeamMember = async (groupRef, user) => {
  const snapshot = await groupRef.child("members").once("value");
  const members = snapshot.val() || {};
  const participantKey = getParticipantKey(user.id, user.role_id);

  if (!members[participantKey]) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You are not a member of this team.",
    );
  }

  return participantKey;
};

const validateParticipant = async (participant) => {
  const id = Number(participant?.id);
  const roleId = Number(participant?.role_id);

  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid participant ID.");
  }

  if (TEAM_CHAT_ADMIN_ROLE_IDS.includes(roleId)) {
    const adminRecord = await Admin.findByPk(id);

    if (!adminRecord) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Admin participant ${id} was not found.`,
      );
    }

    if (adminRecord.role_id != null && Number(adminRecord.role_id) !== roleId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Role mismatch for admin participant ${id}.`,
      );
    }

    return {
      id,
      role_id: roleId,
      key: getParticipantKey(id, roleId),
      name: adminRecord.name || "Unknown",
    };
  }

  if (APP_USER_ROLE_IDS.includes(roleId)) {
    const userRecord = await User.findByPk(id, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
          required: false,
        },
      ],
    });

    if (!userRecord || Number(userRecord.role_id) !== roleId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `User ${id} was not found or has a mismatched role.`,
      );
    }

    if (userRecord.is_active === false) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `User participant ${id} is inactive.`,
      );
    }

    return {
      id,
      role_id: roleId,
      key: getParticipantKey(id, roleId),
      name: userRecord.user_profile?.name || "Unknown",
    };
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `Role ${roleId} is not allowed in a team.`,
  );
};

const uploadGroupAttachments = async (files = {}) => {
  const attachmentFields = ["images", "videos", "docs"];
  const attachments = [];

  for (const field of attachmentFields) {
    const fieldFiles = Array.isArray(files[field]) ? files[field] : [];

    for (const file of fieldFiles) {
      const mimeType = file.mimetype || "";
      const originalName = file.originalname || file.filename;

      let type;

      if (mimeType.startsWith("image/")) {
        type = "IMAGE";
      } else if (mimeType.startsWith("video/")) {
        type = "VIDEO";
      } else if (
        mimeType === "application/pdf" &&
        path.extname(originalName).toLowerCase() === ".pdf"
      ) {
        type = "PDF";
      } else {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Unsupported group attachment: ${originalName}`,
        );
      }

      const storagePath = `team-chat/${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.filename)}`;

      try {
        const url = await uploadFileToFirebase(file.path, storagePath, mimeType);

        attachments.push({
          url,
          fileName: originalName,
          mimeType,
          type,
        });
      } finally {
        await fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  return attachments;
};

const sendGroupMessage = async (reqBody, files = {}) => {
  const { groupId, message } = reqBody;
  const user = getAuthenticatedUser(reqBody);

  if (
    !groupId ||
    (!message?.trim() &&
      !Object.values(files).some(
        (items) => Array.isArray(items) && items.length > 0,
      ))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A message or at least one attachment is required.",
    );
  }

  const groupRef = getGroupRef(String(groupId));
  const groupSnapshot = await groupRef.once("value");

  if (!groupSnapshot.exists()) {
    throw new ApiError(httpStatus.NOT_FOUND, "Group not found.");
  }

  const groupData = groupSnapshot.val();
  const sender = getParticipantKey(user.id, user.role_id);

  // Enforce membership for newly created Teams.
  // Preserve the previous behavior for legacy groups.
  if (groupData.isTeam === true) {
    await assertTeamMember(groupRef, user);
  }

  let attachments = [];

  try {
    attachments = await uploadGroupAttachments(files);

    const messageData = {
      sender,
      sender_name: user.user_profile?.name || user.name || "Unknown",
      message: message?.trim() || "",
      timestamp: ServerValue.TIMESTAMP,
    };

    if (attachments.length) {
      messageData.attachments = attachments;

      // Compatibility for clients that already display imageUrls.
      const imageUrls = attachments
        .filter((attachment) => attachment.type === "IMAGE")
        .map((attachment) => attachment.url);

      if (imageUrls.length) {
        messageData.imageUrls = imageUrls;
      }
    }

    const messageRef = groupRef.child("messages").push();
    await messageRef.set(messageData);

    return {
      success: true,
      messageId: messageRef.key,
      ...messageData,
      attachments,
    };
  } catch (error) {
    logger.error("sendGroupMessage error:", error);
    throw error;
  }
};

const getMyGroups = async (reqBody) => {
  try {
    const user = getAuthenticatedUser(reqBody);
    const userKey = getParticipantKey(user.id, user.role_id);

    const groupChatsRef = getDatabase().ref("GroupChats");
    const snapshot = await groupChatsRef.once("value");
    const allGroups = snapshot.val() || {};

    const myGroups = [];

    for (const [groupId, groupData] of Object.entries(allGroups)) {
      // Include only groups where the authenticated user is a member.
      if (groupData.members && groupData.members[userKey]) {
        const messages = groupData.messages || {};
        const messageEntries = Object.entries(messages);

        const sortedMessages = messageEntries
          .map(([id, data]) => ({ id, ...data }))
          .sort(
            (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
          );

        const lastMessage =
          sortedMessages.length > 0
            ? sortedMessages[sortedMessages.length - 1]
            : null;

        // Get the last sender's name.
        let senderName = "Unknown";

        if (lastMessage?.sender) {
          const [type, senderId] = lastMessage.sender.split("_");
          const id = parseInt(senderId, 10);

          if (["employee", "user"].includes(type)) {
            const u = await User.findOne({
              where: { id },
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            });

            senderName = u?.user_profile?.name || "Unknown";
          } else if (["admin", "bdm"].includes(type)) {
            const a = await Admin.findOne({
              where: { id },
              attributes: ["name"],
            });

            senderName = a?.name || "Unknown";
          } else if (lastMessage.sender === "system") {
            senderName = "System";
          }
        }

        // Calculate unread messages.
        const lastSeen = groupData?.last_seen?.[userKey] || 0;

        const unreadCount = sortedMessages.filter(
          (msg) =>
            msg.timestamp &&
            msg.timestamp > lastSeen &&
            msg.sender !== userKey
        ).length;

        myGroups.push({
          groupId,
          name: groupData.name,
          isTeam: groupData.isTeam === true,
          created_at: groupData.created_at,
          last_message: lastMessage?.message || null,
          last_message_time: lastMessage?.timestamp || null,
          last_message_by: senderName,
          unread_count: unreadCount,
        });
      }
    }

    // Sort by latest message first.
    myGroups.sort(
      (a, b) =>
        (b.last_message_time || 0) - (a.last_message_time || 0)
    );

    return { groups: myGroups };
  } catch (error) {
    logger.error("getMyGroups error:", error);
    throw error;
  }
};

const getGroupMessages = async (groupId, reqBody) => {
  const user = getAuthenticatedUser(reqBody);
  const groupRef = getGroupRef(String(groupId));
  const group = await assertGroupExists(groupRef);

  // Check membership for Teams only.
  // Preserve existing legacy group behavior.
  if (group.isTeam === true) {
    await assertTeamMember(groupRef, user);
  }

  try {
    const messagesRef = groupRef.child("messages");
    const snapshot = await messagesRef
      .orderByChild("timestamp")
      .once("value");

    const messages = snapshot.val() || {};

    const messageList = Object.entries(messages).map(
      ([id, data]) => ({
        id,
        ...data,
      })
    );

    // Collect unique sender keys.
    const uniqueSenders = [
      ...new Set(
        messageList
          .map((msg) => msg.sender)
          .filter(Boolean)
      ),
    ];

    const senderNameMap = {};

    await Promise.all(
      uniqueSenders.map(async (key) => {
        if (key === "system") {
          senderNameMap[key] = "System";
          return;
        }

        const [type, idStr] = key.split("_");
        const id = parseInt(idStr, 10);

        if (!Number.isInteger(id)) {
          senderNameMap[key] = "Unknown";
          return;
        }

        if (["employee", "user"].includes(type)) {
          const userRecord = await User.findOne({
            where: { id },
            include: [
              {
                model: Profile,
                as: "user_profile",
                attributes: ["name"],
              },
            ],
          });

          senderNameMap[key] =
            userRecord?.user_profile?.name || "Unknown User";
        } else if (["admin", "bdm"].includes(type)) {
          const adminRecord = await Admin.findOne({
            where: { id },
            attributes: ["name"],
          });

          senderNameMap[key] =
            adminRecord?.name || "Unknown Admin";
        } else {
          senderNameMap[key] = "Unknown";
        }
      })
    );

    const enrichedMessages = messageList.map((msg) => ({
      ...msg,
      sender_name: senderNameMap[msg.sender] || "Unknown",
    }));

    return { messages: enrichedMessages };
  } catch (error) {
    logger.error("getGroupMessages error:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to fetch group messages."
    );
  }
};

const updateGroupName = async (reqBody) => {
  const { groupId, newName } = reqBody;
  const user = getAuthenticatedUser(reqBody);

  if (
    !newName?.trim() ||
    newName.trim().length > 100
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A valid group name of up to 100 characters is required."
    );
  }

  const groupRef = getGroupRef(String(groupId));
  const group = await assertGroupExists(groupRef);

  // Restrict Team renaming to the authorized Team manager.
  // Preserve the existing behavior for legacy groups.
  if (group.isTeam === true) {
    assertTeamManager(group, user);
  }

  await groupRef.update({
    name: newName.trim(),
  });

  return {
    success: true,
    groupId,
    name: newName.trim(),
  };
};

const deleteTeam = async (reqBody) => {
  const user = getAuthenticatedUser(reqBody);
  const { groupId } = reqBody;

  const groupRef = getGroupRef(groupId);
  const group = await assertGroupExists(groupRef);

  if (group.isTeam !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This operation is only available for Teams.",
    );
  }

  assertTeamManager(group, user);
  await groupRef.remove();

  return {
    success: true,
    message: "Team deleted successfully.",
  };
};

const getGroupParticipants = async (groupId) => {
  try {
    const groupRef = getGroupRef(String(groupId));
    const group = await assertGroupExists(groupRef);

    // Require membership verification for Teams only.
    // Preserve existing participant lookup behavior for legacy groups.

    const members = group.members || {};
    const participants = [];

    for (const key of Object.keys(members)) {
      const [type, id] = key.split("_");
      const userId = parseInt(id, 10);

      let name = "Unknown";
      let role = "Unknown";

      if (["employee", "user"].includes(type)) {
        const userRecord = await User.findOne({
          where: { id: userId },
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        });

        name = userRecord?.user_profile?.name || "Unknown";
        role = type === "user" ? "Client" : "Employee";
      } else if (type === "bdm") {
        const bdm = await Admin.findOne({
          where: { id: userId },
          attributes: ["name"],
        });

        name = bdm?.name || "Unknown";
        role = "BDM";
      } else if (type === "admin") {
        const adminUser = await Admin.findOne({
          where: { id: userId },
          attributes: ["name"],
        });

        name = adminUser?.name || "Unknown";
        role = "Admin";
      }

      participants.push({
        id: userId,
        key,
        name,
        role,
      });
    }

    return participants;
  } catch (error) {
    logger.error("Error fetching participants:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to fetch participants."
    );
  }
};

const deleteGroup = async (groupId, reqBody) => {
  try {
    const groupRef = getGroupRef(String(groupId));
    const snapshot = await groupRef.once("value");

    if (!snapshot.exists()) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Group not found."
      );
    }

    const group = snapshot.val();

    // Teams must be deleted through the dedicated deleteTeam API.
    if (group.isTeam === true) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "Teams cannot be deleted through the legacy group-delete API. Use the deleteTeam API."
      );
    }

    // Preserve existing legacy group deletion behavior.
    await groupRef.remove();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to delete group."
    );
  }
};

// team apis

const createTeam = async (reqBody) => {
  const user = getAuthenticatedUser(reqBody);
  assertTeamCreator(user);

  const name = reqBody.name?.trim();
  const participantIds = reqBody.participantIds || [];

  if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Team name is required.");
  }

  if (name.length > 100) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Team name cannot exceed 100 characters.",
    );
  }

  if (!Array.isArray(participantIds)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "participantIds must be an array.",
    );
  }

  const creator = await validateParticipant(user);
  const participants = new Map([[creator.key, creator]]);

  for (const participant of participantIds) {
    const validated = await validateParticipant(participant);
    participants.set(validated.key, validated);
  }

  const groupRef = getDatabase().ref("GroupChats").push();
  const timestamp = ServerValue.TIMESTAMP;

  const members = {};

  for (const participant of participants.values()) {
    members[participant.key] = {
      id: participant.id,
      role_id: participant.role_id,
      name: participant.name,
      joined_at: timestamp,
    };
  }

  await groupRef.set({
    name,
    isTeam: true,
    createdBy: creator.key,
    created_at: timestamp,
    members,
    messages: {},
    last_seen: {},
  });

  return {
    success: true,
    groupId: groupRef.key,
    name,
    participants: Array.from(participants.values()).map(
      ({ id, role_id, key, name }) => ({ id, role_id, key, name }),
    ),
  };
};

const getMyTeams = async (reqBody) => {
  try {
    const user = getAuthenticatedUser(reqBody);
    const userKey = getParticipantKey(user.id, user.role_id);

    const groupChatsRef = getDatabase().ref("GroupChats");
    const snapshot = await groupChatsRef.once("value");
    const allGroups = snapshot.val() || {};

    const myTeams = [];

    for (const [groupId, groupData] of Object.entries(allGroups)) {
      // Include only Teams where the authenticated user is a member.
      if (
        groupData.isTeam !== true ||
        !groupData.members ||
        !groupData.members[userKey]
      ) {
        continue;
      }

      const messages = groupData.messages || {};
      const messageEntries = Object.entries(messages);

      const sortedMessages = messageEntries
        .map(([id, data]) => ({ id, ...data }))
        .sort(
          (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
        );

      const lastMessage =
        sortedMessages.length > 0
          ? sortedMessages[sortedMessages.length - 1]
          : null;

      // Get the last sender's name.
      let senderName = "Unknown";

      if (lastMessage?.sender) {
        const [type, senderId] = lastMessage.sender.split("_");
        const id = parseInt(senderId, 10);

        if (["employee", "user"].includes(type)) {
          const userRecord = await User.findOne({
            where: { id },
            include: [
              {
                model: Profile,
                as: "user_profile",
                attributes: ["name"],
              },
            ],
          });

          senderName =
            userRecord?.user_profile?.name || "Unknown";
        } else if (["admin", "bdm"].includes(type)) {
          const adminRecord = await Admin.findOne({
            where: { id },
            attributes: ["name"],
          });

          senderName = adminRecord?.name || "Unknown";
        } else if (lastMessage.sender === "system") {
          senderName = "System";
        }
      }

      // Calculate unread messages.
      const lastSeen = groupData?.last_seen?.[userKey] || 0;

      const unreadCount = sortedMessages.filter(
        (msg) =>
          msg.timestamp &&
          msg.timestamp > lastSeen &&
          msg.sender !== userKey,
      ).length;

      myTeams.push({
        groupId,
        name: groupData.name,
        isTeam: true,
        created_at: groupData.created_at,
        last_message: lastMessage?.message || null,
        last_message_time: lastMessage?.timestamp || null,
        last_message_by: senderName,
        unread_count: unreadCount,
      });
    }

    // Sort by latest message first.
    myTeams.sort(
      (a, b) =>
        (b.last_message_time || 0) - (a.last_message_time || 0),
    );

    return { teams: myTeams };
  } catch (error) {
    logger.error("getMyTeams error:", error);
    throw error;
  }
};

const addTeamMembers = async (reqBody) => {
  const user = getAuthenticatedUser(reqBody);
  const { groupId, participantIds } = reqBody;

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "At least one participant is required.",
    );
  }

  const groupRef = getGroupRef(groupId);
  const group = await assertGroupExists(groupRef);

  if (group.isTeam !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This operation is only available for Teams.",
    );
  }

  assertTeamManager(group, user);

  const updates = {};
  const added = [];

  for (const participant of participantIds) {
    const validated = await validateParticipant(participant);
    const memberPath = `members/${validated.key}`;

    const existing = await groupRef.child(memberPath).once("value");

    if (!existing.exists()) {
      updates[memberPath] = {
        id: validated.id,
        role_id: validated.role_id,
        name: validated.name,
        joined_at: Date.now(),
      };

      added.push({
        id: validated.id,
        role_id: validated.role_id,
        key: validated.key,
        name: validated.name,
      });
    }
  }

  if (Object.keys(updates).length) {
    await groupRef.update(updates);
  }

  return {
    success: true,
    added,
    message: "Team members updated successfully.",
  };
};

const removeTeamMember = async (reqBody) => {
  const user = getAuthenticatedUser(reqBody);
  const { groupId, participantId, role_id } = reqBody;

  const groupRef = getGroupRef(groupId);
  const group = await assertGroupExists(groupRef);

  if (group.isTeam !== true) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This operation is only available for Teams.",
    );
  }

  assertTeamManager(group, user);

  const participant = await validateParticipant({
    id: participantId,
    role_id,
  });
  const memberRef = groupRef.child(`members/${participant.key}`);
  const memberSnapshot = await memberRef.once("value");

  if (!memberSnapshot.exists()) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Participant is not a member of this Team.",
    );
  }

  if (group.createdBy === participant.key) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "The Team creator cannot be removed. Transfer ownership or delete the Team.",
    );
  }

  await memberRef.remove();

  return {
    success: true,
    message: "Team member removed successfully.",
  };
};


const getAvailableTeamParticipants = async () => {
  try {
    // Admin-table participants: Super Admin, Operations Admin, BDM
    const adminRecords = await Admin.findAll({
      where: {
        role_id: TEAM_CHAT_ADMIN_ROLE_IDS,
      },
      attributes: ["id", "role_id", "name"],
      order: [["name", "ASC"]],
    });

    // User-table participants: Clients and employees
    const userRecords = await User.findAll({
      where: {
        role_id: APP_USER_ROLE_IDS,
      },
      attributes: ["id", "role_id"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
          required: false,
        },
      ],
      order: [["id", "ASC"]],
    });

    const admins = adminRecords.map((record) => {
      const id = Number(record.id);
      const role_id = Number(record.role_id);

      return {
        id,
        role_id,
        key: role_id === ROLE.BDM ? `bdm_${id}` : `admin_${id}`,
        name: record.name || "Unknown",
        role: ROLE_NAMES[role_id] || "Admin",
        participantType: "admin",
      };
    });

    const users = userRecords.map((record) => {
      const id = Number(record.id);
      const role_id = Number(record.role_id);

      return {
        id,
        role_id,
        key:
          role_id === ROLE.CLIENT
            ? `user_${id}`
            : `employee_${id}`,
        name: record.user_profile?.name || "Unknown",
        role: ROLE_NAMES[role_id] || "User",
        participantType: role_id === ROLE.CLIENT ? "client" : "employee",
      };
    });

    const participants = [...admins, ...users].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      participants,
      total: participants.length,
    };
  } catch (error) {
    logger.error("getAvailableTeamParticipants error:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to fetch Team participants."
    );
  }
};


module.exports = {
  sendGroupMessage,
  getMyGroups,
  getGroupMessages,
  updateGroupName,
  getGroupParticipants,
  deleteGroup,

  // New Team APIs
  createTeam,
  getMyTeams,
  addTeamMembers,
  removeTeamMember,
  deleteTeam,
  getAvailableTeamParticipants
};
