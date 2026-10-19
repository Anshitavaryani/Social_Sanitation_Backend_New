// Admin user service: creating, editing and deleting users and employees, roles, credentials, addresses and client checklists

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { COMPANY } = require("../../../config/company");
const { bookingTypes, userStatusTypes } = require("../../../config/types");
const { Op } = require("sequelize");
const {
  Admin,
  User,
  Profile,
  UserAttachment,
  Booking,
  BookingAssignment,
  UserAddress,
  ClientChecklistDetail,
  ClientChecklist,
  Attendance,
  Break,
  UserToken,
  UserOAuth,
  FormSubmission,
  FormSection,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { hashPassword } = require("../../../utils/password");
const { ROLE, EMPLOYEE_ROLE_IDS, BOOKING_ROLE_IDS } = require("../../../config/roles");
const { generateTemporaryPassword } = require("../../../utils/temporaryPassword");
const { sendUserCredentials, sendUpdatedUserCredentials } = require("../../Common/email.service");
const sequelize = require("../../../config/central.db");

const deleteUser = async (body) => {
  const t = await sequelize.transaction();

  try {
    if (!Array.isArray(body.user_id) || body.user_id.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid user_id");
    }

    const userIds = body.user_id
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));

    if (!userIds.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, "No valid user IDs provided");
    }

    // 🔍 fetch users
    const users = await User.findAll({
      where: { id: userIds },
      transaction: t,
    });

    if (!users.length) {
      throw new ApiError(httpStatus.NOT_FOUND, "No users found");
    }

    for (const user of users) {
      // 1️⃣ bookings owned by user
      const bookings = await Booking.findAll({
        where: { user_id: user.id },
        attributes: ["id"],
        transaction: t,
      });

      const bookingIds = bookings.map((b) => b.id);

      // 2️⃣ delete booking assignments
      await BookingAssignment.destroy({
        where: {
          [Op.or]: [
            bookingIds.length ? { booking_id: bookingIds } : null,
            { employee_id: user.id },
          ].filter(Boolean),
        },
        transaction: t,
      });

      // 3️⃣ delete bookings
      if (bookingIds.length) {
        await Booking.destroy({
          where: { id: bookingIds },
          transaction: t,
        });
      }

      // 4️⃣ delete user
      await user.destroy({ transaction: t });
    }

    await t.commit();

    return {
      success: true,
      message: "Users and related bookings deleted successfully",
    };
  } catch (error) {
    await t.rollback();
    throw ApiError.from(error);
  }
};

const addNewUserAddress = async (reqBody) => {
  try {
    const { user_id } = reqBody;

    const user = await User.findByPk(user_id);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Create user address object
    const userAddressObj = {
      address: reqBody.address,
      country_id: reqBody.country_id,
      state_id: reqBody.state_id,
      city_id: reqBody.city_id,
      address_lat: reqBody.address_lat,
      address_long: reqBody.address_long,
      user_id: user_id,
      role_id: user.role_id,
    };

    const userAddressDoc = await UserAddress.create(userAddressObj);

    if (!userAddressDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create address.",
      );
    }

    return userAddressDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteUserAddress = async (addressId) => {
  const transaction = await sequelize.transaction();

  try {
    const address = await UserAddress.findByPk(addressId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!address) {
      throw new ApiError(httpStatus.NOT_FOUND, "Address not found.");
    }

    const userId = address.user_id;

    await address.destroy({ transaction });

    // =========================================================
    // IF THIS WAS THE EMPLOYEE'S LAST ADDRESS, CLEAR THE
    // HIRING FORM ASSIGNMENT TOO
    //
    // Otherwise the user record keeps pointing at a hiring form
    // with no address behind it — the edit page pre-selects a
    // form that has nothing backing it, and re-selecting the
    // same form again is (correctly) treated as "unchanged" and
    // skips creating a new address.
    // =========================================================

    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      user &&
      EMPLOYEE_ROLE_IDS.includes(Number(user.role_id)) &&
      user.hiring_form_submission_id
    ) {
      const remainingAddressCount = await UserAddress.count({
        where: {
          user_id: userId,
        },
        transaction,
      });

      if (remainingAddressCount === 0) {
        logger.info(
          `Employee ${userId} has no addresses left — clearing hiring_form_submission_id.`,
        );

        await user.update(
          {
            hiring_form_submission_id: null,
          },
          { transaction },
        );
      }
    }

    await transaction.commit();

    return {
      id: addressId,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error("Transaction rollback error:", rollbackError);
    }

    throw ApiError.from(error);
  }
};

