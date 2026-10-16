const { status: httpStatus } = require("http-status");

const { TermsAndConditions } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createTermsAndConditons = async (reqBody) => {
  try {
    const contentObj = {
      heading: reqBody.heading,
      description: reqBody.description,
    };

    const contentDoc = await TermsAndConditions.create(contentObj);
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create new Content"
      );
    }
    return contentDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getAllTermsAndConditons = async () => {
  try {
    const contentDoc = await TermsAndConditions.findAll({
      where: { is_active: 1 },
    });
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get all TermsAndConditions"
      );
    }
    return contentDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getAllTermsAndConditonsByAdmin = async () => {
  try {
    const contentDoc = await TermsAndConditions.findAll({
      where: { is_active: 1 },
    });
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get all TermsAndConditions"
      );
    }
    return contentDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};


const findTermsAndConditonsById = async (id) => {
  try {
    const contentDoc = await TermsAndConditions.findByPk(id);
    return contentDoc ? contentDoc : [];
  } catch (error) {
    throw ApiError.from(error);
  }
};

const updateTermsAndConditons = async (reqBody, id) => {
  try {
    const contentDoc = await TermsAndConditions.findByPk(id);

    if (!contentDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Content Id not found");
    }
    if (
      reqBody.heading &&
      typeof reqBody.heading !== "undefined" &&
      reqBody.heading !== ""
    ) {
      contentDoc["heading"] = reqBody.heading;
    }
    if (
      reqBody.description &&
      typeof reqBody.description !== "undefined" &&
      reqBody.description !== ""
    ) {
      contentDoc["description"] = reqBody.description;
    }

    await contentDoc.save();
    return contentDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteTermsAndConditons = async (id) => {
  try {
    const contentDoc = await TermsAndConditions.findByPk(Number(id));
    if (!contentDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "TermsAndConditions not found");
    }
    return await contentDoc.destroy();
  } catch (error) {
    throw ApiError.from(error);
  }
};

module.exports = {
  createTermsAndConditons,
  getAllTermsAndConditons,
  getAllTermsAndConditonsByAdmin,
  findTermsAndConditonsById,
  updateTermsAndConditons,
  deleteTermsAndConditons,
};
