const httpStatus = require("http-status");

const { AboutUs, AboutUsAttachment } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createAboutUs = async (reqBody, files) => {
  try {
    const contentObj = {
      heading: reqBody.heading,
      description: reqBody.description,
    };

    const contentDoc = await AboutUs.create(contentObj);
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create new Content"
      );
    }
    if (
      files &&
      Object.keys(files).length !== 0 &&
      files.images &&
      files.images.length !== 0
    ) {
      for (let i = 0; i < files.images.length; i++) {
        let currImage = files.images[i];
        const aboutUsAttachmentObj = {
          about_us_id: contentDoc.id,
          file_type: "Image",
          file_name: currImage.filename,
          file_uri: "/images",
          file_size: currImage.size,
        };
        await AboutUsAttachment.create(aboutUsAttachmentObj);
      }
    }
    return contentDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const getAllAboutUs = async () => {
  try {
    const contentDoc = await AboutUs.findAll({
      where: { is_active: 1 },
      include: [
        {
          model: AboutUsAttachment,
          as: "aboutUs_attachments",
          attributes: ["id", "file_type", "file_name", "file_uri"],
        },
      ],
    });
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get all Content"
      );
    }
    return contentDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};


const getAllAboutUsByAdmin = async () => {
  try {
    const contentDoc = await AboutUs.findAll({
      where: { is_active: 1 },
      include: [
        {
          model: AboutUsAttachment,
          as: "aboutUs_attachments",
          attributes: ["id", "file_type", "file_name", "file_uri"],
        },
      ],
    });
    if (!contentDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to get all Content"
      );
    }
    return contentDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const findAboutUsById = async (id) => {
  try {
    const contentDoc = await AboutUs.findByPk(id, {
      include: [
        {
          model: AboutUsAttachment,
          as: "aboutUs_attachments",
          attributes: [
            "id",
            "file_type",
            "file_name",
            "file_uri",
            "about_us_id",
          ],
        },
      ],
    });
    return contentDoc ? contentDoc : [];
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const updateAboutUs = async (reqBody, files, id) => {
  let result = "";

  const contentDoc = await AboutUs.findByPk(id);
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
  try {
    result = await contentDoc.save();
    if (
      files &&
      Object.keys(files).length !== 0 &&
      files.images &&
      files.images.length !== 0
    ) {
      for (let i = 0; i < files.images.length; i++) {
        let currImage = files.images[i];
        const aboutUsAttachmentObj = {
          about_us_id: contentDoc.id,
          file_type: "Image",
          file_name: currImage.filename,
          file_uri: "/images",
          file_size: currImage.size,
        };
        await AboutUsAttachment.create(aboutUsAttachmentObj);
      }
    }
    ("");
    return result;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

const deleteAboutUs = async (id) => {
  try {
    const contentDoc = await AboutUs.findByPk(id);
    if (!contentDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Content not found");
    }
    return await contentDoc.destroy();
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};

module.exports = {
  createAboutUs,
  getAllAboutUs,
  getAllAboutUsByAdmin,
  findAboutUsById,
  updateAboutUs,
  deleteAboutUs,
};