const updateEmployeeType = async (body) => {
  try {
    const { user_id, employee_type } = body;

    const user = await User.findOne({
      where: { id: user_id, is_active: true },
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Employee not found");
    }

    if (!["W2_BI_WEEKLY", "1099"].includes(employee_type)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid employee type");
    }

    user.employee_type = employee_type;

    await user.save();

    return user;
  } catch (error) {
    throw ApiError.orInternal(error);
  }
};

const changeAssignedAdmin = async (reqBody) => {
  try {
    const { user_id, assigned_to } = reqBody;

    /* ---------- VALIDATIONS ---------- */

    if (!user_id || !assigned_to) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "user_id and assigned_to are required",
      );
    }

    /* ---------- CHECK USER ---------- */

    const user = await User.findByPk(user_id);

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Only allow for clients
    if (Number(user.role_id) !== ROLE.CLIENT) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Only clients can be reassigned",
      );
    }

    /* ---------- CHECK ADMIN ---------- */

    const admin = await Admin.findByPk(assigned_to);

    if (!admin) {
      throw new ApiError(httpStatus.NOT_FOUND, "Admin not found");
    }

    /* ---------- UPDATE ---------- */

    await user.update({
      assigned_to,
    });

    return {
      success: true,
      message: "Assigned admin updated successfully",
      data: {
        user_id: user.id,
        assigned_to,
      },
    };
  } catch (error) {
    logger.error("Error in changeAssignedAdmin:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
};

const resetUserCredentials = async (reqBody) => {
  try {
    const { user_id, new_email } = reqBody;

    // 🔎 Find the user
    const user = await User.findByPk(user_id, {
      include: [{ model: Profile, as: "user_profile" }],
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // 🆕 If new_email provided and different from existing, update it
    let finalEmail = user.email;
    if (new_email && new_email !== user.email) {
      // Check if someone else already using new_email
      const emailExists = await User.findOne({ where: { email: new_email } });
      if (emailExists) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Email already in use");
      }

      await user.update({ email: new_email });
      if (user.user_profile) {
        await user.user_profile.update({ email: new_email });
      }
      finalEmail = new_email;
    }

    // 🔑 Generate new password
    const newPassword = generateTemporaryPassword();
    const hashedPassword = hashPassword(newPassword);

    // ✅ Save new password
    await user.update({ password: hashedPassword });

    // 📩 Send email with new password
    const isSend = await sendUpdatedUserCredentials(finalEmail, newPassword);
    if (!isSend) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Unable to send new credentials",
      );
    }

    return {
      success: true,
      message: `New credentials sent to ${finalEmail}`,
    };
  } catch (error) {
    logger.error("Error in resetUserCredentials:", error);
    throw ApiError.orInternal(error);
  }
};

const getDefaultChecklistDetails = (clientType) => {
  if (clientType === "residential") {
    return [
      "Entrance / Lobby Areas",
      "Bathrooms",
      "Kitchen",
      "Bedrooms",
      "Dining Room",
      "Living Room",
      "Foyer",
    ];
  }

  return [
    "Entrance / Lobby Areas",
    "Restrooms",
    "Kitchen Areas",
    "Office Areas",
    "Classrooms / Conference Rooms",
    "Group / Common Rooms",
    "All Areas / Hallways",
  ];
};

