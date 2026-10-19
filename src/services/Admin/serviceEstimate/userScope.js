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

const getUserScope = async (user_id) => {
  try {
    // ============================================================
    // GET USER AND CLIENT TYPE
    // ============================================================
    const user = await User.findByPk(user_id);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found");
    }

    const clientType = String(
      user.client_type || "commercial",
    ).toLowerCase();

    if (!["commercial", "residential"].includes(clientType)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid client type");
    }

    // ============================================================
    // GET LATEST CLIENT CHECKLIST
    // ============================================================
    const checklist = await ClientChecklist.findOne({
      where: { user_id },
      order: [["created_at", "DESC"]],
    });

    if (!checklist) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please complete the Initial Client Chart before generating the Scope of Work.",
      );
    }

    const details = await ClientChecklistDetail.findAll({
      where: { checklist_id: checklist.id },
    });

    // Residential uses num_desks_trash_cans as its single
    // count field. Commercial retains its existing count fields.
    const hasValues = (detail) =>
      Number(detail.restrooms || 0) > 0 ||
      Number(detail.stalls || 0) > 0 ||
      Number(detail.sinks || 0) > 0 ||
      Number(detail.num_desks_trash_cans || 0) > 0;

    if (!details.some(hasValues)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please fill in the Initial Client Chart before generating the Scope of Work.",
      );
    }

    // Normalize titles and service-area labels for reliable matching.
    const normalize = (value) =>
      String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

    // ============================================================
    // GET ACTIVE MASTER SECTIONS FOR THIS CLIENT TYPE
    // ============================================================
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

    // ============================================================
    // COMMERCIAL MAPPINGS — PRESERVED
    // ============================================================
    const commercialSectionAreaMapping = {
      "GENERAL OFFICE AND COMMON AREAS": [
        "Office Areas",
        "Group / Common Rooms",
        "Classrooms / Conference Rooms",
      ],
      "BATHROOMS AND RESTROOM AREAS": ["Restrooms"],
      "KITCHEN AND BREAK AREAS": ["Kitchen Areas"],
      "HALLWAYS / LOBBY AREAS": ["Entrance / Lobby Areas"],
      "HALLWAYS / ALL AREAS": ["All Areas / Hallways"],
    };

    const commercialDirectRoomSections = {
      "Cubicle Areas": "CUBICLE AREAS",
      "Ballroom Area": "BALLROOM AREA",
      Conservatory: "CONSERVATORY",
      Salon: "SALON",
      "Pharmacy Room": "PHARMACY ROOM",
      "Mail Room": "MAIL ROOM",
    };

    // ============================================================
    // RESIDENTIAL MAPPINGS
    // Keys are master section titles.
    // Values are Initial Client Chart service_area values.
    // ============================================================
    const residentialSectionAreaMapping = {
      "Entrance / Lobby Areas": ["Entrance / Lobby Areas"],
      Bathrooms: ["Bathrooms"],
      Kitchen: ["Kitchen"],
      Bedrooms: ["Bedrooms"],
      "Dining Room": ["Dining Room"],
      "Living Room": ["Living Room"],
      Foyer: ["Foyer"],
    };

    const sectionAreaMapping =
      clientType === "commercial"
        ? commercialSectionAreaMapping
        : residentialSectionAreaMapping;

    const directRoomSections =
      clientType === "commercial"
        ? commercialDirectRoomSections
        : {};

    // Commercial dynamic sections keep using the existing template.
    const generalOfficeSection =
      clientType === "commercial"
        ? masterSections.find(
            (section) =>
              normalize(section.title) ===
              normalize("GENERAL OFFICE AND COMMON AREAS"),
          )
        : null;

    // ============================================================
    // FIND MASTER SECTIONS THAT MATCH THE CHECKLIST
    // ============================================================
    const allowedSections = masterSections.filter((section) => {
      return details.some((detail) => {
        if (!hasValues(detail)) {
          return false;
        }

        const mappedAreas = sectionAreaMapping[section.title] || [];

        if (
          mappedAreas.some(
            (area) => normalize(area) === normalize(detail.service_area),
          )
        ) {
          return true;
        }

        const directMatch = Object.entries(directRoomSections).find(
          ([area]) => normalize(area) === normalize(detail.service_area),
        );

        return (
          Boolean(directMatch) &&
          normalize(directMatch[1]) === normalize(section.title)
        );
      });
    });

    // ============================================================
    // GET EXISTING USER SECTIONS
    // ============================================================
    let existingSections = await UserScopeSection.findAll({
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

    // ============================================================
    // CREATE OR REUSE USER SECTIONS AND POPULATE ITEMS
    // ============================================================
    for (const section of allowedSections) {
      // First look for a section already linked to this master section.
      let existingSection = existingSections.find(
        (item) =>
          Number(item.master_section_id) === Number(section.id),
      );

      // Reuse an old unlinked section when its title matches.
      if (!existingSection) {
        existingSection = existingSections.find(
          (item) =>
            !item.master_section_id &&
            normalize(item.title) === normalize(section.title),
        );
      }

      if (existingSection) {
        // Link legacy section records to the appropriate master section.
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
        const alreadyExists = existingItems.find(
          (existingItem) =>
            Number(existingItem.master_item_id) === Number(item.id),
        );

        if (!alreadyExists) {
          await UserScopeItem.create({
            user_scope_section_id: existingSection.id,
            master_item_id: item.id,
            description: item.description,
            is_daily: item.is_daily,
            is_weekly: item.is_weekly,
            is_monthly: item.is_monthly,
            order: item.order,
            is_active: true,
          });
        }
      }
    }

    // ============================================================
    // CREATE DYNAMIC SECTIONS FOR UNMAPPED SERVICE AREAS
    // ============================================================
    for (const detail of details) {
      if (!hasValues(detail) || !detail.service_area) {
        continue;
      }

      const isMapped =
        Object.values(sectionAreaMapping)
          .flat()
          .some(
            (area) => normalize(area) === normalize(detail.service_area),
          ) ||
        Object.keys(directRoomSections).some(
          (area) => normalize(area) === normalize(detail.service_area),
        );

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

      const nextOrder = lastSection
        ? Number(lastSection.order || 0) + 1
        : 1;

      const newSection = await UserScopeSection.create({
        user_id,
        title: dynamicTitle,
        order: nextOrder,
        is_red: false,
        is_active: true,
      });

      // Preserve the existing commercial behavior only.
      if (clientType === "commercial" && generalOfficeSection) {
        for (const item of generalOfficeSection.items || []) {
          await UserScopeItem.create({
            user_scope_section_id: newSection.id,
            master_item_id: item.id,
            description: item.description,
            is_daily: item.is_daily,
            is_weekly: item.is_weekly,
            is_monthly: item.is_monthly,
            order: item.order,
            is_active: true,
          });
        }
      }
    }

    // ============================================================
    // DEACTIVATE MASTER SECTIONS NO LONGER ALLOWED
    // Preserve custom/dynamic sections.
    // ============================================================
    existingSections = await UserScopeSection.findAll({
      where: {
        user_id,
        is_active: true,
      },
    });

    const allowedSectionIds = allowedSections.map((section) =>
      Number(section.id),
    );

    for (const existingSection of existingSections) {
      if (!existingSection.master_section_id) {
        continue;
      }

      if (
        !allowedSectionIds.includes(
          Number(existingSection.master_section_id),
        )
      ) {
        await UserScopeSection.update(
          { is_active: false },
          { where: { id: existingSection.id } },
        );

        await UserScopeItem.update(
          { is_active: false },
          {
            where: {
              user_scope_section_id: existingSection.id,
            },
          },
        );
      }
    }

    // ============================================================
    // RETURN FINAL USER SCOPE
    // ============================================================
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
