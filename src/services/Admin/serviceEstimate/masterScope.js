// Service estimate service: the master scope template (sections and items every client's scope starts from)

const { status: httpStatus } = require("http-status");
const { editableFields } = require("../../../utils/editableFields");
const { ScopeSection, ScopeItem } = require("../../../models");
const ApiError = require("../../../utils/ApiError");

// scope of work services

const createScopeSection = async (reqBody) => {
  try {
    const { title, is_red = false, client_type = "commercial" } = reqBody;

    if (!title) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Title is required");
    }

    if (!["commercial", "residential"].includes(client_type)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "client_type must be commercial or residential",
      );
    }

    // 🔥 AUTO ORDER
    const lastSection = await ScopeSection.findOne({
      where: {
        client_type,
        is_active: true,
      },
      order: [["order", "DESC"]],
    });
    const nextOrder = lastSection ? lastSection.order + 1 : 1;

    const section = await ScopeSection.create({
      title,
      order: nextOrder,
      is_red,
      client_type,
    });

    return { success: true, data: section };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateScopeSection = async (id, reqBody) => {
  try {
    const section = await ScopeSection.findByPk(id);
    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    await section.update(reqBody, { fields: editableFields(ScopeSection) });

    return { success: true, data: section };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteScopeSection = async (id) => {
  try {
    const section = await ScopeSection.findByPk(id);

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    // Store client type before soft deletion
    const clientType = section.client_type;

    // Soft delete section
    await section.update({ is_active: false });

    // Soft delete items belonging to this section
    await ScopeItem.update({ is_active: false }, { where: { section_id: id } });

    // Reorder only sections of the same client type
    const sections = await ScopeSection.findAll({
      where: {
        client_type: clientType,
        is_active: true,
      },
      order: [
        ["order", "ASC"],
        ["id", "ASC"],
      ],
    });

    for (let i = 0; i < sections.length; i++) {
      await sections[i].update({ order: i + 1 });
    }

    return { success: true };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const createScopeItem = async (reqBody) => {
  try {
    const {
      scope_section_id,
      description,
      is_daily = false,
      is_weekly = false,
      is_monthly = false,
    } = reqBody;

    if (!scope_section_id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "scope_section_id is required",
      );
    }

    if (!description) {
      throw new ApiError(httpStatus.BAD_REQUEST, "description is required");
    }

    const lastItem = await ScopeItem.findOne({
      where: { section_id: scope_section_id, is_active: true },
      order: [["order", "DESC"]],
    });

    const nextOrder = lastItem ? lastItem.order + 1 : 1;

    const item = await ScopeItem.create({
      section_id: scope_section_id,
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    });

    return { success: true, data: item };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateScopeItem = async (id, reqBody) => {
  try {
    const item = await ScopeItem.findByPk(id);
    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await item.update(reqBody, { fields: editableFields(ScopeItem) });

    return { success: true, data: item };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteScopeItem = async (id) => {
  try {
    const item = await ScopeItem.findByPk(id);

    if (!item) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    const sectionId = item.section_id;

    // Soft delete
    await item.update({ is_active: false });

    // Reorder remaining active items in this section
    const items = await ScopeItem.findAll({
      where: {
        section_id: sectionId,
        is_active: true,
      },
      order: [["order", "ASC"]],
    });

    for (let i = 0; i < items.length; i++) {
      await items[i].update({ order: i + 1 });
    }

    return { success: true };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getScope = async (client_type = "commercial") => {
  try {
    if (!["commercial", "residential"].includes(client_type)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "client_type must be commercial or residential",
      );
    }

    const data = await ScopeSection.findAll({
      where: {
        client_type,
        is_active: true,
      },
      include: [
        {
          model: ScopeItem,
          as: "items",
          where: {
            is_active: true,
          },
          required: false,
        },
      ],
      order: [
        ["order", "ASC"],
        [{ model: ScopeItem, as: "items" }, "order", "ASC"],
      ],
    });

    return { success: true, data };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  createScopeSection,
  updateScopeSection,
  deleteScopeSection,
  createScopeItem,
  updateScopeItem,
  deleteScopeItem,
  getScope,
};
