// Inspection service: creating, listing, reading and deleting inspections

const logger = require("../../../config/logger");
const { status: httpStatus } = require("http-status");
const { inspectionReviewStatusTypes, inspectionStatusTypes } = require("../../../config/types");
const ApiError = require("../../../utils/ApiError");
const { DATE_FORMAT, isValidDate } = require("../../../utils/time");
const { Op } = require("sequelize");
const sequelize = require("../../../config/central.db");
const {
  User,
  Admin,
  Inspection,
  UserScopeItem,
  UserScopeSection,
  InspectionItem,
  InspectionItemImage,
  Profile,
  InspectionSectionReview,
  ScopeSection,
} = require("../../../models");
const { getUserScope } = require("../../Admin/serviceEstimate.service");
const { deleteInspectionImageFile } = require("./imageFiles");

const createInspection = async (body) => {
  const { user, user_id, employee_id, inspection_date } = body;

  /*
   * ==========================================
   * BASIC VALIDATION
   * ==========================================
   */

  if (!user?.id) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Authenticated user not found.",
    );
  }

  if (!user_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Client is required.");
  }

  if (!employee_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Employee is required.");
  }

  if (!inspection_date) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Inspection date is required.");
  }

  /*
   * ==========================================
   * VALIDATE DATE
   * ==========================================
   */

  if (!isValidDate(inspection_date)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Inspection date must be in ${DATE_FORMAT} format.`,
    );
  }

  const parsedDate = new Date(`${inspection_date}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Invalid inspection date.");
  }

  /*
   * ==========================================
   * GET AUTHENTICATED BDM
   * ==========================================
   *
   * IMPORTANT:
   *
   * Everything below, up through the scope
   * read, runs WITHOUT a transaction on
   * purpose. These are all reads (or, in
   * getUserScope's case, writes that fully
   * commit on their own). If we ran these
   * inside a transaction, MySQL's REPEATABLE
   * READ snapshot — locked in at that
   * transaction's FIRST query — would still be
   * "stale" by the time getUserScope() commits
   * new rows on its own separate connection.
   * That staleness is exactly what was causing
   * "doesn't map to any active scope sections"
   * even though the rows clearly existed in the
   * DB right after.
   */

  const bdm = await Admin.findOne({
    where: {
      id: user.id,
      is_active: true,
    },
  });

  if (!bdm) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      "Authenticated BDM not found or inactive.",
    );
  }

  /*
   * ==========================================
   * GET CLIENT
   * ==========================================
   */

  const client = await User.findOne({
    where: {
      id: user_id,
    },
    attributes: ["id", "email", "client_type"],
    include: [
      {
        model: Profile,
        as: "user_profile",
        required: false,
      },
    ],
  });

  if (!client) {
    throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
  }

  const clientType = String(client.client_type || "commercial").toLowerCase();

  if (!["commercial", "residential"].includes(clientType)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Invalid client type for this client.",
    );
  }

  /*
   * ==========================================
   * GET EMPLOYEE
   * ==========================================
   */

  const employee = await User.findOne({
    where: {
      id: employee_id,
    },

    include: [
      {
        model: Profile,
        as: "user_profile",
        required: false,
      },
    ],
  });

  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, "Employee not found.");
  }

  /*
   * ==========================================
   * CHECK DUPLICATE INSPECTION
   * ==========================================
   *
   * One client can have only one inspection
   * on a particular date.
   */

  const existingInspection = await Inspection.findOne({
    where: {
      user_id,
      inspection_date,
    },
  });

  if (existingInspection) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `An inspection already exists for this client on ${inspection_date}.`,
    );
  }

  /*
   * ==========================================
   * ENSURE CLIENT SCOPE EXISTS
   * ==========================================
   *
   * getUserScope() auto-generates the client's
   * scope of work from their checklist if it
   * doesn't exist yet, and syncs it if the
   * checklist changed. Runs on its own
   * connection, fully committing before we
   * move on.
   *
   * If the client has no checklist at all,
   * getUserScope() throws NOT_FOUND — caught
   * here and turned into a clearer message.
   */

  try {
    await getUserScope(user_id);
  } catch (scopeError) {
    if (
      scopeError instanceof ApiError &&
      scopeError.statusCode === httpStatus.NOT_FOUND
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This client has no checklist on file, so a scope of work cannot be generated. Please complete their checklist first.",
      );
    }

    throw scopeError;
  }

  /*
   * ==========================================
   * GET COMPLETE USER SCOPE
   * ==========================================
   *
   * Read fresh, AFTER getUserScope() has fully
   * committed, and still with NO transaction
   * open — so this query always sees the latest
   * committed rows, guaranteed.
   *
   * We take ALL active scope items. We DO NOT
   * filter daily/weekly/monthly here — their
   * frequency is stored on the inspection item
   * as a snapshot.
   */

  /*
   * ==========================================
   * GET AND FILTER CLIENT SCOPE
   * ==========================================
   */

  const scopeSections = await UserScopeSection.findAll({
    where: {
      user_id,
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
      [{ model: UserScopeItem, as: "items" }, "order", "ASC"],
    ],
  });

  // Collect IDs of scope sections linked to master sections.
  const masterSectionIds = [
    ...new Set(
      scopeSections
        .filter(
          (section) =>
            section.master_section_id !== null &&
            section.master_section_id !== undefined,
        )
        .map((section) => Number(section.master_section_id)),
    ),
  ];

  // Keep only master sections matching the client's type.
  const matchingMasterSections = masterSectionIds.length
    ? await ScopeSection.findAll({
        where: {
          id: {
            [Op.in]: masterSectionIds,
          },
          client_type: clientType,
          is_active: true,
        },
        attributes: ["id"],
      })
    : [];

  const validMasterSectionIds = new Set(
    matchingMasterSections.map((section) => Number(section.id)),
  );

  const filteredScopeSections = scopeSections.filter((section) => {
    // Preserve custom sections that are not linked to a master section.
    if (
      section.master_section_id === null ||
      section.master_section_id === undefined
    ) {
      return true;
    }

    return validMasterSectionIds.has(Number(section.master_section_id));
  });

  /*
   * ==========================================
   * CHECK FILTERED CLIENT SCOPE
   * ==========================================
   */

  if (!filteredScopeSections.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "This client's checklist doesn't map to any active scope sections for their client type. Please review their checklist details.",
    );
  }

  /*
   * ==========================================
   * CREATE INSPECTION ITEM SNAPSHOTS
   * ==========================================
   */

  const inspectionItems = [];
  const inspectionSectionReviews = [];

  for (const section of filteredScopeSections) {
    const sectionItems = section.items || [];

    for (const scopeItem of sectionItems) {
      inspectionItems.push({
        inspection_id: null,

        scope_section_id: section.id,
        scope_item_id: scopeItem.id,

        section_name: section.title,
        item_name: scopeItem.description,

        section_order: Number(section.order || 0),
        item_order: Number(scopeItem.order || 0),

        is_daily: Boolean(scopeItem.is_daily),
        is_weekly: Boolean(scopeItem.is_weekly),
        is_monthly: Boolean(scopeItem.is_monthly),

        employee_completed: false,
        employee_note: null,

        bdm_status: inspectionReviewStatusTypes.PENDING,
        bdm_remark: null,
        bdm_reviewed_at: null,
      });
    }

    // Create one section review record for this section
    if (sectionItems.length > 0) {
      inspectionSectionReviews.push({
        inspection_id: null,

        scope_section_id: section.id,
        section_name: section.title,
        section_order: Number(section.order || 0),

        total_items: sectionItems.length,
        completed_items: 0,

        status: inspectionReviewStatusTypes.PENDING,
        score: null,

        remark: null,
        reviewed_by: null,
        reviewed_at: null,
      });
    }
  }

  if (inspectionItems.length === 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "No active inspection items were found for this client.",
    );
  }

  const clientName = client.user_profile?.name || `Client-${client.id}`;
  const [year, month, day] = inspection_date.split("-");

  const formattedInspectionDate = `${month}-${day}-${year}`;

  const inspectionName = `${clientName} ${formattedInspectionDate} Inspection`;

  /*
   * ==========================================
   * TRANSACTIONAL WRITE
   * ==========================================
   *
   * Transaction opens here, right before the
   * only part that actually needs atomicity:
   * creating the inspection + its item
   * snapshots together.
   */

  const transaction = await sequelize.transaction();

  try {
    const inspection = await Inspection.create(
      {
        user_id,
        bdm_id: bdm.id,
        employee_id,

        name: inspectionName,
        inspection_date,

        status: inspectionStatusTypes.ASSIGNED,
        score: null,
        overall_remark: null,

        started_at: null,
        employee_submitted_at: null,
        bdm_completed_at: null,

        client_email_sent: false,
        client_email_sent_at: null,
      },
      { transaction },
    );

    for (const item of inspectionItems) {
      item.inspection_id = inspection.id;
    }

    await InspectionItem.bulkCreate(inspectionItems, { transaction });

    for (const sectionReview of inspectionSectionReviews) {
      sectionReview.inspection_id = inspection.id;
    }

    await InspectionSectionReview.bulkCreate(inspectionSectionReviews, {
      transaction,
    });

    const createdInspection = await Inspection.findOne({
      where: { id: inspection.id },

      include: [
        {
          model: InspectionItem,
          as: "items",
          required: false,

          include: [
            {
              model: InspectionItemImage,
              as: "images",
              required: false,
            },
          ],
        },
      ],

      transaction,
    });

    if (!createdInspection) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Inspection was created but could not be retrieved.",
      );
    }

    await transaction.commit();

    return {
      success: true,
      data: createdInspection,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw ApiError.orInternal(error);
  }
};

