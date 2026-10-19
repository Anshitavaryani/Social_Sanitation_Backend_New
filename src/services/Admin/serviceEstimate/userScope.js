// Service estimate service: a client's own copy of the scope, its sections, items and order

const { status: httpStatus } = require("http-status");
const { editableFields } = require("../../../utils/editableFields");
const logger = require("../../../config/logger");
const { Op } = require("sequelize");
const {
  User,
  ScopeSection,
  ScopeItem,
  ClientChecklist,
  UserScopeItem,
  UserScopeSection,
  ClientChecklistDetail,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");

// Which chart areas (Initial Client Chart service_area) put a master section in a client's scope:
// keys are master section titles. Commercial clients also have rooms that map to a section of
// their own name; any other commercial area becomes a section of its own (see addAreaSections).
const SECTION_AREAS = {
  commercial: {
    "GENERAL OFFICE AND COMMON AREAS": ["Office Areas", "Group / Common Rooms", "Classrooms / Conference Rooms"],
    "BATHROOMS AND RESTROOM AREAS": ["Restrooms"],
    "KITCHEN AND BREAK AREAS": ["Kitchen Areas"],
    "HALLWAYS / LOBBY AREAS": ["Entrance / Lobby Areas"],
    "HALLWAYS / ALL AREAS": ["All Areas / Hallways"],
  },
  residential: {
    "Entrance / Lobby Areas": ["Entrance / Lobby Areas"],
    Bathrooms: ["Bathrooms"],
    Kitchen: ["Kitchen"],
    Bedrooms: ["Bedrooms"],
    "Dining Room": ["Dining Room"],
    "Living Room": ["Living Room"],
    Foyer: ["Foyer"],
  },
};

const DIRECT_ROOM_SECTIONS = {
  commercial: {
    "Cubicle Areas": "CUBICLE AREAS",
    "Ballroom Area": "BALLROOM AREA",
    Conservatory: "CONSERVATORY",
    Salon: "SALON",
    "Pharmacy Room": "PHARMACY ROOM",
    "Mail Room": "MAIL ROOM",
  },
  residential: {},
};

// Titles and area labels compared without case or extra spaces
const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// A chart row with something to clean. Residential uses num_desks_trash_cans as its single count
// field; commercial keeps its existing count fields.
const hasValues = (detail) =>
  Number(detail.restrooms || 0) > 0 || Number(detail.stalls || 0) > 0 || Number(detail.sinks || 0) > 0 || Number(detail.num_desks_trash_cans || 0) > 0;

// The client's type and the rows of their latest Initial Client Chart; 404 without the client, 400
// for another client type or a chart that is missing or empty
const scopeChart = async (user_id) => {
  const user = await User.findByPk(user_id);

  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
  }

  const clientType = String(user.client_type || "commercial").toLowerCase();

  if (!["commercial", "residential"].includes(clientType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid client type");
  }

  const checklist = await ClientChecklist.findOne({
    where: { user_id },
    order: [["created_at", "DESC"]],
  });

  if (!checklist) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please complete the Initial Client Chart before generating the Scope of Work.");
  }

  const details = await ClientChecklistDetail.findAll({
    where: { checklist_id: checklist.id },
  });

  if (!details.some(hasValues)) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Please fill in the Initial Client Chart before generating the Scope of Work.");
  }

  return { clientType, details };
};

// The master sections a chart row with something to clean points to: through the section's areas,
// or a commercial room of the section's name
const matchesChart = (section, details, sectionAreaMapping, directRoomSections) =>
  details.some((detail) => {
    if (!hasValues(detail)) {
      return false;
    }

    const mappedAreas = sectionAreaMapping[section.title] || [];

    if (mappedAreas.some((area) => normalize(area) === normalize(detail.service_area))) {
      return true;
    }

    const directMatch = Object.entries(directRoomSections).find(([area]) => normalize(area) === normalize(detail.service_area));

    return Boolean(directMatch) && normalize(directMatch[1]) === normalize(section.title);
  });

// A client's copy of a master section: the one linked to it, or an old unlinked one of the same
// title (now linked), or a new one; then any of the master's items the copy lacks
const syncMasterSection = async (user_id, section, existingSections) => {
  let existingSection = existingSections.find((item) => Number(item.master_section_id) === Number(section.id));

  if (!existingSection) {
    existingSection = existingSections.find((item) => !item.master_section_id && normalize(item.title) === normalize(section.title));
  }

  if (existingSection) {
    if (!existingSection.master_section_id) {
      await existingSection.update({
        master_section_id: section.id,
        title: section.title,
        order: section.order,
        is_red: section.is_red,
      });
    }
  } else {
    existingSection = await UserScopeSection.create({
      user_id,
      master_section_id: section.id,
      title: section.title,
      order: section.order,
      is_red: section.is_red,
      is_active: true,
    });

    existingSections.push(existingSection);
  }

  const existingItems = await UserScopeItem.findAll({
    where: {
      user_scope_section_id: existingSection.id,
      is_active: true,
    },
  });

  for (const item of section.items || []) {
    if (!existingItems.find((existingItem) => Number(existingItem.master_item_id) === Number(item.id))) {
      await createScopeItemFrom(existingSection.id, item);
    }
  }
};