// Creates or updates a client's checklist and replaces its detail rows.
// Shared by adminAddUser and adminEditUser.
const saveClientChecklist = async ({ userId, checklist, client_type, transaction }) => {
  const {
    walkaround_minutes,
    estimated_sqft,
    service_days,

    carpet_percentage = 0,
    concrete_percentage = 0,
    vct_lvt_percentage = 0,
    tile_percentage = 0,

    address,
    country_id: checklistCountryId,
    state_id,
    city_id,
    address_lat,
    address_long,

    details = [],
  } = checklist;

  // =======================================================
  // FIND OR CREATE CHECKLIST
  // =======================================================

  let checklistEntry = await ClientChecklist.findOne({
    where: {
      user_id: userId,
    },
    transaction,
  });

  if (checklistEntry) {
    await checklistEntry.update(
      {
        estimated_sqft,
        walkaround_minutes,
        service_days,

        carpet_percentage,
        concrete_percentage,
        vct_lvt_percentage,
        tile_percentage,

        address,
        // Was never read off `checklist` here at all, so a client's
        // country could never actually be saved on this path.
        country_id: checklistCountryId,
        state_id,
        city_id,
        address_lat,
        address_long,
      },
      {
        transaction,
      },
    );
  } else {
    checklistEntry = await ClientChecklist.create(
      {
        user_id: userId,

        estimated_sqft,
        walkaround_minutes,
        service_days,

        carpet_percentage,
        concrete_percentage,
        vct_lvt_percentage,
        tile_percentage,

        address,
        country_id: checklistCountryId,
        state_id,
        city_id,
        address_lat,
        address_long,
      },
      {
        transaction,
      },
    );
  }

  // =======================================================
  // CHECKLIST DETAILS
  // =======================================================

  let checklistDetails = Array.isArray(details) ? details : [];

  if (checklistDetails.length === 0) {
    const effectiveClientType =
      client_type && client_type.trim() !== ""
        ? client_type.toLowerCase()
        : "commercial";

    const defaultAreas = getDefaultChecklistDetails(effectiveClientType);

    checklistDetails = defaultAreas.map((service_area) => ({
      service_area,

      num_desks_trash_cans: 0,

      stalls: 0,

      sinks: 0,

      restrooms: 0,

      flooring_type: null,

      special_requests: "",
    }));
  }

  // =======================================================
  // DELETE OLD DETAILS
  // =======================================================

  await ClientChecklistDetail.destroy({
    where: {
      checklist_id: checklistEntry.id,
    },
    transaction,
  });

  // =======================================================
  // CREATE NEW DETAILS
  // =======================================================

  await Promise.all(
    checklistDetails.map((detail) =>
      ClientChecklistDetail.create(
        {
          checklist_id: checklistEntry.id,

          service_area: detail.service_area,

          flooring_type: detail.flooring_type || null,

          special_requests: detail.special_requests || "",

          num_desks_trash_cans: Number(detail.num_desks_trash_cans || 0),

          stalls: Number(detail.stalls || 0),

          sinks: Number(detail.sinks || 0),

          restrooms: Number(detail.restrooms || 0),
        },
        {
          transaction,
        },
      ),
    ),
  );

  return checklistEntry;
};

