// Service estimate service: the scope sections and items of a single estimate

const { status: httpStatus } = require("http-status");
const { ServiceEstimate } = require("../../../models");
const ApiError = require("../../../utils/ApiError");

const getEstimateScope = async (estimate_id) => {
  try {
    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let scope = estimate.scope_sections || [];

    if (typeof scope === "string") {
      try {
        scope = JSON.parse(scope);
      } catch (e) {
        scope = [];
      }
    }

    return {
      success: true,
      data: scope,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const createEstimateSection = async (reqBody, estimate_id) => {
  try {
    const { title, is_red = false } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }
    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }


    const nextOrder =
      sections.length > 0
        ? Math.max(...sections.map((s) => s.order || 0)) + 1
        : 1;

    const newSection = {
      id: Date.now(),
      title,
      is_red,
      order: nextOrder,
      items: [],
    };

    sections.push(newSection);

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: newSection,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateEstimateSection = async (id, reqBody) => {
  try {
    const { estimate_id, title, is_red } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const section = sections.find((s) => Number(s.id) === Number(id));

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    if (title !== undefined) {
      section.title = title;
    }

    if (is_red !== undefined) {
      section.is_red = is_red;
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: section,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteEstimateSection = async (id, reqBody) => {
  try {
    const { estimate_id } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const sectionExists = sections.find((s) => Number(s.id) === Number(id));

    if (!sectionExists) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    const updatedSections = sections.filter((s) => Number(s.id) !== Number(id));

    await estimate.update({
      scope_sections: updatedSections,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const createEstimateItem = async (reqBody, estimate_id) => {
  try {
    const {
      section_id,
      description,
      is_daily = false,
      is_weekly = false,
      is_monthly = false,
    } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    const section = sections.find((s) => Number(s.id) === Number(section_id));

    if (!section) {
      throw new ApiError(httpStatus.NOT_FOUND, "Section not found");
    }

    if (!section.items) {
      section.items = [];
    }

    const nextOrder =
      section.items.length > 0
        ? Math.max(...section.items.map((i) => i.order || 0)) + 1
        : 1;

    const newItem = {
      id: Date.now(),
      description,
      is_daily,
      is_weekly,
      is_monthly,
      order: nextOrder,
    };

    section.items.push(newItem);

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: newItem,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const updateEstimateItem = async (id, reqBody) => {
  try {
    const { estimate_id, description, is_daily, is_weekly, is_monthly } =
      reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    let updatedItem = null;

    for (const section of sections) {
      if (!section.items) continue;

      const item = section.items.find((i) => Number(i.id) === Number(id));

      if (item) {
        if (description !== undefined) {
          item.description = description;
        }

        if (is_daily !== undefined) {
          item.is_daily = is_daily;
        }

        if (is_weekly !== undefined) {
          item.is_weekly = is_weekly;
        }

        if (is_monthly !== undefined) {
          item.is_monthly = is_monthly;
        }

        updatedItem = item;
        break;
      }
    }

    if (!updatedItem) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
      data: updatedItem,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteEstimateItem = async (id, reqBody) => {
  try {
    const { estimate_id } = reqBody;

    const estimate = await ServiceEstimate.findOne({
      where: {
        id: estimate_id,
        is_active: true,
      },
    });

    if (!estimate) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Estimate not found");
    }

    let sections = estimate.scope_sections || [];

    if (typeof sections === "string") {
      sections = JSON.parse(sections);
    }

    if (!Array.isArray(sections)) {
      sections = [];
    }

    let itemFound = false;

    for (const section of sections) {
      if (!section.items) continue;

      const itemIndex = section.items.findIndex(
        (item) => Number(item.id) === Number(id),
      );

      if (itemIndex !== -1) {
        section.items.splice(itemIndex, 1);
        itemFound = true;
        break;
      }
    }

    if (!itemFound) {
      throw new ApiError(httpStatus.NOT_FOUND, "Item not found");
    }

    await estimate.update({
      scope_sections: sections,
    });

    return {
      success: true,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  getEstimateScope,
  createEstimateSection,
  updateEstimateSection,
  deleteEstimateSection,
  createEstimateItem,
  updateEstimateItem,
  deleteEstimateItem,
};