const getMyInspectionsByBDM = async (body) => {
  try {
    const { user, user_id } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated BDM not found.",
      );
    }

    if (!user_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Client is required.");
    }

    const clientId = Number(user_id);

    if (!Number.isInteger(clientId) || clientId <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid client ID.");
    }

    const bdm = await Admin.findOne({
      where: { id: user.id, is_active: true },
    });

    if (!bdm) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "BDM not found or inactive.");
    }

    const client = await User.findOne({
      where: { id: clientId },
      include: [{ model: Profile, as: "user_profile", required: false }],
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
    }

    /*
     * ==========================================
     * GET INSPECTIONS
     * ==========================================
     *
     * IMPORTANT:
     *
     * Scoped to the CLIENT only, not the
     * logged-in BDM. Any authenticated BDM
     * viewing this client's page should see the
     * client's full inspection history —
     * otherwise inspections silently disappear
     * for anyone who didn't personally create
     * them, which looks like a bug to whoever's
     * looking at it.
     *
     * `bdm.id` is still validated above (proves
     * the requester is a real active admin) —
     * it's just no longer used as a WHERE filter.
     */
    const inspections = await Inspection.findAll({
      where: {
        user_id: clientId,
      },

      order: [
        ["inspection_date", "DESC"],
        ["created_at", "DESC"],
      ],

      include: [
        {
          model: User,
          as: "client",
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
      ],
    });

    const formattedInspections = inspections.map((inspection) => {
      const data = inspection.toJSON();
      return {
        ...data,
        client: data.client
          ? {
              id: data.client.id,
              email: data.client.email,
              name: data.client.user_profile?.name || null,
            }
          : null,
        employee: data.employee
          ? {
              id: data.employee.id,
              email: data.employee.email,
              name: data.employee.user_profile?.name || null,
            }
          : null,
      };
    });

    return {
      success: true,
      data: formattedInspections,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const deleteInspection = async (body) => {
  const transaction = await sequelize.transaction();

  try {
    const { user, inspectionId } = body;

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

    if (!inspectionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
    }

    const inspectionIdNumber = Number(inspectionId);

    if (!Number.isInteger(inspectionIdNumber) || inspectionIdNumber <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid inspection ID.");
    }

    /*
     * ==========================================
     * VERIFY BDM
     * ==========================================
     */

    const bdm = await Admin.findOne({
      where: {
        id: user.id,
        is_active: true,
      },

      transaction,
    });

    if (!bdm) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "BDM not found or inactive.");
    }

    /*
     * ==========================================
     * FIND INSPECTION
     *
     * IMPORTANT:
     * paranoid:false allows us to find even if
     * something was previously soft deleted.
     * ==========================================
     */

    const inspection = await Inspection.findOne({
      where: {
        id: inspectionIdNumber,
        bdm_id: bdm.id,
      },

      paranoid: false,

      transaction,
    });

    if (!inspection) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Inspection not found or you are not authorized to delete it.",
      );
    }

    /*
     * ==========================================
     * GET INSPECTION ITEMS
     * ==========================================
     */

    const inspectionItems = await InspectionItem.findAll({
      where: {
        inspection_id: inspection.id,
      },

      paranoid: false,

      attributes: ["id"],

      transaction,
    });

    const inspectionItemIds = inspectionItems.map((item) => item.id);

    /*
     * ==========================================
     * GET INSPECTION ITEM IMAGES
     * ==========================================
     */

    let images = [];

    if (inspectionItemIds.length > 0) {
      images = await InspectionItemImage.findAll({
        where: {
          inspection_item_id: {
            [Op.in]: inspectionItemIds,
          },
        },

        paranoid: false,

        transaction,
      });
    }

    /*
     * ==========================================
     * DELETE PHYSICAL IMAGE FILES
     * ==========================================
     */

    for (const image of images) {
      try {
        deleteInspectionImageFile(image.image);
      } catch (fileError) {
        /*
         * Do not stop DB deletion if the physical
         * file is already missing.
         */

        logger.error("Failed to delete inspection image:", fileError.message);
      }
    }

    /*
     * ==========================================
     * HARD DELETE IMAGES
     * ==========================================
     */

    if (inspectionItemIds.length > 0) {
      await InspectionItemImage.destroy({
        where: {
          inspection_item_id: {
            [Op.in]: inspectionItemIds,
          },
        },

        force: true,

        transaction,
      });
    }

    /*
     * ==========================================
     * HARD DELETE INSPECTION ITEMS
     * ==========================================
     */

    await InspectionItem.destroy({
      where: {
        inspection_id: inspection.id,
      },

      force: true,

      transaction,
    });

    /*
     * ==========================================
     * HARD DELETE INSPECTION
     * ==========================================
     */

    await inspection.destroy({
      force: true,
      transaction,
    });

    /*
     * ==========================================
     * COMMIT
     * ==========================================
     */

    await transaction.commit();

    return {
      success: true,
      data: {
        id: inspection.id,
      },
    };
  } catch (error) {
    /*
     * ==========================================
     * ROLLBACK
     * ==========================================
     */

    if (!transaction.finished) {
      await transaction.rollback();
    }

    throw ApiError.orInternal(error);
  }
};

