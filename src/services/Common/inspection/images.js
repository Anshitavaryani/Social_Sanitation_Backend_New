// Inspection service: uploading and deleting inspection photos (employees and BDMs)

const logger = require("../../../config/logger");
const { status: httpStatus } = require("http-status");
const { inspectionStatusTypes } = require("../../../config/types");
const ApiError = require("../../../utils/ApiError");
const { Inspection, InspectionItem, InspectionItemImage } = require("../../../models");
const { deleteInspectionImageFile } = require("./imageFiles");

const uploadInspectionItemImage = async (body, files, itemId) => {
  try {
    const user = body?.user;
    const imageFiles = files?.images || [];

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated employee not found.",
      );
    }

    if (!itemId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection item ID is required.",
      );
    }

    if (!imageFiles.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "At least one inspection image is required.",
      );
    }

    const inspectionItem = await InspectionItem.findOne({
      where: {
        id: itemId,
      },
      include: [
        {
          model: Inspection,
          as: "inspection",
          required: true,
        },
      ],
    });

    if (!inspectionItem) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection item not found.");
    }

    const inspection = inspectionItem.inspection;

    if (Number(inspection.employee_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not assigned to this inspection.",
      );
    }

    if (inspection.status === inspectionStatusTypes.CANCELLED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cannot upload image to a cancelled inspection.",
      );
    }

    if ([inspectionStatusTypes.COMPLETED, inspectionStatusTypes.CANCELLED].includes(inspection.status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Employee cannot upload images after the inspection has been completed.",
      );
    }

    const imageRecords = imageFiles.map((file) => ({
      inspection_id: inspection.id,
      inspection_item_id: inspectionItem.id,
      uploaded_by: user.id,
      uploaded_by_role: "EMPLOYEE",
      image: `/${file.filename}`,
    }));

    const images = await InspectionItemImage.bulkCreate(imageRecords);

    if (inspection.status === inspectionStatusTypes.ASSIGNED) {
      await inspection.update({
        status: inspectionStatusTypes.IN_PROGRESS,
        started_at: new Date(),
      });
    }

    return {
      success: true,
      data: images,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const uploadBDMInspectionItemImage = async (body, files, itemId) => {
  try {
    const user = body?.user;
    const imageFiles = files?.images || [];

    /*
     * ==========================================
     * BASIC VALIDATION
     * ==========================================
     */

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated BDM not found.",
      );
    }

    if (!itemId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection item ID is required.",
      );
    }

    if (!imageFiles.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "At least one inspection image is required.",
      );
    }

    /*
     * ==========================================
     * GET INSPECTION ITEM
     * ==========================================
     */

    const inspectionItem = await InspectionItem.findOne({
      where: {
        id: itemId,
      },
      include: [
        {
          model: Inspection,
          as: "inspection",
          required: true,
        },
      ],
    });

    if (!inspectionItem) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection item not found.");
    }

    const inspection = inspectionItem.inspection;

    /*
     * ==========================================
     * VERIFY BDM
     * ==========================================
     */

    if (Number(inspection.bdm_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not the BDM assigned to this inspection.",
      );
    }

    /*
     * ==========================================
     * CHECK INSPECTION STATUS
     * ==========================================
     */

    if (inspection.status === inspectionStatusTypes.CANCELLED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cannot upload image to a cancelled inspection.",
      );
    }

    if (inspection.status === inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cannot upload image to a completed inspection.",
      );
    }

    if (inspection.status === inspectionStatusTypes.ASSIGNED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Employee has not started this inspection yet.",
      );
    }

    if (inspection.status === inspectionStatusTypes.IN_PROGRESS) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Employee has not submitted this inspection yet.",
      );
    }

    /*
     * ==========================================
     * BUILD IMAGE RECORDS
     * ==========================================
     */

    const imageRecords = imageFiles.map((file) => ({
      inspection_id: inspection.id,
      inspection_item_id: inspectionItem.id,
      uploaded_by: user.id,
      uploaded_by_role: "BDM",
      image: `/${file.filename}`,
    }));

    /*
     * ==========================================
     * CREATE IMAGE RECORDS
     * ==========================================
     */

    const images = await InspectionItemImage.bulkCreate(imageRecords);

    /*
     * ==========================================
     * IF SUBMITTED, MOVE TO UNDER REVIEW
     * ==========================================
     */

    if (inspection.status === inspectionStatusTypes.SUBMITTED) {
      await inspection.update({
        status: inspectionStatusTypes.UNDER_REVIEW,
      });
    }

    /*
     * ==========================================
     * RETURN IMAGES
     * ==========================================
     */

    return {
      success: true,
      data: images,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteInspectionItemImage = async (body, imageId) => {
  try {
    const { user } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated employee not found.",
      );
    }

    if (!imageId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Image ID is required.");
    }

    const image = await InspectionItemImage.findOne({
      where: { id: imageId },
      include: [
        {
          model: InspectionItem,
          as: "item",
          required: true,
          include: [{ model: Inspection, as: "inspection", required: true }],
        },
      ],
    });

    if (!image) {
      throw new ApiError(httpStatus.NOT_FOUND, "Image not found.");
    }

    const inspection = image.item.inspection;

    /*
     * ==========================================
     * OWNERSHIP CHECK
     * ==========================================
     *
     * Employee can only delete their OWN
     * uploads — not a BDM's images, and not
     * another employee's if reassigned.
     */

    if (
      image.uploaded_by_role !== "EMPLOYEE" ||
      Number(image.uploaded_by) !== Number(user.id)
    ) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You can only delete images you uploaded.",
      );
    }

    if (Number(inspection.employee_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not assigned to this inspection.",
      );
    }

    /*
     * ==========================================
     * LOCK CHECK
     * ==========================================
     *
     * Same rule as editing items — once
     * submitted, nothing employee-side is
     * mutable anymore, including their own
     * photos.
     */

    if ([inspectionStatusTypes.COMPLETED, inspectionStatusTypes.CANCELLED].includes(inspection.status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Images can no longer be deleted — this inspection is ${inspection.status.toLowerCase()}.`,
      );
    }

    try {
      deleteInspectionImageFile(image.image);
    } catch (fileError) {
      logger.error("Failed to delete image file:", fileError.message);
    }

    await image.destroy();

    return {
      success: true,
      data: { id: image.id },
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = { uploadInspectionItemImage, uploadBDMInspectionItemImage, deleteInspectionItemImage };