const adminAddUser = async (reqBody) => {
  try {
    const {
      name,
      email,
      client_type,
      role_id,
      sub_role_id,
      checklist,
      employee_type,
      assigned_to,

      // NEW
      hiring_form_submission_id,
      address_lat,
      address_long,
      country_id,
      city_id,
      state_id,
    } = reqBody;

    const isEmployee = EMPLOYEE_ROLE_IDS.includes(Number(role_id));
    const isClient = Number(role_id) === ROLE.CLIENT;

    // ============================
    // Employee validation
    // ============================

    if (isEmployee && !employee_type) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Employee type is required for employees",
      );
    }

    if (isEmployee && !["W2_BI_WEEKLY", "1099"].includes(employee_type)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid employee type");
    }

    // ============================
    // Existing email validation
    // ============================

    const existingUser = await User.findOne({
      where: {
        email: email.trim().toLowerCase(),
      },
    });

    if (existingUser) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email already exists");
    }

    // ============================
    // Hiring form validation
    // ============================

    let hiringForm = null;

    if (isEmployee) {
      if (!hiring_form_submission_id) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Hiring form submission is required for employees",
        );
      }

      hiringForm = await FormSubmission.findOne({
        where: {
          id: hiring_form_submission_id,
          is_active: true,
        },
        include: [
          {
            model: FormSection,
            as: "details_form_submission",
            where: {
              section_name: "personalInfo",
            },
            required: false,
          },
        ],
      });

      if (!hiringForm) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Selected hiring form not found",
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (
        !hiringForm.applicant_email ||
        hiringForm.applicant_email.trim().toLowerCase() !== normalizedEmail
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Selected hiring form does not belong to this email",
        );
      }

      const alreadyAssigned = await User.findOne({
        where: {
          hiring_form_submission_id,
        },
      });

      if (alreadyAssigned) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "This hiring form has already been assigned to an employee",
        );
      }

      if (
        !address_lat ||
        !address_long ||
        !city_id ||
        !state_id ||
        !country_id
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Address,country, city, state, latitude and longitude are required for employee address",
        );
      }
    }

    // ============================
    // Create user
    // ============================

    const password = generateTemporaryPassword();
    const finalClientType = client_type || "commercial";

    const user = await User.create({
      email: email.trim().toLowerCase(),
      password: hashPassword(password),
      role_id,
      sub_role_id,
      status: userStatusTypes.ACCEPTED,
      client_type: finalClientType,
      employee_type: isEmployee ? employee_type : null,
      assigned_to: Number(role_id) === ROLE.CLIENT ? assigned_to : null,

      hiring_form_submission_id: isEmployee ? hiring_form_submission_id : null,
    });

    // ============================
    // Create profile
    // ============================

    const userProfile = await Profile.create({
      email: email.trim().toLowerCase(),
      name,
      user_id: user.id,
    });

    if (!userProfile) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create profile",
      );
    }

    // ============================
    // Employee address
    // ============================

    if (isEmployee && hiringForm) {
      const personalInfoSection = hiringForm.details_form_submission?.find(
        (section) => section.section_name === "personalInfo",
      );

      let personalInfo = {};

      if (personalInfoSection?.data) {
        personalInfo =
          typeof personalInfoSection.data === "string"
            ? JSON.parse(personalInfoSection.data)
            : personalInfoSection.data;
      }

      const streetAddress = personalInfo.streetAddress || "";
      const aptSuite = personalInfo.aptSuite || "";

      const fullAddress = [streetAddress, aptSuite].filter(Boolean).join(", ");

      await UserAddress.create({
        user_id: user.id,
        address: fullAddress,
        state_id,
        country_id,
        city_id,
        address_lat,
        address_long,
        role_id: user.role_id,
        google_map_link: null,
      });
    }

    // ============================
    // Client address
    // ============================

    if (isClient && checklist) {
      const {
        address: clientAddress,
        country_id: clientCountryId,
        state_id: clientStateId,
        city_id: clientCityId,
        address_lat: clientAddressLat,
        address_long: clientAddressLong,
      } = checklist;

      // Create address when address details are provided
      if (clientAddress && clientCountryId && clientStateId && clientCityId) {
        await UserAddress.create({
          user_id: user.id,
          address: clientAddress,
          country_id: clientCountryId,
          state_id: clientStateId,
          city_id: clientCityId,
          address_lat: clientAddressLat || null,
          address_long: clientAddressLong || null,
          role_id: user.role_id,
          google_map_link: null,
        });
      }
    }

    // ============================
    // Client checklist
    // ============================

    if (checklist && !isEmployee) {
      await saveClientChecklist({
        userId: user.id,
        checklist,
        client_type: finalClientType,
      });
    }

    // ============================
    // Existing email logic
    // ============================

    let supportEmail = COMPANY.EMAIL;

    if (Number(role_id) === ROLE.CLIENT) {
      supportEmail = COMPANY.CLIENT_SUPPORT_EMAIL;
    } else if (EMPLOYEE_ROLE_IDS.includes(Number(role_id))) {
      supportEmail = COMPANY.EMPLOYEE_SUPPORT_EMAIL;
    }

    const isSend = await sendUserCredentials(
      email.trim().toLowerCase(),
      password,
      supportEmail,
    );

    if (!isSend) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Unable to send credentials",
      );
    }

    return user;
  } catch (error) {
    logger.error("Error in adminAddUser:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

// Moves an employee's existing data from currentRoleId to newRoleId.
// Must run inside the same transaction that updates users.role_id, so a
// role change from any API (adminEditUser, changeEmployeeRole) stays in sync.
const syncEmployeeRoleData = async (
  userId,
  currentRoleId,
  newRoleId,
  transaction,
) => {
  // Keep role_id in sync on every table that looks rows up by
  // (user_id + role_id). Without this, attendance history, active
  // clock-ins, FCM tokens, calendar OAuth, etc. are "lost" after promotion.
  const roleSyncModels = [
    UserAddress,
    UserAttachment,
    UserToken,
    UserOAuth,
    Attendance,
    Break,
  ];

  for (const Model of roleSyncModels) {
    await Model.update(
      { role_id: newRoleId },
      {
        where: { user_id: userId },
        transaction,
      },
    );
  }

  // Booking assignments store the slot role (7 supervisor, 8 QA, 9 cleaner).
  // Completed/cancelled bookings keep the role the employee actually worked
  // in; only open bookings move to the new role.
  if (
    !BOOKING_ROLE_IDS.includes(currentRoleId) ||
    !BOOKING_ROLE_IDS.includes(newRoleId)
  ) {
    return;
  }

  const openAssignments = await BookingAssignment.findAll({
    where: {
      employee_id: userId,
      role_id: currentRoleId,
    },
    include: [
      {
        model: Booking,
        as: "employee_details_booking",
        attributes: [],
        where: {
          booking_status: {
            [Op.in]: [bookingTypes.PENDING, bookingTypes.ACCEPTED, bookingTypes.ONGOING],
          },
        },
      },
    ],
    attributes: ["id", "booking_id"],
    transaction,
  });

  if (openAssignments.length === 0) {
    return;
  }

  const bookingIds = openAssignments.map((a) => a.booking_id);

  // If the employee is already assigned to a booking in the new role,
  // drop the old-role row instead of creating a duplicate.
  const alreadyInNewRole = await BookingAssignment.findAll({
    where: {
      employee_id: userId,
      role_id: newRoleId,
      booking_id: { [Op.in]: bookingIds },
    },
    attributes: ["booking_id"],
    raw: true,
    transaction,
  });
  const duplicateBookingIds = new Set(
    alreadyInNewRole.map((a) => a.booking_id),
  );

  const toDelete = openAssignments
    .filter((a) => duplicateBookingIds.has(a.booking_id))
    .map((a) => a.id);
  const toUpdate = openAssignments
    .filter((a) => !duplicateBookingIds.has(a.booking_id))
    .map((a) => a.id);

  if (toDelete.length > 0) {
    await BookingAssignment.destroy({
      where: { id: { [Op.in]: toDelete } },
      transaction,
    });
  }

  if (toUpdate.length > 0) {
    await BookingAssignment.update(
      { role_id: newRoleId },
      {
        where: { id: { [Op.in]: toUpdate } },
        transaction,
      },
    );
  }
};

const adminEditUser = async (reqBody, id) => {
  const transaction = await sequelize.transaction();

  try {
    const {
      name,
      email,
      cc_email,
      checklist,
      client_type,
      employee_type,
      role_id,

      hiring_form_submission_id,
      address_lat,
      address_long,
      city_id,
      state_id,
      country_id,
    } = reqBody;

    // =========================================================
    // FIND USER
    // =========================================================

    const user = await User.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const roleId = Number(user.role_id);
    const isEmployee = EMPLOYEE_ROLE_IDS.includes(roleId);

    // =========================================================
    // CAPTURE THE HIRING FORM THAT WAS ON FILE *BEFORE* THIS
    // UPDATE TOUCHES ANYTHING — used later to decide whether the
    // employee address needs to be recreated or left alone.
    // =========================================================

    const previousHiringFormSubmissionId = user.hiring_form_submission_id;

    // =========================================================
    // NORMALIZE EMAIL
    // =========================================================

    const normalizedEmail =
      email !== undefined && email !== null && String(email).trim() !== ""
        ? String(email).trim().toLowerCase()
        : user.email?.trim().toLowerCase();

    // =========================================================
    // CHECK EMAIL DUPLICATE
    // =========================================================

    if (
      normalizedEmail &&
      normalizedEmail !== user.email?.trim().toLowerCase()
    ) {
      const existingEmailUser = await User.findOne({
        where: {
          email: normalizedEmail,
          id: {
            [Op.ne]: id,
          },
        },
        transaction,
      });

      if (existingEmailUser) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Email already exists");
      }
    }

    // =========================================================
    // UPDATE USER PAYLOAD
    // =========================================================

    const updateUserPayload = {};

    // ---------------------------------------------------------
    // EMAIL
    // ---------------------------------------------------------

    if (normalizedEmail) {
      updateUserPayload.email = normalizedEmail;
    }

    // ---------------------------------------------------------
    // CC EMAIL
    // ---------------------------------------------------------

    if (cc_email !== undefined) {
      const normalizedCcEmail =
        cc_email !== null && String(cc_email).trim() !== ""
          ? String(cc_email).trim().toLowerCase()
          : null;

      updateUserPayload.cc_email = normalizedCcEmail;
    }

    // ---------------------------------------------------------
    // CLIENT TYPE
    // ---------------------------------------------------------

    if (client_type) {
      updateUserPayload.client_type = client_type;
    }

    // ---------------------------------------------------------
    // EMPLOYEE TYPE
    // ---------------------------------------------------------

    if (employee_type !== undefined) {
      if (!["W2_BI_WEEKLY", "1099"].includes(employee_type)) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid employee type");
      }

      updateUserPayload.employee_type = employee_type;
    }

    // ---------------------------------------------------------
    // ROLE (employees only, synced below via syncEmployeeRoleData)
    // ---------------------------------------------------------

    let newRoleId = null;

    if (
      role_id !== undefined &&
      role_id !== null &&
      role_id !== "" &&
      Number(role_id) !== roleId
    ) {
      newRoleId = Number(role_id);

      if (!isEmployee || !EMPLOYEE_ROLE_IDS.includes(newRoleId)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Role can only be changed between employee roles",
        );
      }

      updateUserPayload.role_id = newRoleId;
    }

    // =========================================================
    // EMPLOYEE HIRING FORM
    // =========================================================

    let hiringForm = null;

    if (isEmployee) {
      // =======================================================
      // HIRING FORM IS REQUIRED FOR EMPLOYEE UPDATE
      // =======================================================

      if (
        hiring_form_submission_id === undefined ||
        hiring_form_submission_id === null ||
        hiring_form_submission_id === ""
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Hiring form submission is required for employees",
        );
      }

      const hiringFormId = Number(hiring_form_submission_id);

      if (!Number.isInteger(hiringFormId) || hiringFormId <= 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Invalid hiring form submission ID",
        );
      }

      // =======================================================
      // FIND SELECTED HIRING FORM
      // =======================================================

      hiringForm = await FormSubmission.findOne({
        where: {
          id: hiringFormId,
          is_active: true,
        },
        include: [
          {
            model: FormSection,
            as: "details_form_submission",
            where: {
              section_name: "personalInfo",
            },
            required: false,
          },
        ],
        transaction,
      });

      if (!hiringForm) {
        throw new ApiError(
          httpStatus.NOT_FOUND,
          "Selected hiring form not found",
        );
      }

      // =======================================================
      // VALIDATE HIRING FORM EMAIL
      // =======================================================

      const hiringFormEmail = String(hiringForm.applicant_email || "")
        .trim()
        .toLowerCase();

      if (!hiringFormEmail || hiringFormEmail !== normalizedEmail) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Selected hiring form does not belong to this employee email",
        );
      }

      // =======================================================
      // CHECK IF FORM IS ALREADY ASSIGNED
      // =======================================================

      const alreadyAssigned = await User.findOne({
        where: {
          hiring_form_submission_id: hiringFormId,
          id: {
            [Op.ne]: id,
          },
        },
        transaction,
      });

      if (alreadyAssigned) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "This hiring form has already been assigned to another employee",
        );
      }

      // =======================================================
      // VALIDATE LOCATION
      // =======================================================

      const latitude = Number(address_lat);

      const longitude = Number(address_long);

      const stateId = Number(state_id);

      const cityId = Number(city_id);

      const countryId = Number(country_id);

      if (
        address_lat === undefined ||
        address_lat === null ||
        address_lat === "" ||
        !Number.isFinite(latitude)
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid address latitude is required",
        );
      }

      if (
        address_long === undefined ||
        address_long === null ||
        address_long === "" ||
        !Number.isFinite(longitude)
      ) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid address longitude is required",
        );
      }

      if (!Number.isInteger(countryId) || countryId <= 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid country ID is required",
        );
      }

      if (!Number.isInteger(stateId) || stateId <= 0) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          "Valid state ID is required",
        );
      }

      if (!Number.isInteger(cityId) || cityId <= 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Valid city ID is required");
      }

      // =======================================================
      // SAVE HIRING FORM ID TO USER
      // =======================================================

      updateUserPayload.hiring_form_submission_id = hiringFormId;
    }

    // =========================================================
    // UPDATE USER
    // =========================================================

    if (Object.keys(updateUserPayload).length > 0) {
      await user.update(updateUserPayload, {
        transaction,
      });
    }

    if (newRoleId !== null) {
      await syncEmployeeRoleData(Number(id), roleId, newRoleId, transaction);
    }

    // =========================================================
    // UPDATE PROFILE
    // =========================================================

    const profile = await Profile.findOne({
      where: {
        user_id: id,
      },
      transaction,
    });

    if (profile) {
      const profilePayload = {};

      if (name !== undefined) {
        profilePayload.name = name;
      }

      if (normalizedEmail) {
        profilePayload.email = normalizedEmail;
      }

      if (Object.keys(profilePayload).length > 0) {
        await profile.update(profilePayload, {
          transaction,
        });
      }
    }

    // =========================================================
    // EMPLOYEE ADDRESS FROM HIRING FORM
    // =========================================================

    let userAddress = null;

    if (isEmployee && hiringForm) {
      const incomingHiringFormId = Number(hiring_form_submission_id);

      // =======================================================
      // SAME HIRING FORM AS BEFORE?
      //
      // If the employee already had this exact hiring form
      // assigned (previousHiringFormSubmissionId, captured
      // BEFORE this request's user.update() ran), re-saving with
      // the same form should not create a duplicate address row.
      // Only a genuinely different hiring form — or the very
      // first assignment — creates a new address.
      // =======================================================

      const isSameHiringFormAsBefore =
        previousHiringFormSubmissionId !== null &&
        previousHiringFormSubmissionId !== undefined &&
        Number(previousHiringFormSubmissionId) === incomingHiringFormId;

      if (isSameHiringFormAsBefore) {

        // =====================================================
        // RETURN THE EXISTING ADDRESS UNCHANGED
        // =====================================================

        userAddress = await UserAddress.findOne({
          where: {
            user_id: Number(id),
          },
          order: [["id", "DESC"]],
          transaction,
        });
      } else {
        // =======================================================
        // GET PERSONAL INFO SECTION
        // =======================================================

        const personalInfoSection = hiringForm.details_form_submission?.find(
          (section) => section.section_name === "personalInfo",
        );

        if (!personalInfoSection) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Personal information not found in selected hiring form",
          );
        }

        // =======================================================
        // PARSE PERSONAL INFO
        // =======================================================

        let personalInfo = {};

        if (personalInfoSection.data) {
          try {
            personalInfo =
              typeof personalInfoSection.data === "string"
                ? JSON.parse(personalInfoSection.data)
                : personalInfoSection.data;
          } catch (error) {
            logger.error("Personal info JSON parse error:", error);

            throw new ApiError(
              httpStatus.BAD_REQUEST,
              "Invalid personal information in selected hiring form",
            );
          }
        }

        // =======================================================
        // GET ADDRESS FROM HIRING FORM
        // =======================================================

        const streetAddress = String(personalInfo.streetAddress || "").trim();

        const aptSuite = String(personalInfo.aptSuite || "").trim();

        const fullAddress = [streetAddress, aptSuite]
          .filter((value) => value !== "")
          .join(", ");

        if (!fullAddress) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Address not found in selected hiring form",
          );
        }

        // =======================================================
        // FINAL ADDRESS VALUES
        // =======================================================

        const finalCountryId = Number(country_id);

        const finalStateId = Number(state_id);

        const finalCityId = Number(city_id);

        const finalLatitude = Number(address_lat);

        const finalLongitude = Number(address_long);

        const finalRoleId = Number(user.role_id);

        // =======================================================
        // COMPLETE USER ADDRESS PAYLOAD
        // =======================================================

        const addressPayload = {
          user_id: Number(id),

          role_id: finalRoleId,

          address: fullAddress,

          country_id: finalCountryId,

          state_id: finalStateId,

          city_id: finalCityId,

          address_lat: finalLatitude,

          address_long: finalLongitude,

          google_map_link: null,

          is_active: true,
        };

        // =======================================================
        // LOG EVERYTHING BEFORE SAVE
        // =======================================================

        // =======================================================
        // CREATE NEW EMPLOYEE ADDRESS
        //
        // Only reached when the hiring form actually changed (or
        // this is the first assignment) — see
        // isSameHiringFormAsBefore above.
        // =======================================================


        userAddress = await UserAddress.create(addressPayload, {
          transaction,
        });


        // =======================================================
        // VERIFY ADDRESS
        // =======================================================

        if (!userAddress) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Employee address could not be saved",
          );
        }

        const verifiedAddress = await UserAddress.findOne({
          where: {
            id: userAddress.id,
            user_id: Number(id),
          },
          transaction,
        });

        if (!verifiedAddress) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Employee address was not found after saving",
          );
        }

        // =======================================================
        // VERIFY IMPORTANT VALUES
        // =======================================================

        const savedAddress = verifiedAddress.toJSON();

        if (Number(savedAddress.user_id) !== Number(id)) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect user ID",
          );
        }

        if (Number(savedAddress.role_id) !== finalRoleId) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect role ID",
          );
        }

        if (Number(savedAddress.state_id) !== finalStateId) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect state ID",
          );
        }

        if (Number(savedAddress.country_id) !== finalCountryId) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect country ID",
          );
        }

        if (Number(savedAddress.city_id) !== finalCityId) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect city ID",
          );
        }

        if (Number(savedAddress.address_lat) !== finalLatitude) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect latitude",
          );
        }

        if (Number(savedAddress.address_long) !== finalLongitude) {
          throw new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            "Saved address has incorrect longitude",
          );
        }

        userAddress = verifiedAddress;
      }
    }

    // =========================================================
    // CLIENT CHECKLIST
    // IMPORTANT:
    // DO NOT RUN FOR EMPLOYEES
    // =========================================================

    let checklistEntry;

    if (checklist && !isEmployee) {
      checklistEntry = await saveClientChecklist({
        userId: id,
        checklist,
        client_type,
        transaction,
      });
    }

    // =========================================================
    // RELOAD USER
    // =========================================================

    await user.reload({
      transaction,
    });

    if (profile) {
      await profile.reload({
        transaction,
      });
    }

    // =========================================================
    // COMMIT EVERYTHING
    // =========================================================

    await transaction.commit();

    // =========================================================
    // RETURN
    // =========================================================

    return {
      user,
      profile,
      checklist: checklistEntry || null,
      user_address: userAddress || null,
    };
  } catch (error) {
    // =========================================================
    // ROLLBACK EVERYTHING
    // =========================================================

    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error("Transaction rollback error:", rollbackError);
    }



    logger.error("adminEditUser failed:", error);


    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