const getMyAssignedInspections = async (body) => {
  try {
    const { user } = body;

    if (!user?.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Authenticated employee not found.",
      );
    }

    /*
     * ==========================================
     * VERIFY EMPLOYEE
     * ==========================================
     */

    const employee = await User.findOne({
      where: {
        id: user.id,
      },
    });

    if (!employee) {
      throw new ApiError(httpStatus.UNAUTHORIZED, "Employee not found.");
    }

    /*
     * ==========================================
     * GET ASSIGNED INSPECTIONS
     * ==========================================
     */

    const inspections = await Inspection.findAll({
      where: {
        employee_id: employee.id,
      },

      order: [
        ["inspection_date", "DESC"],
        ["created_at", "DESC"],
      ],
    });

    return {
      success: true,
      data: inspections,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getInspectionById = async (inspectionId) => {
  try {
    if (!inspectionId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Inspection ID is required.");
    }

    const inspection = await Inspection.findOne({
      where: { id: inspectionId },

      include: [
        {
          model: InspectionItem,
          as: "items",
          required: false,

          include: [
            {
              model: InspectionItemImage,
              as: "images",
              required: false,
            },
          ],
        },

        {
          model: InspectionSectionReview,
          as: "section_reviews",
          required: false,
        },
      ],

      order: [
        [{ model: InspectionItem, as: "items" }, "section_order", "ASC"],
        [{ model: InspectionItem, as: "items" }, "item_order", "ASC"],
        [
          { model: InspectionItem, as: "items" },
          { model: InspectionItemImage, as: "images" },
          "created_at",
          "ASC",
        ],
        [
          { model: InspectionSectionReview, as: "section_reviews" },
          "section_order",
          "ASC",
        ],
      ],
    });

    if (!inspection) {
      throw new ApiError(httpStatus.NOT_FOUND, "Inspection not found.");
    }

    const data = inspection.toJSON();

    const items = data.items || [];
    const sectionReviews = data.section_reviews || [];

    const totalItems = items.length;

    const completedItems = items.filter((item) =>
      Boolean(item.employee_completed),
    ).length;

    const approvedItems = items.filter(
      (item) => item.bdm_status === inspectionReviewStatusTypes.APPROVED,
    ).length;

    const issueItems = items.filter(
      (item) => item.bdm_status === inspectionReviewStatusTypes.ISSUE,
    ).length;

    /*
     * ==========================================
     * SECTION REVIEW DATA
     * ==========================================
     */

    data.section_reviews = sectionReviews.map((section) => ({
      ...section,

      score: Number(section.score || 0),

      score_out_of: Number(section.total_items || 0),
    }));

    /*
     * ==========================================
     * OVERALL INSPECTION SUMMARY
     * ==========================================
     */

    data.summary = {
      total_items: totalItems,

      completed_items: completedItems,

      pending_items: totalItems - completedItems,

      approved_items: approvedItems,

      issue_items: issueItems,

      completion_percentage:
        totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
    };

    return {
      success: true,
      data,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const getInspectionsByEmployeeId = async (employeeId) => {
  try {
    if (!employeeId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Employee ID is required.");
    }

    /*
     * ==========================================
     * VERIFY EMPLOYEE
     * ==========================================
     */

    const employee = await User.findOne({
      where: {
        id: employeeId,
      },
    });

    if (!employee) {
      throw new ApiError(httpStatus.NOT_FOUND, "Employee not found.");
    }

    /*
     * ==========================================
     * GET EMPLOYEE INSPECTIONS
     * ==========================================
     */

    const inspections = await Inspection.findAll({
      where: {
        employee_id: employeeId,
      },

      order: [
        ["inspection_date", "DESC"],
        ["created_at", "DESC"],
      ],
    });

    return {
      success: true,
      data: inspections,
    };
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  createInspection,
  getMyInspectionsByBDM,
  deleteInspection,
  getMyAssignedInspections,
  getInspectionById,
  getInspectionsByEmployeeId,
};
