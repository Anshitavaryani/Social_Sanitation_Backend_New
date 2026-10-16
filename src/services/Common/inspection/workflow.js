// Inspection service: filling in items, submitting, reviewing items and sections, completing, sending to the client and reopening

const { status: httpStatus } = require("http-status");
const { inspectionReviewStatusTypes, inspectionStatusTypes } = require("../../../config/types");
const ApiError = require("../../../utils/ApiError");
const sequelize = require("../../../config/central.db");
const {
  User,
  Admin,
  Inspection,
  InspectionItem,
  InspectionItemImage,
  Profile,
  UserAddress,
  Country,
  State,
  City,
  InspectionSectionReview,
} = require("../../../models");
const { sendInspectionCompletedEmail } = require("../email.service");

const updateInspectionItem = async (itemId, body) => {
  try {
    const { user, employee_completed, employee_note } = body;

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

    if (typeof employee_completed !== "boolean") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "employee_completed must be true or false.",
      );
    }

    const inspectionItem = await InspectionItem.findOne({
      where: { id: itemId },
      include: [{ model: Inspection, as: "inspection", required: true }],
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

    /*
     * ==========================================
     * LOCK — only COMPLETED/CANCELLED block edits
     * ==========================================
     *
     * Employees can keep ticking items and
     * editing notes all the way through
     * SUBMITTED and UNDER_REVIEW — the admin
     * always sees live data during that window.
     * The lock only kicks in once the BDM
     * actually clicks "Complete Inspection".
     */

    if ([inspectionStatusTypes.COMPLETED, inspectionStatusTypes.CANCELLED].includes(inspection.status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Inspection items can no longer be edited — this inspection is ${inspection.status.toLowerCase()}.`,
      );
    }

    await inspectionItem.update({
      employee_completed,
      employee_note:
        employee_note !== undefined &&
        employee_note !== null &&
        String(employee_note).trim() !== ""
          ? String(employee_note).trim()
          : null,
    });

    if (inspection.status === inspectionStatusTypes.ASSIGNED) {
      await inspection.update({
        status: inspectionStatusTypes.IN_PROGRESS,
        started_at: new Date(),
      });
    }

    const updatedItem = await InspectionItem.findOne({
      where: { id: inspectionItem.id },
      include: [
        { model: Inspection, as: "inspection" },
        { model: InspectionItemImage, as: "images", required: false },
      ],
    });

    return {
      success: true,
      data: updatedItem,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const submitInspection = async (body) => {
  const transaction = await sequelize.transaction();

  try {
    const { inspectionId, user } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated employee not found.",
      );
    }

    if (!inspectionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
    }

    const inspection = await Inspection.findOne({
      where: { id: inspectionId },
      include: [{ model: InspectionItem, as: "items", required: false }],
      transaction,
    });

    if (!inspection) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection not found.");
    }

    if (Number(inspection.employee_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not assigned to this inspection.",
      );
    }

    if (inspection.status === inspectionStatusTypes.SUBMITTED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has already been submitted.",
      );
    }

    if (inspection.status === inspectionStatusTypes.UNDER_REVIEW) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection is already under review.",
      );
    }

    if (inspection.status === inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has already been completed.",
      );
    }

    if (inspection.status === inspectionStatusTypes.CANCELLED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cancelled inspection cannot be submitted.",
      );
    }

    const items = inspection.items || [];

    if (items.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has no inspection items.",
      );
    }

    /*
     * ==========================================
     * NOTE: completion is no longer required
     * ==========================================
     *
     * IMPORTANT:
     *
     * Employees can submit with items still
     * unchecked — the BDM's review and the
     * auto-calculated score already reflect
     * however many items actually got completed.
     * There is deliberately no "all items must
     * be complete" gate here anymore.
     */

    await inspection.update(
      {
        status: inspectionStatusTypes.SUBMITTED,
        employee_submitted_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    const updatedInspection = await Inspection.findOne({
      where: { id: inspection.id },
      include: [
        {
          model: InspectionItem,
          as: "items",
          required: false,
          include: [
            { model: InspectionItemImage, as: "images", required: false },
          ],
        },
      ],
    });

    return {
      success: true,
      data: updatedInspection,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw ApiError.orInternal(error);
  }
};

const reviewInspectionItem = async (body) => {
  try {
    const { itemId, user, bdm_status, bdm_remark } = body;

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

    if (!bdm_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "BDM review status is required.",
      );
    }

    /*
     * ==========================================
     * VALID BDM STATUSES
     * ==========================================
     */

    const allowedStatuses = [inspectionReviewStatusTypes.APPROVED, inspectionReviewStatusTypes.ISSUE];

    if (!allowedStatuses.includes(bdm_status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid BDM review status. Allowed values are APPROVED or ISSUE.",
      );
    }

    /*
     * ==========================================
     * ISSUE MUST HAVE REMARK
     * ==========================================
     */

    if (
      bdm_status === inspectionReviewStatusTypes.ISSUE &&
      (!bdm_remark || String(bdm_remark).trim() === "")
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "A remark is required when marking an inspection item as an issue.",
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
        "Cancelled inspection cannot be reviewed.",
      );
    }

    if (inspection.status === inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Completed inspection cannot be modified.",
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
        "Inspection has not been submitted by the employee yet.",
      );
    }

    /*
     * ==========================================
     * UPDATE REVIEW
     * ==========================================
     */

    await inspectionItem.update({
      bdm_status,
      bdm_remark:
        bdm_remark !== undefined &&
        bdm_remark !== null &&
        String(bdm_remark).trim() !== ""
          ? String(bdm_remark).trim()
          : null,
      bdm_reviewed_at: new Date(),
    });

    /*
     * ==========================================
     * MOVE INSPECTION TO UNDER REVIEW
     * ==========================================
     */

    if (inspection.status === inspectionStatusTypes.SUBMITTED) {
      await inspection.update({
        status: inspectionStatusTypes.UNDER_REVIEW,
      });
    }

    /*
     * ==========================================
     * GET UPDATED ITEM
     * ==========================================
     */

    const updatedItem = await InspectionItem.findOne({
      where: {
        id: inspectionItem.id,
      },

      include: [
        {
          model: Inspection,
          as: "inspection",
        },

        {
          model: InspectionItemImage,
          as: "images",
          required: false,
        },
      ],
    });

    return {
      success: true,
      data: updatedItem,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const reviewInspectionSection = async (body) => {
  try {
    const { sectionReviewId, user, status, remark } = body;

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

    if (!sectionReviewId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Section review ID is required.",
      );
    }

    if (!status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Section review status is required.",
      );
    }

    /*
     * ==========================================
     * VALID STATUS
     * ==========================================
     */

    const allowedStatuses = [inspectionReviewStatusTypes.APPROVED, inspectionReviewStatusTypes.ISSUE];

    if (!allowedStatuses.includes(status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid section review status. Allowed values are APPROVED or ISSUE.",
      );
    }

    /*
     * ==========================================
     * ISSUE MUST HAVE REMARK
     * ==========================================
     */

    if (status === inspectionReviewStatusTypes.ISSUE && (!remark || String(remark).trim() === "")) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "A remark is required when marking a section as an issue.",
      );
    }

    /*
     * ==========================================
     * GET SECTION REVIEW
     * ==========================================
     */

    const sectionReview = await InspectionSectionReview.findOne({
      where: {
        id: sectionReviewId,
      },

      include: [
        {
          model: Inspection,
          as: "inspection",
          required: true,
        },
      ],
    });

    if (!sectionReview) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Inspection section review not found.",
      );
    }

    const inspection = sectionReview.inspection;

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
        "Cancelled inspection cannot be reviewed.",
      );
    }

    if (inspection.status === inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Completed inspection cannot be modified.",
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
        "Inspection has not been submitted by the employee yet.",
      );
    }

    /*
     * ==========================================
     * GET CURRENT SECTION ITEMS
     * ==========================================
     *
     * Section score is calculated from the
     * actual inspection items.
     *
     * Example:
     *
     * 12 completed / 14 total
     *
     * score = 12
     * score_out_of = 14
     */

    const sectionItems = await InspectionItem.findAll({
      where: {
        inspection_id: inspection.id,
        scope_section_id: sectionReview.scope_section_id,
      },
    });

    const totalItems = sectionItems.length;

    const completedItems = sectionItems.filter((item) =>
      Boolean(item.employee_completed),
    ).length;

    const calculatedScore = completedItems;

    /*
     * ==========================================
     * UPDATE SECTION REVIEW
     * ==========================================
     */

    await sectionReview.update({
      total_items: totalItems,
      completed_items: completedItems,

      status,

      score: calculatedScore,

      remark:
        remark !== undefined && remark !== null && String(remark).trim() !== ""
          ? String(remark).trim()
          : null,

      reviewed_by: user.id,
      reviewed_at: new Date(),
    });

    /*
     * ==========================================
     * MOVE INSPECTION TO UNDER REVIEW
     * ==========================================
     */

    if (inspection.status === inspectionStatusTypes.SUBMITTED) {
      await inspection.update({
        status: inspectionStatusTypes.UNDER_REVIEW,
      });
    }

    /*
     * ==========================================
     * RETURN UPDATED SECTION
     * ==========================================
     */

    return {
      success: true,

      data: {
        id: sectionReview.id,
        inspection_id: sectionReview.inspection_id,

        scope_section_id: sectionReview.scope_section_id,

        section_name: sectionReview.section_name,
        section_order: sectionReview.section_order,

        total_items: totalItems,
        completed_items: completedItems,

        score: calculatedScore,
        score_out_of: totalItems,

        status: sectionReview.status,
        remark: sectionReview.remark,

        reviewed_by: sectionReview.reviewed_by,
        reviewed_at: sectionReview.reviewed_at,
      },
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const COMPLETABLE_STATUSES = [inspectionStatusTypes.SUBMITTED, inspectionStatusTypes.UNDER_REVIEW, inspectionStatusTypes.REOPENED];

const completeInspection = async (body) => {
  const transaction = await sequelize.transaction();

  try {
    const { inspectionId, user, overall_remark } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated BDM not found.",
      );
    }

    if (!inspectionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
    }

    const inspection = await Inspection.findOne({
      where: { id: inspectionId },
      include: [
        { model: InspectionItem, as: "items", required: false },
        {
          model: InspectionSectionReview,
          as: "section_reviews",
          required: false,
        },
      ],
      transaction,
    });

    if (!inspection) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection not found.");
    }

    if (Number(inspection.bdm_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not the BDM assigned to this inspection.",
      );
    }

    if (inspection.status === inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has already been completed.",
      );
    }

    if (inspection.status === inspectionStatusTypes.CANCELLED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Cancelled inspection cannot be completed.",
      );
    }

    /*
     * SUBMITTED is allowed because after a
     * reopen + employee resubmit, every section
     * may already carry a review — the BDM
     * shouldn't be forced to touch a review just
     * to flip the status. The pending-section
     * check below still guarantees everything
     * has been reviewed.
     */
    if (!COMPLETABLE_STATUSES.includes(inspection.status)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection must be submitted by the employee before it can be completed.",
      );
    }

    const items = inspection.items || [];

    if (items.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has no inspection items.",
      );
    }

    const sectionReviews = inspection.section_reviews || [];

    if (sectionReviews.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection has no section reviews.",
      );
    }

    const pendingSections = sectionReviews.filter(
      (section) => section.status === inspectionReviewStatusTypes.PENDING,
    );

    if (pendingSections.length > 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${pendingSections.length} inspection section(s) still need to be reviewed before the inspection can be completed.`,
      );
    }

    /*
     * ==========================================
     * REFRESH SECTION SCORES
     * ==========================================
     *
     * Section scores were saved at review time.
     * The employee can keep ticking items after
     * that (and especially after a reopen), so
     * recalculate from the live items before
     * locking the inspection.
     */

    for (const sectionReview of sectionReviews) {
      const sectionItems = items.filter(
        (item) =>
          Number(item.scope_section_id) ===
          Number(sectionReview.scope_section_id),
      );

      const sectionCompleted = sectionItems.filter((item) =>
        Boolean(item.employee_completed),
      ).length;

      await sectionReview.update(
        {
          total_items: sectionItems.length,
          completed_items: sectionCompleted,
          score: sectionCompleted,
        },
        { transaction },
      );
    }

    /*
     * Overall score is ALWAYS out of 10.
     */

    const totalItems = items.length;

    const completedItems = items.filter((item) =>
      Boolean(item.employee_completed),
    ).length;

    const calculatedScore =
      totalItems > 0 ? Math.round((completedItems / totalItems) * 10) : 0;

    await inspection.update(
      {
        status: inspectionStatusTypes.COMPLETED,
        score: calculatedScore,
        overall_remark:
          overall_remark !== undefined &&
          overall_remark !== null &&
          String(overall_remark).trim() !== ""
            ? String(overall_remark).trim()
            : null,
        bdm_completed_at: new Date(),
      },
      { transaction },
    );

    await transaction.commit();

    const completedInspection = await Inspection.findOne({
      where: { id: inspection.id },
      include: [
        {
          model: InspectionItem,
          as: "items",
          required: false,
          include: [
            { model: InspectionItemImage, as: "images", required: false },
          ],
        },
        {
          model: InspectionSectionReview,
          as: "section_reviews",
          required: false,
        },
      ],
    });

    return {
      success: true,
      data: completedInspection,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw ApiError.orInternal(error);
  }
};

const sendInspectionToClient = async (body) => {
  try {
    const { inspectionId, user } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated BDM not found.",
      );
    }

    if (!inspectionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
    }

    const bdm = await Admin.findOne({
      where: { id: user.id, is_active: true },
    });

    if (!bdm) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "BDM not found or inactive.");
    }

    const inspection = await Inspection.findOne({
      where: { id: inspectionId },
      include: [
        {
          model: User,
          as: "client",
          required: true,
          attributes: ["id", "email", "role_id"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              required: false,
              attributes: ["id", "name"],
            },

            /*
             * ==========================================
             * CLIENT ADDRESS
             * ==========================================
             *
             * Matches the real association names shown
             * in the getUserById response: user_address
             * (array), each with nested user_country,
             * user_state, user_city. If a client has no
             * saved address, this array is simply empty
             * — formatAddress() below returns null and
             * detailsTable() drops that row entirely, so
             * the email still sends cleanly with no
             * "Address: —" placeholder.
             */
            {
              model: UserAddress,
              as: "user_address",
              required: false,
              include: [
                { model: Country, as: "user_country", required: false },
                { model: State, as: "user_state", required: false },
                { model: City, as: "user_city", required: false },
              ],
            },
          ],
        },

        {
          model: User,
          as: "employee",
          required: false,
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              required: false,
              attributes: ["id", "name"],
            },
          ],
        },

        {
          model: InspectionItem,
          as: "items",
          required: false,
        },
      ],
    });

    if (!inspection) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection not found.");
    }

    if (inspection.status !== inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Inspection must be completed before it can be sent to the client.",
      );
    }

    if (!inspection.client?.email) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This client has no email on file to send the inspection report to.",
      );
    }

    const clientName = inspection.client.user_profile?.name || "there";

    await sendInspectionCompletedEmail({
      to: inspection.client.email,
      name: clientName,
      inspection: inspection.toJSON(),
    });

    await inspection.update({
      client_email_sent: true,
      client_email_sent_at: new Date(),
    });

    return {
      success: true,
      data: {
        id: inspection.id,
        client_email_sent: true,
        client_email_sent_at: inspection.client_email_sent_at,
      },
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const reopenInspection = async (body) => {
  const { inspectionId, user, remark } = body;

  if (!user?.id) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Authenticated BDM not found.");
  }

  if (!inspectionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
  }

  const reason =
    remark !== undefined && remark !== null && String(remark).trim() !== ""
      ? String(remark).trim()
      : null;

  if (!reason) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "A reason is required to reopen an inspection.",
    );
  }

  const transaction = await sequelize.transaction();

  try {
    const inspection = await Inspection.findOne({
      where: { id: inspectionId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!inspection) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection not found.");
    }

    if (Number(inspection.bdm_id) !== Number(user.id)) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        "You are not the BDM assigned to this inspection.",
      );
    }

    if (inspection.status !== inspectionStatusTypes.COMPLETED) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Only completed inspections can be reopened.",
      );
    }

    /*
     * ==========================================
     * REOPEN — REVIEWS ARE KEPT
     * ==========================================
     *
     * Item + section reviews are NOT reset. The
     * BDM sees their previous reviews and edits
     * whichever ones need changing, then
     * completes again. The employee can tick /
     * untick items and resubmit.
     *
     * The final grade is cleared — it gets
     * recalculated on the next completion.
     * overall_remark is left as-is (the Complete
     * modal pre-fills it so the BDM can edit it).
     */

    await inspection.update(
      {
        status: inspectionStatusTypes.REOPENED,

        score: null,
        bdm_completed_at: null,

        employee_submitted_at: null,

        client_email_sent: false,
        client_email_sent_at: null,

        reopened_at: new Date(),
        reopen_remark: reason,
        reopen_count: Number(inspection.reopen_count || 0) + 1,
      },
      { transaction },
    );

    await transaction.commit();

    return {
      success: true,
      data: inspection,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw ApiError.orInternal(error);
  }
};

module.exports = {
  reopenInspection,
  updateInspectionItem,
  submitInspection,
  reviewInspectionItem,
  reviewInspectionSection,
  completeInspection,
  sendInspectionToClient,
};