const createScopeItemFrom = (userScopeSectionId, item) =>
  UserScopeItem.create({
    user_scope_section_id: userScopeSectionId,
    master_item_id: item.id,
    description: item.description,
    is_daily: item.is_daily,
    is_weekly: item.is_weekly,
    is_monthly: item.is_monthly,
    order: item.order,
    is_active: true,
  });

// A section of its own, at the end, for each chart area no master section covers (once per title);
// commercial ones start with the General Office items
const addAreaSections = async (user_id, details, sectionAreaMapping, directRoomSections, generalOfficeSection) => {
  for (const detail of details) {
    if (!hasValues(detail) || !detail.service_area) {
      continue;
    }

    const isMapped =
      Object.values(sectionAreaMapping)
        .flat()
        .some((area) => normalize(area) === normalize(detail.service_area)) ||
      Object.keys(directRoomSections).some((area) => normalize(area) === normalize(detail.service_area));

    if (isMapped) {
      continue;
    }

    const dynamicTitle = detail.service_area.trim().toUpperCase();

    const existingDynamicSection = await UserScopeSection.findOne({
      where: {
        user_id,
        title: dynamicTitle,
        is_active: true,
      },
    });

    if (existingDynamicSection) {
      continue;
    }

    const lastSection = await UserScopeSection.findOne({
      where: { user_id },
      order: [
        ["order", "DESC"],
        ["id", "DESC"],
      ],
    });

    const newSection = await UserScopeSection.create({
      user_id,
      title: dynamicTitle,
      order: lastSection ? Number(lastSection.order || 0) + 1 : 1,
      is_red: false,
      is_active: true,
    });

    for (const item of generalOfficeSection?.items || []) {
      await createScopeItemFrom(newSection.id, item);
    }
  }
};

// Deactivates the client's copies (and their items) of master sections the chart no longer
// matches; their own sections stay
const deactivateUnmatchedSections = async (user_id, allowedSections) => {
  const existingSections = await UserScopeSection.findAll({
    where: {
      user_id,
      is_active: true,
    },
  });

  const allowedSectionIds = allowedSections.map((section) => Number(section.id));

  for (const existingSection of existingSections) {
    if (existingSection.master_section_id && !allowedSectionIds.includes(Number(existingSection.master_section_id))) {
      await UserScopeSection.update({ is_active: false }, { where: { id: existingSection.id } });
      await UserScopeItem.update({ is_active: false }, { where: { user_scope_section_id: existingSection.id } });
    }
  }
};