const changeEmployeeRole = async (id, role_id) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = Number(id);
    const newRoleId = Number(role_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid employee ID");
    }

    if (!Number.isInteger(newRoleId) || newRoleId <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Valid role ID is required");
    }

    // Only employee roles can be assigned here
    if (!EMPLOYEE_ROLE_IDS.includes(newRoleId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid employee role");
    }

    // Find employee
    const user = await User.findByPk(userId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "Employee not found");
    }

    // Make sure the current user is an employee
    const currentRoleId = Number(user.role_id);

    if (!EMPLOYEE_ROLE_IDS.includes(currentRoleId)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This user is not an employee",
      );
    }

    // No change needed
    if (currentRoleId === newRoleId) {
      await transaction.commit();

      return {
        user,
        previous_role_id: currentRoleId,
        new_role_id: newRoleId,
      };
    }

    // Update employee role
    await user.update(
      {
        role_id: newRoleId,
      },
      {
        transaction,
      },
    );

    await syncEmployeeRoleData(userId, currentRoleId, newRoleId, transaction);

    await user.reload({
      transaction,
    });

    await transaction.commit();

    return {
      user,
      previous_role_id: currentRoleId,
      new_role_id: newRoleId,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      logger.error("Role change transaction rollback error:", rollbackError);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

const getClientChecklistByUserId = async (id) => {
  try {
    /*
      USER
    */

    const user = await User.findByPk(id);

    /*
      CLIENT TYPE
      default = residential
    */

    const client_type =
      user?.client_type && user.client_type.trim() !== ""
        ? user.client_type.toLowerCase()
        : "commercial";

    /*
      CHECKLISTS
    */

    const checklists = await ClientChecklist.findAll({
      where: { user_id: id },
      include: [
        {
          model: ClientChecklistDetail,
          as: "user_client_checklist_details",
        },
      ],
      order: [["created_at", "DESC"]],
    });

    /*
      NO DATA
    */

    if (!checklists || checklists.length === 0) {
      return {
        success: true,
        status: 200,
        message: "No checklists found for this user",
        data: [],
      };
    }

    /*
      ADD CLIENT TYPE
    */

    const formatted = checklists.map((item) => ({
      ...item.toJSON(),
      client_type,
    }));

    return {
      success: true,
      status: 200,
      data: formatted,
    };
  } catch (error) {
    logger.error("Error in getClientChecklistByUserId:", error);

    throw ApiError.orInternal(error);
  }
};

const toggleLogoutImageRequired = async (reqBody, res) => {
  try {
    const { user_id } = reqBody;

    const user = await User.findOne({ where: { id: user_id } });

    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // Toggle the value
    user.logout_image_required = !user.logout_image_required;
    await user.save();

    return res.status(200).json({
      message: `Login/Logout image requirement is now set to ${
        user.logout_image_required ? "ENABLED" : "DISABLED"
      }.`,
      data: {
        user_id: user.id,
        logout_image_required: user.logout_image_required,
      },
    });
  } catch (error) {
    logger.error("Toggle Error:", error);
    throw ApiError.orInternal(error);
  }
};

module.exports = {
  deleteUser,
  resetUserCredentials,
  addNewUserAddress,
  deleteUserAddress,
  changeAssignedAdmin,
  adminAddUser,
  adminEditUser,
  changeEmployeeRole,
  getClientChecklistByUserId,
  toggleLogoutImageRequired,
  updateEmployeeType,
};
