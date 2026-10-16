const fs = require("fs");
const { UPLOAD_DIRS } = require("../../config/storage");
const path = require("path");
const { status: httpStatus } = require("http-status");
const { inspectionReviewStatusTypes, inspectionStatusTypes } = require("../../config/types");
const ApiError = require("../../utils/ApiError");
const { DATE_FORMAT, isValidDate } = require("../../utils/time");
const { Op } = require("sequelize");
const sequelize = require("../../config/central.db");
const {
  User,
  Admin,
  Inspection,
  UserScopeItem,
  UserScopeSection,
  InspectionItem,
  InspectionItemImage,
  Profile,
  UserAddress,
  Country,
  State,
  City,
  InspectionSectionReview,
  ScopeSection,
} = require("../../models");
const { getUserScope } = require("../Admin/serviceEstimate.service");
const { sendInspectionCompletedEmail } = require("./email.service");

const INSPECTION_IMAGES_DIR = UPLOAD_DIRS.images;

// Inspection images are stored as "/<filename>" in InspectionItemImage.image
const deleteInspectionImageFile = (storedImage) => {
  if (!storedImage) return;
  const absolutePath = path.join(INSPECTION_IMAGES_DIR, path.basename(storedImage));
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

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

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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

        console.error("Failed to delete inspection image:", fileError.message);
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

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

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
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
      console.error("Failed to delete image file:", fileError.message);
    }

    await image.destroy();

    return {
      success: true,
      data: { id: image.id },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

module.exports = {
  createInspection,
  getMyInspectionsByBDM,
  deleteInspection,
  reopenInspection,

  getMyAssignedInspections,
  getInspectionById,
  updateInspectionItem,
  submitInspection,
  uploadInspectionItemImage,
  reviewInspectionItem,
  reviewInspectionSection,
  uploadBDMInspectionItemImage,
  completeInspection,
  sendInspectionToClient,
  deleteInspectionItemImage,
  getInspectionsByEmployeeId,
};