// GET /admin/auth/user-scope/:userId: brings a client's scope in line with their latest Initial
// Client Chart (master sections the chart matches, a section per other area, unmatched copies
// deactivated) and returns it in order
const getUserScope = async (user_id) => {
  try {
    const { clientType, details } = await scopeChart(user_id);

    const masterSections = await ScopeSection.findAll({
      where: {
        client_type: clientType,
        is_active: true,
      },
      include: [
        {
          model: ScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: ScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    const sectionAreaMapping = SECTION_AREAS[clientType];
    const directRoomSections = DIRECT_ROOM_SECTIONS[clientType];

    // Commercial area sections start from the General Office template
    const generalOfficeSection =
      clientType === "commercial" ? masterSections.find((section) => normalize(section.title) === normalize("GENERAL OFFICE AND COMMON AREAS")) : null;

    const allowedSections = masterSections.filter((section) => matchesChart(section, details, sectionAreaMapping, directRoomSections));

    const existingSections = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
    });

    for (const section of allowedSections) {
      await syncMasterSection(user_id, section, existingSections);
    }

    await addAreaSections(user_id, details, sectionAreaMapping, directRoomSections, generalOfficeSection);
    await deactivateUnmatchedSections(user_id, allowedSections);

    const finalData = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: UserScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    return {
      success: true,
      data: finalData,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getUserScopeView = async (userId) => {
  try {
    // ==========================================
    // GET CLIENT AND CLIENT TYPE
    // ==========================================
    const user = await User.findByPk(userId, {
      attributes: ["id", "client_type"],
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
    }

    const clientType = String(
      user.client_type || "commercial",
    ).toLowerCase();

    if (!["commercial", "residential"].includes(clientType)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid client type",
      );
    }

    // ==========================================
    // VERIFY INITIAL CLIENT CHART EXISTS
    // ==========================================
    const checklist = await ClientChecklist.findOne({
      where: {
        user_id: userId,
        is_active: true,
      },
    });

    if (!checklist) {
      return {
        success: true,
        data: [],
      };
    }

    // ==========================================
    // GET EXISTING USER SCOPE
    // ==========================================
    const sections = await UserScopeSection.findAll({
      where: {
        user_id: userId,
        is_active: true,
      },
      include: [
        {
          model: UserScopeItem,
          as: "items",
          where: {
            is_active: true,
          },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [
          {
            model: UserScopeItem,
            as: "items",
          },
          "order",
          "ASC",
        ],
      ],
    });

    // ==========================================
    // FIND MASTER-BACKED SECTIONS
    // ==========================================
    const masterSectionIds = [
      ...new Set(
        sections
          .filter(
            (section) =>
              section.master_section_id !== null &&
              section.master_section_id !== undefined,
          )
          .map((section) => Number(section.master_section_id)),
      ),
    ];

    let validMasterSectionIds = new Set();

    if (masterSectionIds.length > 0) {
      const matchingMasterSections = await ScopeSection.findAll({
        where: {
          id: {
            [Op.in]: masterSectionIds,
          },
          client_type: clientType,
          is_active: true,
        },
        attributes: ["id"],
      });

      validMasterSectionIds = new Set(
        matchingMasterSections.map((section) => Number(section.id)),
      );
    }

    // ==========================================
    // FILTER BY CLIENT TYPE
    // ==========================================
    const filteredSections = sections.filter((section) => {
      // Preserve custom sections that are not linked
      // to a master ScopeSection.
      if (
        section.master_section_id === null ||
        section.master_section_id === undefined
      ) {
        return true;
      }

      // Master-backed sections must match the client's type.
      return validMasterSectionIds.has(
        Number(section.master_section_id),
      );
    });

    return {
      success: true,
      data: filteredSections,
    };
  } catch (error) {
    logger.error("Error getting user scope view:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

const checkUserScopeExists = async (userId) => {
  try {
    const scope = await UserScopeSection.findOne({
      where: {
        user_id: userId,
        is_active: true,
      },
      attributes: ["id"],
    });

    return {
      exists: !!scope,
    };
  } catch (error) {
    logger.error("Error checking user scope:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

const updateUserScopeSection = async (id, reqBody) => {
  try {
    const section = await UserScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update(reqBody, { fields: editableFields(UserScopeSection, ["user_id", "master_section_id"]) });

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const createUserScopeItem = async (reqBody) => {
  try {
    const {
      user_scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
    } = reqBody;

    const lastItem = await UserScopeItem.findOne({
      where: {
        user_scope_section_id,
      },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastItem ? lastItem.order + 1 : 1;

    const item = await UserScopeItem.create({
      user_scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    });

    return {
      success: true,
      data: item,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateUserScopeItem = async (id, reqBody) => {
  try {
    const item = await UserScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update(reqBody, { fields: editableFields(UserScopeItem, ["master_item_id"]) });

    return {
      success: true,
      data: item,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteUserScopeItem = async (id) => {
  try {
    const item = await UserScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update({
      is_active: false,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const createUserScopeSection = async (reqBody) => {
  try {
    const { user_id, title, is_red = false } = reqBody;

    const lastSection = await UserScopeSection.findOne({
      where: {
        user_id,
      },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastSection ? lastSection.order + 1 : 1;

    const section = await UserScopeSection.create({
      user_id,
      title,
      is_red,
      order: nextOrder,
    });

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteUserScopeSection = async (id) => {
  try {
    const section = await UserScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update({
      is_active: false,
    });

    await UserScopeItem.update(
      {
        is_active: false,
      },
      {
        where: {
          user_scope_section_id: id,
        },
      },
    );

    return {
      success: true,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const reorderUserScopeSections = async (reqBody) => {
  try {
    const { sections } = reqBody; // [{ id, order }, ...]
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "sections array is required");
    }

    await Promise.all(
      sections.map(({ id, order }) =>
        UserScopeSection.update({ order }, { where: { id } }),
      ),
    );

    return { success: true };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const reorderUserScopeItems = async (reqBody) => {
  try {
    const { items } = reqBody; // [{ id, order }, ...] — all from same section
    if (!Array.isArray(items) || items.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "items array is required");
    }

    await Promise.all(
      items.map(({ id, order }) =>
        UserScopeItem.update({ order }, { where: { id } }),
      ),
    );

    return { success: true };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  getUserScope,
  getUserScopeView,
  checkUserScopeExists,
  updateUserScopeSection,
  createUserScopeItem,
  updateUserScopeItem,
  deleteUserScopeItem,
  createUserScopeSection,
  deleteUserScopeSection,
  reorderUserScopeSections,
  reorderUserScopeItems,
};
