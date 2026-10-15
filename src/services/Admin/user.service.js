/** @format */

const { status: httpStatus } = require("http-status");
const bcrypt = require("bcryptjs");
const { Sequelize, Op } = require("sequelize");
const path = require("path");
const moment = require("moment");
const fs = require("fs");
const { Admin, User, Profile, UserAttachment, userLoginTiming, Service, Booking, ServiceAttachment, BookingAssignment, UserAddress, Payment, ClientChecklistDetail, ClientChecklist, QuoteItem, ServiceQuote, Country, State, City, ReviewLink, Attendance, Break, UserToken, UserOAuth, Invoice, FormSubmission, FormSection } = require("../../models");
const ApiError = require("../../utils/ApiError");
const { sendUserCredentials, sendEmailWithPDF, sendReviewEmailWithPDF, sendServiceRequestEmailWithPDF, sendUpdatedUserCredentials } = require("../Common/email.service");
const {
  generateQuotePDF,
  generateServiceRequestPDF,
} = require("../../config/puppeteer");
const {
  generateSquarePaymentLink,
  deleteSquarePaymentLink,
} = require("../Common/square.service");
const sequelize = require("../../config/central.db");
const sendSMS = require("../../config/sendSMS");
const ServiceRequest = require("../../models/serviceRequest.model");
const ServiceRequestQuoteItem = require("../../models/serviceRequestQuoteItem.model");
const {
  createServiceRequestEnvelope,
} = require("../Common/docusignEnvelope.service");

const getAllUsers = async (reqBody) => {
  try {
    const userDoc = await User.findAll({
      where: {
        role_id: "6",
        is_active: true,
      },

      attributes: ["id", "email", "assigned_to", "created_at"],

      order: [["created_at", "DESC"]],

      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name", "mobile"],
        },

        {
          model: UserAddress,
          as: "user_address",
          required: false,
          where: {
            is_active: true,
          },
          attributes: [
            "id",
            "address",
            "country_id",
            "state_id",
            "city_id",
            "address_lat",
            "address_long",
            "is_active",
          ],

          include: [
            {
              // Same alias/shape as getUserById's "user_country" —
              // needed so the Address column/search can show and
              // filter on country without a separate column.
              model: Country,
              as: "user_country",
              attributes: ["id", "name", "iso3"],
              required: false,
            },
            {
              model: State,
              as: "user_state",
              attributes: ["id", "name"],
              required: false,
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name"],
              required: false,
            },
          ],
        },
      ],
    });

    if (!userDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Users <=|",
      );
    }

    return userDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllDrivers = async (reqBody) => {
  try {
    const userDoc = await User.findAll({
      where: {
        role_id: {
          [Sequelize.Op.in]: [7, 8, 9],
        },
        is_active: true,
      },

      attributes: [
        "id",
        "email",
        "created_at",
        "role_id",
        "sub_role_id",
        "logout_image_required",
        "employee_type",
      ],

      order: [["created_at", "DESC"]],

      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name", "mobile"],
        },

        {
          model: UserAddress,
          as: "user_address",
          required: false,
          attributes: [
            "id",
            "address",
            "country_id",
            "state_id",
            "city_id",
            "address_lat",
            "address_long",
            "is_active",
          ],

          include: [
            {
              // Same alias/shape as getUserById's "user_country" —
              // needed so the Address column/search can show and
              // filter on country without a separate column.
              model: Country,
              as: "user_country",
              attributes: ["id", "name", "iso3"],
              required: false,
            },
            {
              model: State,
              as: "user_state",
              attributes: ["id", "name"],
              required: false,
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name"],
              required: false,
            },
          ],
        },
      ],
    });

    if (!userDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    return userDoc;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getUserById = async (id) => {
  const userDoc = await User.findOne({
    where: { id: id, is_active: true },
    include: [
      {
        model: Profile,
        as: "user_profile",
        attributes: [
          "name",
          "dialing_code",
          "mobile",
          "is_active",
          "created_at",
          "address",
          "dob",
          "country",
        ],
      },
      {
        model: UserAddress,
        as: "user_address",
        include: [
          {
            model: Country,
            as: "user_country",
            attributes: ["id", "name", "iso3"],
          },
          {
            model: State,
            as: "user_state",
            attributes: ["id", "name", "country_id"],
          },
          {
            model: City,
            as: "user_city",
            attributes: ["id", "name", "country_id", "state_id"],
          },
        ],
      },
      {
        model: UserAttachment,
        as: "user_attachments",
        attributes: [
          "id",
          "title",
          "file_type",
          "file_name",
          "file_uri",
          "role_id",
        ],
        order: [["id", "desc"]],
        limit: 1,
      },
      {
        model: ClientChecklist,
        as: "user_client_checklist",
        include: [
          {
            model: ClientChecklistDetail,
            as: "user_client_checklist_details",
          },
        ],
      },
    ],
  });

  if (!userDoc)
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Failed to Get This User",
    );
  return userDoc;
};

const getBookinsByUserId = async (reqBody) => {
  try {
    const { booking_status, id } = reqBody;

    let whereCondition = {};

    if (booking_status === "UPCOMING") {
      whereCondition = {
        booking_status: ["PENDING", "ACCEPTED", "ONGOING"],
        is_active: true,
        user_id: id,
      };
    } else if (booking_status === "ONGOING") {
      whereCondition = {
        booking_status: ["ONGOING"],
        is_active: 1,
        user_id: id,
      };
    } else if (booking_status === "COMPLETED") {
      whereCondition = {
        booking_status: ["SUCCESS", "REJECTED", "DELETED"],
        is_active: 1,
        user_id: id,
      };
    } else if (booking_status === "all") {
      whereCondition = {
        is_active: true,
        user_id: id,
      };
    } else if (booking_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    const bookingDoc = await Booking.findAll({
      where: whereCondition,
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id"],
                },
                {
                  model: UserAttachment,
                  as: "user_attachments",
                  attributes: [
                    "id",
                    "title",
                    "file_type",
                    "file_name",
                    "file_uri",
                    "role_id",
                  ],
                  order: [["id", "desc"]],
                  limit: 1,
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "booking_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: [
                "name",
                "dialing_code",
                "mobile",
                "is_active",
                "created_at",
              ],
            },
            {
              model: UserAttachment,
              as: "user_attachments",
              attributes: [
                "id",
                "title",
                "file_type",
                "file_name",
                "file_uri",
                "role_id",
              ],
              order: [["id", "desc"]],
              limit: 1,
            },
          ],
        },
        {
          model: Service,
          as: "service_booking",
          attributes: ["name", "price"],
          include: [
            {
              model: ServiceAttachment,
              as: "service_attachments",
              attributes: [
                "id",
                "file_type",
                "file_name",
                "file_uri",
                "service_id",
                "title",
              ],
            },
          ],
        },
        {
          model: UserAddress,
          as: "booking_address",
        },
      ],
      order: [["date", "ASC"]],
    });

    if (!bookingDoc || bookingDoc.length === 0) {
      return [];
    }

    return bookingDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getBookingByEmployeeId = async (reqBody) => {
  try {
    const { booking_status, id } = reqBody;
    let whereCondition = { is_active: true, employee_id: id };

    // ✅ Apply booking status filtering properly
    if (booking_status === "UPCOMING") {
      whereCondition["$employee_details_booking.booking_status$"] = [
        "PENDING",
        "ACCEPTED",
        "ONGOING",
      ];
    } else if (booking_status === "ONGOING") {
      whereCondition["$employee_details_booking.booking_status$"] = ["ONGOING"];
    } else if (booking_status === "COMPLETED") {
      whereCondition["$employee_details_booking.booking_status$"] = [
        "SUCCESS",
        "REJECTED",
        "DELETED",
      ];
    } else if (booking_status !== "all" && booking_status) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid bookingStatus parameter",
      );
    }

    // ✅ Fetch Booking Data using proper Joins
    const bookingDoc = await BookingAssignment.findAll({
      where: whereCondition,
      include: [
        {
          model: Booking,
          as: "employee_details_booking",
          required: true, // Ensures only matched records are fetched
          include: [
            {
              model: Service,
              as: "service_booking",
              attributes: ["name", "price", "abbreviation"],
              include: [
                {
                  model: ServiceAttachment,
                  as: "service_attachments",
                  attributes: [
                    "id",
                    "file_type",
                    "file_name",
                    "file_uri",
                    "title",
                  ],
                },
              ],
            },
            {
              model: UserAddress,
              as: "booking_address",
            },
            {
              model: User,
              as: "booking_user",
              attributes: ["id", "email"],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name", "user_id"],
                },
                {
                  model: UserAttachment,
                  as: "user_attachments",
                  attributes: [
                    "id",
                    "title",
                    "file_type",
                    "file_name",
                    "file_uri",
                  ],
                  order: [["id", "desc"]],
                  limit: 1,
                },
              ],
            },
          ],
        },
      ],
      order: [["employee_details_booking", "date", "ASC"]],
    });

    // ✅ Remove team leader from response
    const bookingDetailsWithoutTeamLeader = bookingDoc.map((booking) => {
      const { is_team_leader, ...plainBooking } = booking.get({ plain: true });
      return plainBooking;
    });

    // ✅ Return results or empty array if no data found
    if (!bookingDetailsWithoutTeamLeader.length) return [];

    return bookingDetailsWithoutTeamLeader;
  } catch (error) {
    console.error("Error:", error);
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

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
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// 	try {

// 		// Send email notifications and delete users
// 		await Promise.all(
// 			users.map(async (user) => {

// 			})
// 		);
// 	} catch (error) {

const calculateDistanceInMiles = (lat1, lon1, lat2, lon2) => {
  const toRad = (value) => (value * Math.PI) / 180;

  const R = 3958.8; // Earth radius in miles

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((R * c).toFixed(2));
};

const getClosestEmployees = async (clientId) => {
  try {
    // Find Client

    const client = await User.findByPk(clientId, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
    }

    // Client's first address
    const clientAddress = await UserAddress.findOne({
      where: {
        user_id: clientId,
      },
      order: [["created_at", "ASC"]],
    });

    if (
      !clientAddress ||
      !clientAddress.address_lat ||
      !clientAddress.address_long
    ) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Client address not found.");
    }

    // Fetch all active employees
    const employees = await User.findAll({
      where: {
        role_id: {
          [Op.in]: [7, 8, 9],
        },
        is_active: true,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    const result = [];

    for (const employee of employees) {
      const employeeAddress = await UserAddress.findOne({
        where: {
          user_id: employee.id,
        },
        order: [["created_at", "ASC"]],
      });

      if (
        !employeeAddress ||
        !employeeAddress.address_lat ||
        !employeeAddress.address_long
      ) {
        continue;
      }

      const distance = calculateDistanceInMiles(
        Number(clientAddress.address_lat),
        Number(clientAddress.address_long),
        Number(employeeAddress.address_lat),
        Number(employeeAddress.address_long),
      );

      result.push({
        id: employee.id,
        name: employee.user_profile?.name,
        role_id: employee.role_id,
        employee_type: employee.employee_type,

        address: employeeAddress.address,
        address_lat: Number(employeeAddress.address_lat),
        address_long: Number(employeeAddress.address_long),

        distance,
      });
    }

    result.sort((a, b) => a.distance - b.distance);

    return {
      client: {
        id: client.id,
        name: client.user_profile?.name || null,
        address: clientAddress.address,
        address_lat: Number(clientAddress.address_lat),
        address_long: Number(clientAddress.address_long),
      },
      employees: result.slice(0, 7),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getClosestEmployeesByAddress = async (addressId) => {
  try {
    // Find client address
    const clientAddress = await UserAddress.findByPk(addressId);

    if (!clientAddress) {
      throw new ApiError(httpStatus.NOT_FOUND, "Address not found.");
    }

    if (!clientAddress.address_lat || !clientAddress.address_long) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Address coordinates not found.",
      );
    }

    // Find client
    const client = await User.findByPk(clientAddress.user_id, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!client) {
      throw new ApiError(httpStatus.NOT_FOUND, "Client not found.");
    }

    // Get all active employees
    const employees = await User.findAll({
      where: {
        role_id: {
          [Op.in]: [7, 8, 9],
        },
        is_active: true,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    const result = [];

    for (const employee of employees) {
      const employeeAddress = await UserAddress.findOne({
        where: {
          user_id: employee.id,
        },
        order: [["created_at", "ASC"]],
      });

      if (
        !employeeAddress ||
        !employeeAddress.address_lat ||
        !employeeAddress.address_long
      ) {
        continue;
      }

      const distance = calculateDistanceInMiles(
        Number(clientAddress.address_lat),
        Number(clientAddress.address_long),
        Number(employeeAddress.address_lat),
        Number(employeeAddress.address_long),
      );

      result.push({
        id: employee.id,
        name: employee.user_profile?.name,
        role_id: employee.role_id,
        employee_type: employee.employee_type,

        address: employeeAddress.address,
        address_lat: Number(employeeAddress.address_lat),
        address_long: Number(employeeAddress.address_long),

        distance,
      });
    }

    result.sort((a, b) => a.distance - b.distance);

    return {
      client: {
        id: client.id,
        name: client.user_profile?.name || null,
      },
      selected_address: {
        id: clientAddress.id,
        address: clientAddress.address,
        address_lat: Number(clientAddress.address_lat),
        address_long: Number(clientAddress.address_long),
      },
      employees: result.slice(0, 7),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const addNewUserAddress = async (reqBody) => {
  try {
    const { user_id } = reqBody;

    const user = await User.findByPk(user_id);

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
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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
        console.log(
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
      console.error("Transaction rollback error:", rollbackError);
    }

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
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
    if (Number(user.role_id) !== 6) {
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
    console.error("Error in changeAssignedAdmin:", error);
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
    const salt = bcrypt.genSaltSync(10);
    const newPassword = Math.random().toString(36).substring(2, 12);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);

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
    console.error("Error in resetUserCredentials:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
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

// =========================================================
// ROLE IDS THAT ARE "EMPLOYEES" (i.e. need a hiring form +
// address instead of a client checklist)
//
// 7  -> Inspector / Supervisor
// 8  -> Quality Assurance Technician
// 9  -> Cleaner / HouseKeeping (sub_role_id 10 / 11)
// =========================================================

const EMPLOYEE_ROLE_IDS = [7, 8, 9, 10, 11];

// Roles an employee can be assigned to a booking as (supervisor, QA, cleaner)
const ASSIGNMENT_ROLE_IDS = [7, 8, 9];

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
    const isClient = Number(role_id) === 6;

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

    const salt = bcrypt.genSaltSync(10);
    const password = Math.random().toString(36).substring(2, 12);
    const finalClientType = client_type || "commercial";

    const user = await User.create({
      email: email.trim().toLowerCase(),
      password: bcrypt.hashSync(password, salt),
      role_id,
      sub_role_id,
      status: "ACCEPTED",
      client_type: finalClientType,
      employee_type: isEmployee ? employee_type : null,
      assigned_to: Number(role_id) === 6 ? assigned_to : null,

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

    let supportEmail = "socialsanitation@gmail.com";

    if (Number(role_id) === 6) {
      supportEmail = "clean.quote@socialsanitation.com";
    } else if (EMPLOYEE_ROLE_IDS.includes(Number(role_id))) {
      supportEmail = "reports@socialsanitation.com";
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
    console.error("Error in adminAddUser:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
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
    !ASSIGNMENT_ROLE_IDS.includes(currentRoleId) ||
    !ASSIGNMENT_ROLE_IDS.includes(newRoleId)
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
            [Op.in]: ["PENDING", "ACCEPTED", "ONGOING"],
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
        console.log(
          `Hiring form ${incomingHiringFormId} unchanged for employee ${id} — skipping address creation.`,
        );

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
            console.error("Personal info JSON parse error:", error);

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

        console.log("========================================");

        console.log("EMPLOYEE USER ADDRESS SAVE");

        console.log("Employee ID:", Number(id));

        console.log("Role ID:", finalRoleId);

        console.log("Hiring Form ID:", incomingHiringFormId);

        console.log("Previous Hiring Form ID:", previousHiringFormSubmissionId);

        console.log("Address:", fullAddress);

        console.log("Country ID:", finalCountryId);

        console.log("State ID:", finalStateId);

        console.log("City ID:", finalCityId);

        console.log("Latitude:", finalLatitude);

        console.log("Longitude:", finalLongitude);

        console.log("========================================");

        // =======================================================
        // CREATE NEW EMPLOYEE ADDRESS
        //
        // Only reached when the hiring form actually changed (or
        // this is the first assignment) — see
        // isSameHiringFormAsBefore above.
        // =======================================================

        console.log(`Creating new employee address for employee ${id}...`);

        userAddress = await UserAddress.create(addressPayload, {
          transaction,
        });

        console.log(
          "Employee address created successfully:",
          userAddress?.toJSON?.(),
        );

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

        console.log("========================================");

        console.log("EMPLOYEE ADDRESS VERIFIED IN DATABASE");

        console.log(userAddress.toJSON());

        console.log("========================================");
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
      console.error("Transaction rollback error:", rollbackError);
    }

    console.error("========================================");

    console.error("ERROR IN adminEditUser");

    console.error(error);

    console.error("========================================");

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
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
      console.error("Role change transaction rollback error:", rollbackError);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
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
    console.error("Error in getClientChecklistByUserId:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Internal Server Error",
    );
  }
};

// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

const getUserCount = async () => {
  const userCount = await User.count({
    where: {
      is_active: true,
      role_id: "6",
    },
  });
  return userCount;
};

const getDriverCount = async () => {
  const supervisorCount = await User.count({
    where: { is_active: true, role_id: "7" }, // Supervisor
  });

  const qualityAssuranceCount = await User.count({
    where: { is_active: true, role_id: "8" }, // Quality Assurance
  });

  const janitorCount = await User.count({
    where: { is_active: true, role_id: "9", sub_role_id: "10" }, // Janitor
  });

  const housekeepingCount = await User.count({
    where: { is_active: true, role_id: "9", sub_role_id: "11" }, // Housekeeping
  });

  return {
    supervisor: supervisorCount,
    quality_assurance: qualityAssuranceCount,
    janitor: janitorCount,
    housekeeping: housekeepingCount,
    total:
      supervisorCount +
      qualityAssuranceCount +
      janitorCount +
      housekeepingCount,
  };
};

const getAdminCount = async () => {
  const superAdminCount = await Admin.count({
    where: { is_active: true, role_id: "1" }, // Super Admin
  });

  const salesExecutiveCount = await Admin.count({
    where: { is_active: true, role_id: "3" }, // Sales Executive
  });

  const bdmCount = await Admin.count({
    where: { is_active: true, role_id: "5" }, // BDM
  });

  return {
    super_admin: superAdminCount,
    sales_executive: salesExecutiveCount,
    bdm: bdmCount,
    total: superAdminCount + salesExecutiveCount + bdmCount,
  };
};

const getServiceCount = async () => {
  const serviceCount = await Service.count({
    where: {
      is_active: true,
    },
  });
  return serviceCount;
};

const getBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
    },
  });
  return bookingCount;
};

const getPendingBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: ["PENDING", "ACCEPTED", "ONGOING"],
    },
  });
  return bookingCount;
};

const getCompletedBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: ["SUCCESS"],
    },
  });
  return bookingCount;
};

const getDeletedBookingCount = async () => {
  const bookingCount = await Booking.count({
    where: {
      is_active: true,
      booking_status: ["DELETED", "REJECTED"],
    },
  });
  return bookingCount;
};

const getMostBookedService = async () => {
  try {
    const mostBookedService = await Booking.findAll({
      attributes: [
        "service_id",
        [Sequelize.fn("COUNT", Sequelize.col("service_id")), "booking_count"],
      ],
      where: {
        is_active: true,
      },
      group: ["service_id"],
      order: [[Sequelize.literal("booking_count"), "DESC"]],
      include: [
        {
          model: Service,
          as: "service_booking",
          attributes: ["id", "name"],
        },
      ],
      raw: true,
    });

    // Map the result to change attribute names
    const mappedResult = mostBookedService.map((entry) => ({
      service_id: entry.service_id,
      booking_count: entry.booking_count,
      service_name: entry["service_booking.name"],
      slug: entry["service_booking.slug"],
    }));

    return mappedResult;
  } catch (error) {
    console.error("Error while fetching most booked service:", error);
    throw error;
  }
};

const getUserLoginTimings = async () => {
  try {
    let result = await userLoginTiming.findAll({
      attributes: [
        "id",
        "user_id",
        "time_zone",
        "role_id",
        "ip_address",
        "login_time_utc",
        "logout_time_utc",
        "login_time_local",
        "logout_time_local",
      ],
      include: [
        {
          model: User,
          as: "login_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["id", "name"],
            },
          ],
        },
      ],
    });

    if (!result)
      throw new ApiError(httpStatus.BAD_REQUEST, "Failed to Get All Prices.");

    const groupedByUserId = loginTimingsByUserId(result);
    return groupedByUserId;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const loginTimingsByUserId = (loginTimings) => {
  return loginTimings.reduce((acc, curr) => {
    if (acc[curr.user_id]) {
      acc[curr.user_id].push(curr);
    } else {
      acc[curr.user_id] = [curr];
    }
    return acc;
  }, {});
};

const clearLoginRecords = async () => {
  try {
    await userLoginTiming.destroy({ force: true, where: { is_active: true } });
    return "ok";
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllUserNameByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: "6", is_active: true },
      attributes: ["id", "email", "role_id"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name", "mobile"],
        },
      ],
    });

    if (!userDocs || userDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    return userDocs;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllSupervisorByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: "7", is_active: true },
      attributes: ["id", "email", "role_id"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
        {
          model: BookingAssignment,
          as: "profile_employee",
          attributes: ["booking_id"],
          required: false,
          where: {
            [Op.and]: [{ booking_id: id }],
          },
        },
      ],
    });

    if (!userDocs || userDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    // Map through users to determine `is_service_provider` and `is_team_leader`
    const result = userDocs.map((user) => {
      // Determine if the user is a service provider
      const isServiceProvider = user.profile_employee.length > 0;

      return {
        ...user.toJSON(), // Convert the user object to a plain object
        is_service_provider: isServiceProvider,
      };
    });

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllQualityInspectorByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: "8", is_active: true },
      attributes: ["id", "email", "role_id"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
        {
          model: BookingAssignment,
          as: "profile_employee",
          attributes: ["booking_id"],
          required: false,
          where: {
            [Op.and]: [{ booking_id: id }],
          },
        },
      ],
    });

    if (!userDocs || userDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    // Map through users to determine `is_service_provider` and `is_team_leader`
    const result = userDocs.map((user) => {
      // Determine if the user is a service provider
      const isServiceProvider = user.profile_employee.length > 0;

      return {
        ...user.toJSON(), // Convert the user object to a plain object
        is_service_provider: isServiceProvider,
      };
    });

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllCleanerByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: "9", is_active: true },
      attributes: ["id", "email", "role_id"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
        {
          model: BookingAssignment,
          as: "profile_employee",
          attributes: ["booking_id"],
          required: false,
          where: {
            [Op.and]: [{ booking_id: id }],
          },
        },
      ],
    });

    if (!userDocs || userDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    // Map through users to determine `is_service_provider` and `is_team_leader`
    const result = userDocs.map((user) => {
      // Determine if the user is a service provider
      const isServiceProvider = user.profile_employee.length > 0;

      return {
        ...user.toJSON(), // Convert the user object to a plain object
        is_service_provider: isServiceProvider,
      };
    });

    return result;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getAllTransactions = async () => {
  try {
    const userDocs = await Payment.findAll({
      where: { payment_status: "SUCCESS", is_active: true },
      include: [
        {
          model: User,
          as: "payment_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
        {
          model: Booking,
          as: "payment_booking",
          required: false,
        },
      ],
    });

    if (!userDocs || userDocs.length === 0) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "|=> Failed to get all Drivers <=|",
      );
    }

    return userDocs;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const submitServiceQuote = async (reqBody) => {
  try {
    const {
      quote_id, // optional now
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
      cc_email,
    } = reqBody;

    /* ================= USER ================= */
    const userDocs = await User.findOne({
      where: { id: user_id },
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const userProfile = await Profile.findOne({
      where: { user_id },
    });

    /*
     * ================= CC EMAIL =================
     *
     * If cc_email is provided in the Service Quote request:
     * - normalize it
     * - save it in User table
     * - use it for this quote
     *
     * If cc_email is not provided:
     * - use the already saved cc_email from User table
     */
    let finalCcEmail = userDocs.cc_email || null;

    if (cc_email !== undefined && cc_email !== null) {
      const normalizedCcEmail = cc_email.trim().toLowerCase();

      finalCcEmail = normalizedCcEmail || null;

      await userDocs.update({
        cc_email: finalCcEmail,
      });
    }

    const mobile = userProfile?.mobile;
    const clientName = userProfile?.name;

    let finalRefNo = ref_no;

    // Auto-generate ONLY if empty
    if (!finalRefNo) {
      const generated = await getNextQuoteRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    const existingQuote = await ServiceQuote.findOne({
      where: {
        is_active: true,
        ref_no: finalRefNo,
        ...(quote_id && {
          id: {
            [Op.ne]: quote_id,
          },
        }),
      },
    });

    if (existingQuote) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Reference number already exists.",
      );
    }

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return sum + quantity * unit_price * multiplier;
    }, 0);

    if (total_due <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Total must be > 0");
    }

    /* ================= PAYMENT ================= */

    const { paymentUrl, paymentLinkId } = await generateSquarePaymentLink({
      amount: total_due,
      refNo: finalRefNo,
      customerEmail: userDocs.email,
      user_id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    let quote;

    /* ================= CASE 1: UPDATE DRAFT ================= */

    if (quote_id) {
      quote = await ServiceQuote.findOne({
        where: {
          id: quote_id,
          user_id,
          status: "DRAFT",
        },
      });

      if (!quote) {
        throw new ApiError(httpStatus.NOT_FOUND, "Draft quote not found");
      }

      await quote.update({
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        total_due,
        date,
        signature,
        square_payment_url: paymentUrl,
        square_payment_link_id: paymentLinkId,
        expires_at: expiresAt,
        job_status: "NOT_BOOKED",
        payment_status: "NOT_PAID",
        status: "SAVED",
      });

      await QuoteItem.destroy({
        where: {
          quote_id: quote.id,
        },
      });
    } else {
      /* ================= CASE 2: CREATE NEW ================= */

      quote = await ServiceQuote.create({
        user_id,
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        total_due,
        date,
        signature,
        square_payment_url: paymentUrl,
        square_payment_link_id: paymentLinkId,
        expires_at: expiresAt,
        job_status: "NOT_BOOKED",
        payment_status: "NOT_PAID",
        status: "SAVED",
      });
    }

    /* ================= QUOTE ITEMS ================= */

    const itemPayload = items.map((item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);
      const amount = quantity * unit_price * multiplier;

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity: Number(item.quantity || 1),
        sqft: item.calculation_type === "sqft" ? multiplier : null,
        hour: item.calculation_type === "hour" ? multiplier : null,
        calculation_type: item.calculation_type,
        unit_price,
        amount,
        quote_id: quote.id,
      };
    });

    await QuoteItem.bulkCreate(itemPayload);

    /* ================= PDF + EMAIL ================= */

    const pdfPath = await generateQuotePDF({
      ...reqBody,
      ref_no: finalRefNo,
      total_due,
      quote_id: quote.id,
      square_payment_url: paymentUrl,
    });

    const pdfFileName = path.basename(pdfPath);

    const pdfPublicUrl = `https://node.socialsanitation.com/api/v1/docs/${pdfFileName}`;

    await quote.update({
      pdf_url: pdfPublicUrl,
    });

    /*
     * Send quote email.
     *
     * finalCcEmail comes from:
     * 1. Newly supplied cc_email, OR
     * 2. Previously saved User.cc_email
     */
    await sendEmailWithPDF(userDocs.email, pdfPath, clientName, finalCcEmail);

    /* ================= SMS ================= */

    if (mobile) {
      const smsText = `Social Sanitation:
Your service quote is ready.

View & download:
${pdfPublicUrl}

Ref #: ${finalRefNo}`;

      try {
        const smsResponse = await sendSMS({
          to: mobile,
          message: smsText,
        });

        console.log("Twilio SID:", smsResponse.sid);
      } catch (err) {
        console.error("SMS failed:", err.message);
      }
    }

    console.log(sendSMS, "sendSMS");

    return {
      success: true,
      message: "Quote saved and sent",
      data: {
        quote_id: quote.id,
        status: "SAVED",
      },
    };
  } catch (error) {
    console.error(error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Something went wrong",
    );
  }
};

const handleTwilioSmsStatus = async (data) => {
  const { MessageSid, MessageStatus } = data;

  console.log("SID:", MessageSid);
  console.log("Status:", MessageStatus);

  // Optional: update DB here

  return true;
};

const getLatestDraftQuote = async (userId) => {
  try {
    const draft = await ServiceQuote.findOne({
      where: {
        user_id: userId,
        status: "DRAFT",
      },
      order: [["updated_at", "DESC"]],
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
    });

    return draft;
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, err.message);
  }
};

const getAllDraftQuotesByUser = async (userId) => {
  try {
    const drafts = await ServiceQuote.findAll({
      where: {
        user_id: userId,
        status: "DRAFT",
      },
      attributes: ["id", "ref_type", "ref_no", "updated_at"],
      order: [["updated_at", "DESC"]],
    });

    return drafts;
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, err.message);
  }
};

const deleteDraftQuote = async (id) => {
  const quote = await ServiceQuote.findOne({
    where: { id, status: "DRAFT" },
  });

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Draft not found");
  }

  await QuoteItem.destroy({ where: { quote_id: id } });
  await quote.destroy();
};

const saveDraftQuote = async (reqBody) => {
  try {
    const {
      quote_id,
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    let finalRefNo = ref_no;

    if (!user_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "user_id is required");
    }
    if (!finalRefNo && ref_type) {
      const generated = await getNextQuoteRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    const existingQuote = await ServiceQuote.findOne({
      where: {
        is_active: true,
        ref_no: finalRefNo,
        ...(quote_id && {
          id: {
            [Op.ne]: quote_id,
          },
        }),
      },
    });

    if (existingQuote) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Reference number already exists.",
      );
    }

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return sum + quantity * unit_price * multiplier;
    }, 0);

    let quote;

    if (quote_id) {
      quote = await ServiceQuote.findOne({
        where: { id: quote_id, status: "DRAFT" },
      });
      if (!quote) {
        throw new ApiError(httpStatus.NOT_FOUND, "Draft not found");
      }

      await quote.update({
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        date,
        signature,
        total_due, // ✅
      });

      await QuoteItem.destroy({ where: { quote_id: quote.id } });
    } else {
      quote = await ServiceQuote.create({
        user_id,
        ref_type,
        ref_no: finalRefNo,
        service_dates,
        due_date,
        to_company_name,
        address_1,
        address_2,
        date,
        signature,
        total_due, // ✅
        status: "DRAFT",
      });
    }

    if (items.length) {
      await QuoteItem.bulkCreate(
        items.map((item) => {
          const unit_price = Number(item.unit_price || 0);
          const quantity = Number(item.quantity || 1);

          let multiplier = 1;

          if (item.calculation_type === "hour") {
            multiplier =
              !item.hour || item.hour === "N/A" || isNaN(item.hour)
                ? 1
                : Number(item.hour);
          } else {
            multiplier =
              !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
                ? 1
                : Number(item.sqft);
          }

          return {
            quote_id: quote.id,
            description: item.description,
            frequency: item.frequency || null,
            quantity,
            sqft: item.calculation_type === "sqft" ? multiplier : null,
            hour: item.calculation_type === "hour" ? multiplier : null,
            calculation_type: item.calculation_type,
            unit_price,
            amount: quantity * unit_price * multiplier,
          };
        }),
      );
    }

    return {
      success: true,
      message: "Draft saved successfully",
      data: { quote_id: quote.id },
    };
  } catch (err) {
    console.error("saveDraftQuote error:", err);

    if (err instanceof ApiError) {
      throw err;
    }

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      err.message || "Something went wrong",
    );
  }
};

const deleteQuote = async (quoteId) => {
  try {
    const quote = await ServiceQuote.findByPk(quoteId);

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
    }

    /* ========================================= */
    /* DELETE SQUARE PAYMENT LINK */
    /* ========================================= */

    if (quote.square_payment_link_id) {
      try {
        await deleteSquarePaymentLink(quote.square_payment_link_id);
      } catch (err) {
        console.warn("Failed to delete Square payment link:", err.message);
      }
    }

    /* ========================================= */
    /* DETACH INVOICE */
    /* ========================================= */

    if (quote.invoice_id) {
      await Invoice.update(
        {
          quote_id: null,
        },
        {
          where: {
            id: quote.invoice_id,
          },
        },
      );
    }

    /* ========================================= */
    /* CLEAR PAYMENT LINK DATA */
    /* ========================================= */

    await quote.update({
      square_payment_url: null,

      square_payment_link_id: null,
    });

    /* ========================================= */
    /* SOFT DELETE QUOTE */
    /* ========================================= */

    await quote.destroy();

    return {
      success: true,

      message: "Quote deleted successfully",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,

      error.message,
    );
  }
};

const getNextQuoteRef = async (ref_type) => {
  try {
    if (!ref_type) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ref_type is required");
    }

    const quotes = await ServiceQuote.findAll({
      where: {
        is_active: true,
      },
      attributes: ["ref_no"],
      raw: true,
    });

    let maxNumber = 0;

    for (const quote of quotes) {
      const match = quote.ref_no?.match(/\d+$/);

      if (!match) continue;

      const number = Number(match[0]);

      if (number > maxNumber) {
        maxNumber = number;
      }
    }

    const nextNumber = maxNumber + 1;

    console.log("Highest Ref Number:", maxNumber);
    console.log("Next Number:", nextNumber);

    return {
      ref_no: `${ref_type}${nextNumber}`,
      sequence: nextNumber,
    };
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, err.message);
  }
};

const getServiceQuotesByUserId = async (id) => {
  try {
    // Fetch all quotes for the user, including related items
    const quotes = await ServiceQuote.findAll({
      where: { user_id: id, is_active: true, status: "SAVED" },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    if (!quotes || quotes.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No quotes found for this user");
    }

    return quotes;
  } catch (error) {
    console.error("getServiceQuotesByUser error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getServiceQuoteById = async (id) => {
  try {
    const quote = await ServiceQuote.findOne({
      where: {
        id,
        is_active: true,
      },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
      ],
    });

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Quote not found");
    }

    return quote;
  } catch (error) {
    console.error("getServiceQuoteById:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const editServiceQuote = async (reqBody) => {
  try {
    const {
      quote_id,
      user_id,
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    const quote = await ServiceQuote.findOne({
      where: {
        id: quote_id,
        user_id,
        is_active: true,
      },
    });

    if (!quote) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Quote not found");
    }

    const userDocs = await User.findOne({
      where: { id: user_id },
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const userProfile = await Profile.findOne({
      where: { user_id },
    });

    const mobile = userProfile?.mobile;
    const clientName = userProfile?.name;

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      return sum + Number(item.quantity || 1) * unit_price * multiplier;
    }, 0);

    const { paymentUrl, paymentLinkId } = await generateSquarePaymentLink({
      amount: total_due,
      refNo: ref_no,
      customerEmail: userDocs.email,
      user_id,
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await quote.update({
      ref_type,
      ref_no,
      service_dates,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,
      square_payment_url: paymentUrl,
      square_payment_link_id: paymentLinkId,
      expires_at: expiresAt,
      payment_status: "NOT_PAID",
      job_status: "NOT_BOOKED",
      status: "SAVED",
    });

    /* ================= DELETE OLD ITEMS ================= */

    await QuoteItem.destroy({
      where: {
        quote_id,
      },
    });

    /* ================= INSERT NEW ITEMS ================= */

    const itemPayload = items.map((item) => {
      const unit_price = Number(item.unit_price || 0);

      let multiplier = 1;

      if (item.calculation_type === "hour") {
        multiplier =
          !item.hour || item.hour === "N/A" || isNaN(item.hour)
            ? 1
            : Number(item.hour);
      } else {
        multiplier =
          !item.sqft || item.sqft === "N/A" || isNaN(item.sqft)
            ? 1
            : Number(item.sqft);
      }

      const quantity = Number(item.quantity || 1);

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity,
        sqft: item.calculation_type === "sqft" ? multiplier : null,
        hour: item.calculation_type === "hour" ? multiplier : null,
        calculation_type: item.calculation_type,
        unit_price,
        amount: quantity * unit_price * multiplier,
        quote_id,
      };
    });

    await QuoteItem.bulkCreate(itemPayload);

    /* ================= PDF ================= */

    const pdfPath = await generateQuotePDF({
      ...reqBody,
      quote_id,
      total_due,
      square_payment_url: paymentUrl,
    });

    const pdfFileName = path.basename(pdfPath);

    const pdfPublicUrl = `https://node.socialsanitation.com/api/v1/docs/${pdfFileName}`;

    await quote.update({
      pdf_url: pdfPublicUrl,
    });

    await sendEmailWithPDF(userDocs.email, pdfPath, clientName);

    if (mobile) {
      try {
        await sendSMS({
          to: mobile,
          message: `Social Sanitation:

Your updated service quote is ready.

View & download:
${pdfPublicUrl}

Ref #: ${ref_no}`,
        });
      } catch (err) {
        console.error(err);
      }
    }

    return {
      success: true,
      message: "Service Quote updated successfully",
      data: quote,
    };
  } catch (error) {
    console.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const submitServiceRequest = async (reqBody) => {
  try {
    const {
      user_id,
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    console.log("SERVICE DAYS:", service_days);
    console.log("REQ BODY:", reqBody);

    /* ================= USER ================= */
    const userDocs = await User.findOne({ where: { id: user_id } });
    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const signerName =
      userDocs.user_profile?.name || to_company_name || "Client";

    /* ================= REF NO ================= */
    let finalRefNo = ref_no;

    if (!finalRefNo) {
      const generated = await getNextServiceRequestRef(ref_type);
      finalRefNo = generated.ref_no;
    }

    /* ================= TOTAL ================= */
    const total_due = items.reduce((sum, item) => {
      const quantity = Number(item.quantity || 1);
      const unit_price = Number(item.unit_price || 0);

      const amount = quantity * unit_price;

      return sum + amount;
    }, 0);

    if (total_due <= 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Total must be > 0");
    }

    /* ================= CREATE SERVICE REQUEST ================= */
    const serviceRequest = await ServiceRequest.create({
      user_id,
      ref_type,
      ref_no: finalRefNo,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,
      job_status: "NOT_BOOKED",
      payment_status: "NOT_PAID",
      status: "SAVED",
    });

    /* ================= ITEMS ================= */
    const itemPayload = items.map((item) => {
      const quantity = Number(item.quantity || 1);
      const unit_price = Number(item.unit_price || 0);

      const amount = quantity * unit_price;

      return {
        description: item.description,
        frequency: item.frequency || null,
        quantity,
        unit_price,
        amount,
        service_request_id: serviceRequest.id,
      };
    });

    await ServiceRequestQuoteItem.bulkCreate(itemPayload);

    /* ================= PDF GENERATION ================= */

    const fileName = `service-request-${finalRefNo}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateServiceRequestPDF({
      ...reqBody,
      total_due,
      quote_id: serviceRequest.id,
      pdfPath, // make sure your generator supports this
    });

    await sendServiceRequestEmailWithPDF(userDocs.email, pdfPath, finalRefNo);

    /* ================= DOCUSIGN (CLIENT EMAIL FLOW) ================= */
    const envelopeId = await createServiceRequestEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    /* ================= SAVE ENVELOPE ================= */
    await serviceRequest.update({
      docusign_envelope_id: envelopeId,
    });

    return {
      success: true,
      message: "Service Request created and sent for signature",
      data: {
        quote_id: serviceRequest.id,
        status: "SAVED",
      },
    };
  } catch (error) {
    console.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getServiceRequestById = async (id) => {
  try {
    const request = await ServiceRequest.findOne({
      where: {
        id,
        is_active: true,
      },
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
      ],
    });

    if (!request) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    return request;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const editServiceRequest = async (reqBody) => {
  try {
    const {
      request_id,
      user_id,
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      items = [],
      date,
      signature,
    } = reqBody;

    const request = await ServiceRequest.findOne({
      where: {
        id: request_id,
        is_active: true,
      },
    });

    if (!request) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    const userDocs = await User.findOne({
      where: { id: user_id },
      include: [
        {
          model: Profile,
          as: "user_profile",
        },
      ],
    });

    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    const signerName =
      userDocs.user_profile?.name || to_company_name || "Client";

    /* ================= TOTAL ================= */

    const total_due = items.reduce((sum, item) => {
      return sum + Number(item.amount || item.unit_price || 0);
    }, 0);

    /* ================= UPDATE REQUEST ================= */

    await request.update({
      ref_type,
      ref_no,
      service_days,
      due_date,
      to_company_name,
      address_1,
      address_2,
      total_due,
      date,
      signature,

      // reset signature status
      status: "SAVED",
      docusign_envelope_id: null,
      signed_file_name: null,
      updated_at: new Date(),
    });

    /* ================= DELETE OLD ITEMS ================= */

    await ServiceRequestQuoteItem.destroy({
      where: {
        service_request_id: request.id,
      },
    });

    /* ================= CREATE NEW ITEMS ================= */

    await ServiceRequestQuoteItem.bulkCreate(
      items.map((item) => ({
        description: item.description,
        frequency: item.frequency || null,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        amount: Number(item.amount || item.unit_price || 0),
        service_request_id: request.id,
      })),
    );

    /* ================= REGENERATE PDF ================= */

    const fileName = `service-request-${request.ref_no}.pdf`;

    const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
    const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const pdfPath = path.join(pdfDir, fileName);

    await generateServiceRequestPDF({
      ...reqBody,
      total_due,
      quote_id: request.id,
      pdfPath,
    });

    await sendServiceRequestEmailWithPDF(
      userDocs.email,
      pdfPath,
      request.ref_no,
    );

    /* ================= SEND AGAIN TO DOCUSIGN ================= */

    const envelopeId = await createServiceRequestEnvelope({
      pdfPath,
      clientEmail: userDocs.email,
      clientName: signerName,
    });

    await request.update({
      docusign_envelope_id: envelopeId,
      status: "SAVED",
    });

    return {
      success: true,
      message: "Service Request updated successfully",
      data: request,
    };
  } catch (error) {
    console.error(error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getNextServiceRequestRef = async (ref_type) => {
  try {
    if (!ref_type) {
      throw new ApiError(httpStatus.BAD_REQUEST, "ref_type is required");
    }

    const lastQuote = await ServiceRequest.findOne({
      where: {
        // ref_type,
        user_id: { [Op.ne]: 1 }, // 🚫 exclude test user
      },
      order: [["created_at", "DESC"]],
      attributes: ["ref_no"],
    });

    let nextNumber = 1;

    if (lastQuote?.ref_no) {
      // extract numeric part: RM453 → 453
      const match = lastQuote.ref_no.match(/\d+$/);
      if (match) {
        nextNumber = parseInt(match[0], 10) + 1;
      }
    }

    return {
      ref_no: `${ref_type}${nextNumber}`,
      sequence: nextNumber,
    };
  } catch (err) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, err.message);
  }
};

const getAllServiceRequests = async ({ month } = {}) => {
  try {
    const where = {
      is_active: true,
    };

    if (month) {
      // month format: YYYY-MM
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      where.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }

    const invoices = await ServiceRequest.findAll({
      where, // ✅ now using month filter
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
        {
          model: User,
          as: "request_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    if (!invoices || invoices.length === 0) {
      return []; // better than throwing error for empty month
    }

    return invoices;
  } catch (error) {
    console.error("getAllInvoices error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getServiceRequestsByUserId = async (user_id) => {
  try {
    const requests = await ServiceRequest.findAll({
      where: {
        user_id,
        is_active: true,
      },
      include: [
        {
          model: ServiceRequestQuoteItem,
          as: "service_request_quote_item",
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    return {
      success: true,
      data: requests,
    };
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const deleteServiceRequest = async (serviceRequestId) => {
  const transaction = await sequelize.transaction();

  try {
    const serviceRequest = await ServiceRequest.findByPk(serviceRequestId, {
      transaction,
    });

    if (!serviceRequest) {
      throw new ApiError(httpStatus.NOT_FOUND, "Service Request not found");
    }

    // Soft delete parent
    await serviceRequest.update({ is_active: false }, { transaction });

    // Soft delete all items
    await ServiceRequestQuoteItem.update(
      { is_active: false },
      {
        where: {
          service_request_id: serviceRequestId,
        },
        transaction,
      },
    );

    await transaction.commit();

    return {
      success: true,
      message: "Service Request deleted successfully",
    };
  } catch (error) {
    await transaction.rollback();

    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
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
    console.error("Toggle Error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const sendReviewEmail = async (reqBody) => {
  try {
    const { user_id } = reqBody;

    // ✅ 1. Validate user
    const userDocs = await User.findOne({ where: { id: user_id } });
    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // ✅ 2. Fetch user's profile for full name
    const userProfile = await Profile.findOne({ where: { user_id } });
    const fullName = userProfile
      ? userProfile.name || "Valued Client"
      : "Valued Client";

    // ✅ 3. Get review links (from ReviewLink table)
    const reviewLinks = await ReviewLink.findOne({
      attributes: [
        "apple_review_link",
        "google_review_link",
        "booking_review_link",
      ],
    });

    if (!reviewLinks) {
      throw new ApiError(httpStatus.NOT_FOUND, "Review links not configured");
    }

    // ✅ 4. Send email
    await sendReviewEmailWithPDF(
      userDocs.email,
      fullName,
      reviewLinks.apple_review_link,
      reviewLinks.google_review_link,
      reviewLinks.booking_review_link,
    );
  } catch (error) {
    console.error("sendReviewEmail error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const createOrUpdateReviewLink = async (reqBody) => {
  let result = "";

  const { apple_review_link, google_review_link, booking_review_link } =
    reqBody;

  try {
    // 🔍 Find existing global review link record (only one should exist)
    const existingLink = await ReviewLink.findOne();

    if (existingLink) {
      // ✅ Update existing record
      if (apple_review_link && apple_review_link !== "")
        existingLink.apple_review_link = apple_review_link;
      if (google_review_link && google_review_link !== "")
        existingLink.google_review_link = google_review_link;
      if (booking_review_link && booking_review_link !== "")
        existingLink.booking_review_link = booking_review_link;

      result = await existingLink.save();
    } else {
      // ✅ Create new record (first-time setup)
      const payload = {
        apple_review_link: apple_review_link || null,
        google_review_link: google_review_link || null,
        booking_review_link: booking_review_link || null,
      };

      result = await ReviewLink.create(payload);
    }

    return result;
  } catch (error) {
    throw new ApiError(
      error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getReviewLink = async () => {
  try {
    const quotes = await ReviewLink.findAll({
      where: { is_active: true },
    });

    if (!quotes || quotes.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No quotes found for this user");
    }

    return quotes;
  } catch (error) {
    console.error("getServiceQuotesByUser error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const markQuoteAsBooked = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (quote.job_status === "EXPIRED") {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Expired quotes cannot be booked",
    );
  }

  await quote.update({
    job_status: "BOOKED",
    payment_status: "NOT_PAID",
  });

  return {
    success: true,
    message: "Quote marked as BOOKED",
    data: {
      id: quote.id,
      job_status: quote.job_status,
      payment_status: quote.payment_status,
    },
  };
};

const markQuoteAsCheckPaid = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (
    quote.payment_status === "PAID" ||
    quote.payment_status === "CHECK_PAID"
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Quote is already marked as paid",
    );
  }

  /* ================= DELETE SQUARE LINK ================= */

  if (quote.square_payment_link_id) {
    try {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    } catch (err) {
      console.warn("Failed to delete Square link:", err.message);
    }
  }

  /* ================= UPDATE QUOTE ================= */

  await quote.update({
    payment_status: "CHECK_PAID",

    paid_at: new Date(),

    square_payment_url: null,

    square_payment_link_id: null,

    job_status: quote.job_status === "NOT_BOOKED" ? "BOOKED" : quote.job_status,
  });

  return {
    success: true,

    message: "Quote marked as PAID BY CHECK",

    data: {
      id: quote.id,

      job_status:
        quote.job_status === "NOT_BOOKED" ? "BOOKED" : quote.job_status,

      payment_status: "CHECK_PAID",
    },
  };
};

const markQuoteAsACHPaid = async (quoteId) => {
  const quote = await ServiceQuote.findByPk(quoteId);

  if (!quote) {
    throw new ApiError(httpStatus.NOT_FOUND, "Quote not found");
  }

  if (
    quote.payment_status === "PAID" ||
    quote.payment_status === "CHECK_PAID" ||
    quote.payment_status === "CASH_PAID" ||
    quote.payment_status === "ACH_PAID"
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Quote is already marked as paid",
    );
  }

  /* ================= DELETE SQUARE LINK ================= */

  if (quote.square_payment_link_id) {
    try {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    } catch (err) {
      console.warn("Failed to delete Square link:", err.message);
    }
  }

  /* ================= UPDATE QUOTE ================= */

  await quote.update({
    payment_status: "ACH_PAID",

    paid_at: new Date(),

    square_payment_url: null,

    square_payment_link_id: null,

    job_status: quote.job_status === "NOT_BOOKED" ? "BOOKED" : quote.job_status,
  });

  return {
    success: true,

    message: "Quote marked as paid by ACH",

    data: {
      id: quote.id,

      job_status:
        quote.job_status === "NOT_BOOKED" ? "BOOKED" : quote.job_status,

      payment_status: "ACH_PAID",
    },
  };
};

const getAllInvoices = async ({ month } = {}) => {
  try {
    const where = {};

    if (month) {
      // month format: YYYY-MM
      const startDate = new Date(`${month}-01`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      where.created_at = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }

    const invoices = await ServiceQuote.findAll({
      where,
      order: [["created_at", "DESC"]],
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
          required: false,
        },
        {
          model: User,
          as: "payment_user",
          attributes: ["id", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name"],
            },
          ],
        },
      ],
    });

    return invoices;
  } catch (error) {
    console.error("🔥 FULL ERROR:", error);
    console.error("🔥 SQL MESSAGE:", error?.parent?.sqlMessage);
    console.error("🔥 SQL:", error?.sql);
    throw error;
  }
};

const expireQuotesJob = async () => {
  const expiredQuotes = await ServiceQuote.findAll({
    where: {
      job_status: "NOT_BOOKED",
      expires_at: { [Op.lt]: new Date() },
    },
  });

  for (const quote of expiredQuotes) {
    if (quote.square_payment_link_id) {
      await deleteSquarePaymentLink(quote.square_payment_link_id);
    }

    await quote.update({
      job_status: "EXPIRED",
      // square_payment_url: null,
      // square_payment_link_id: null,
    });
  }
};

const getAllUserName = async () => {
  try {
    const users = await User.findAll({
      where: { role_id: "6", is_active: true },
      attributes: ["id", "email"],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name", "mobile"],
        },
        {
          model: UserAddress,
          as: "user_address",
          attributes: ["id", "address", "user_id"],
          include: [
            {
              model: Country,
              as: "user_country",
              attributes: ["id", "name", "iso3"],
            },
            {
              model: State,
              as: "user_state",
              attributes: ["id", "name", "country_id"],
            },
            {
              model: City,
              as: "user_city",
              attributes: ["id", "name", "country_id", "state_id"],
            },
          ],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    if (!users || users.length === 0) {
      return [];
    }

    return users.map((u) => {
      const primaryAddress = u.user_address?.[0]; // ⭐ pick first address

      return {
        id: u.id,
        name: u.user_profile?.name || null,
        email: u.email || null,
        mobile: u.user_profile?.mobile || null,
        address: {
          address_1: primaryAddress?.address || null,
          city: primaryAddress?.user_city?.name || null,
          state: primaryAddress?.user_state?.name || null,
          country: primaryAddress?.user_country?.name || null,
        },
      };
    });
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getUserAddressesByUserId = async (userId) => {
  try {
    const addresses = await UserAddress.findAll({
      where: { user_id: userId },
      attributes: ["id", "address", "user_id"],
      include: [
        {
          model: Country,
          as: "user_country",
          attributes: ["id", "name", "iso3"],
        },
        {
          model: State,
          as: "user_state",
          attributes: ["id", "name", "country_id"],
        },
        {
          model: City,
          as: "user_city",
          attributes: ["id", "name", "country_id", "state_id"],
        },
      ],
      order: [["id", "ASC"]],
    });

    if (!addresses || addresses.length === 0) {
      return [];
    }

    return addresses.map((a) => ({
      id: a.id,
      address_1: a.address || null,
      city: a.user_city?.name || null,
      state: a.user_state?.name || null,
      country: a.user_country?.name || null,
    }));
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getMonthlyInvoicesSummary = async ({ month }) => {
  try {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    /* ✅ STEP 1: GET PAID QUOTES FOR THE MONTH, WITH ITEMS */
    const invoices = await ServiceQuote.findAll({
      where: {
        is_active: true,
        payment_status: {
          [Op.in]: ["PAID", "CASH_PAID", "CHECK_PAID", "ACH_PAID"],
        },
        created_at: {
          [Op.gte]: startDate,
          [Op.lt]: endDate,
        },
      },
      include: [
        {
          model: QuoteItem,
          as: "service_quote_item",
        },
      ],
    });

    /* If nobody paid this month, skip the user lookup entirely */
    if (invoices.length === 0) {
      return [];
    }

    /* ✅ STEP 2: MAP INVOICES BY USER */
    const invoiceMap = {};

    invoices.forEach((inv) => {
      if (!invoiceMap[inv.user_id]) {
        invoiceMap[inv.user_id] = [];
      }
      invoiceMap[inv.user_id].push(inv);
    });

    const paidUserIds = Object.keys(invoiceMap);

    /* ✅ STEP 3: GET ONLY USERS WHO HAVE A PAID INVOICE */
    const users = await User.findAll({
      attributes: ["id", "email"],
      where: {
        role_id: "6",
        is_active: true,
        id: paidUserIds,
      },
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    /* ✅ STEP 4: MERGE USERS + THEIR PAID INVOICES */
    const result = users.map((user) => {
      const userInvoices = invoiceMap[user.id] || [];

      return {
        user_id: user.id,
        name: user.user_profile?.name || "Unknown",
        email: user.email,
        invoices: userInvoices,
      };
    });

    return result;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

const getLiveWorkingEmployees = async (reqBody) => {
  try {
    const { date } = reqBody;

    if (!date) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Date is required");
    }

    // ✅ Convert to EST (IMPORTANT)
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookings = await Booking.findAll({
      where: {
        is_active: true,
        payment_status: "SUCCESS",
        date: {
          [Op.gte]: startOfDay,
          [Op.lt]: endOfDay,
        },
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          include: [
            {
              model: User,
              as: "employee_profile",
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: ["name"],
                },
              ],
            },
          ],
        },
      ],
    });

    const liveMap = new Map(); // 🔥 prevents duplicates

    for (const booking of bookings) {
      for (const emp of booking.booking_employee_details || []) {
        const empId = emp.employee_profile?.id;

        if (!empId) continue;

        const attendance = await Attendance.findOne({
          where: {
            user_id: empId,
            clock_in_est: {
              [Op.gte]: startOfDay,
              [Op.lt]: endOfDay,
            },
            clock_out_est: null,
          },
        });

        if (attendance) {
          // ✅ avoid duplicate employee
          if (!liveMap.has(empId)) {
            liveMap.set(empId, {
              employee_id: empId,
              employee_name: emp.employee_profile.user_profile?.name || "N/A",
              booking_name: booking.booking_name,
              booking_id: booking.id,
              clock_in: moment(attendance.clock_in_est).format(
                "YYYY-MM-DD HH:mm:ss",
              ),
              clock_in_lat: attendance.clock_in_lat,
              clock_in_lng: attendance.clock_in_lng,
              clock_out_lat: attendance.clock_out_lat,
              clock_out_lng: attendance.clock_out_lng,
            });
          }
        }
      }
    }

    const liveEmployees = Array.from(liveMap.values());

    return {
      total: liveEmployees.length,
      data: liveEmployees,
    };
  } catch (error) {
    console.error("❌ Error in getLiveWorkingEmployees:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getLateAbsentEmployees = async (reqBody) => {
  try {
    const now = new Date();

    const nowEST = new Date(
      now.toLocaleString("en-US", { timeZone: "America/New_York" }),
    );

    const todayEST = now.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });

    const startOfDay = new Date(`${todayEST}T00:00:00`);
    const endOfDay = new Date(`${todayEST}T23:59:59`);

    const bookings = await Booking.findAll({
      where: {
        booking_status: "ACCEPTED",
        is_active: true,
        [Op.and]: Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("date")),
          todayEST,
        ),
      },
      include: [
        {
          model: BookingAssignment,
          as: "booking_employee_details",
          attributes: ["employee_id"],
        },
      ],
    });

    const result = [];

    for (const booking of bookings) {
      const bookingStart = new Date(`${todayEST}T${booking.time}`);

      const lateThreshold = new Date(
        bookingStart.getTime() + 1 * 60 * 60 * 1000,
      );

      const absentThreshold = new Date(
        bookingStart.getTime() + 2 * 60 * 60 * 1000,
      );

      for (const assignment of booking.booking_employee_details || []) {
        const employeeId = assignment.employee_id;

        const attendance = await Attendance.findOne({
          where: {
            user_id: employeeId,
            clock_in_est: {
              [Op.between]: [startOfDay, endOfDay],
            },
          },
        });

        let status = null;
        let clockIn = null;
        let delayMinutes = null;

        if (!attendance) {
          // ❌ No clock-in
          const diffMs = nowEST - bookingStart;
          delayMinutes = Math.max(Math.floor(diffMs / 60000), 0);

          if (nowEST >= absentThreshold) {
            status = "ABSENT";
          } else if (nowEST >= lateThreshold) {
            status = "LATE";
          }
        } else {
          // ✅ Has clock-in
          clockIn = new Date(attendance.clock_in_est);

          const diffMs = clockIn - bookingStart;
          delayMinutes = Math.max(Math.floor(diffMs / 60000), 0);

          if (clockIn >= absentThreshold) {
            status = "ABSENT";
          } else if (clockIn >= lateThreshold) {
            status = "LATE";
          }
        }

        if (status === "LATE" || status === "ABSENT") {
          const user = await User.findByPk(employeeId, {
            include: [
              {
                model: Profile,
                as: "user_profile",
                attributes: ["name"],
              },
            ],
          });

          result.push({
            employee_id: employeeId,
            employee_name: user?.user_profile?.name,
            booking_name: booking.booking_name,
            booking_id: booking.id,

            booking_time: booking.time,
            clock_in_time: clockIn ? clockIn.toISOString() : null,

            delay_minutes: delayMinutes,
            status,
          });
        }
      }
    }

    return {
      total: result.length,
      data: result,
    };
  } catch (error) {
    console.error("❌ Error:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getUpcomingScheduledBookings = async () => {
  try {
    const timezone = "America/New_York";

    const startDate = moment().tz(timezone).format("YYYY-MM-DD");

    const endDate = moment().tz(timezone).add(7, "days").format("YYYY-MM-DD");

    /* ✅ FETCH UPCOMING BOOKINGS */

    const bookings = await Booking.findAll({
      where: {
        is_active: true,

        payment_status: "SUCCESS",

        booking_status: "ACCEPTED",

        [Op.and]: [
          Sequelize.where(Sequelize.fn("DATE", Sequelize.col("date")), {
            [Op.gte]: startDate,
            [Op.lte]: endDate,
          }),
        ],
      },

      include: [
        /* ✅ CLIENT */

        {
          model: User,
          as: "booking_user",

          attributes: ["id"],

          include: [
            {
              model: Profile,
              as: "user_profile",

              attributes: ["name"],
            },
          ],
        },

        /* ✅ EMPLOYEES */

        {
          model: BookingAssignment,
          as: "booking_employee_details",

          include: [
            {
              model: User,
              as: "employee_profile",

              attributes: ["id"],

              include: [
                {
                  model: Profile,
                  as: "user_profile",

                  attributes: ["name"],
                },
              ],
            },
          ],
        },

        /* ✅ CLIENT ADDRESS */

        {
          model: UserAddress,
          as: "booking_address",

          include: [
            {
              model: Country,
              as: "user_country",

              attributes: ["name"],
            },

            {
              model: State,
              as: "user_state",

              attributes: ["name"],
            },

            {
              model: City,
              as: "user_city",

              attributes: ["name"],
            },
          ],
        },
      ],

      order: [
        ["date", "ASC"],
        ["time", "ASC"],
      ],
    });

    /* ✅ FORMAT RESPONSE */

    const formattedBookings = bookings.map((booking) => {
      const addressData =
        booking.booking_address || booking.booking_non_client_address;

      /* ✅ CITY / STATE / COUNTRY */

      const city =
        addressData?.user_city?.name || addressData?.non_client_user_city?.name;

      const state =
        addressData?.user_state?.name ||
        addressData?.non_client_user_state?.name;

      const country =
        addressData?.user_country?.name ||
        addressData?.non_client_user_country?.name;

      /* ✅ ZIP CODE FALLBACKS */

      const zipCode =
        addressData?.address ||
        addressData?.zip_code ||
        addressData?.zipcode ||
        addressData?.postal_code ||
        addressData?.zip ||
        addressData?.pincode;

      /* ✅ FULL ADDRESS */

      const fullAddress = addressData
        ? [zipCode, city, state, country].filter(Boolean).join(", ")
        : "N/A";

      return {
        booking_id: booking.id,

        booking_name: booking.booking_name,

        client_name: booking.booking_user?.user_profile?.name || "N/A",

        /* ✅ DATEONLY SAFE */

        date: booking.date
          ? moment(booking.date).utc().format("MM-DD-YYYY")
          : null,

        time: booking.time,

        employees_assigned: booking.booking_employee_details?.length || 0,

        employees:
          booking.booking_employee_details?.map(
            (emp) => emp.employee_profile?.user_profile?.name,
          ) || [],

        address: fullAddress,
      };
    });

    return {
      total: formattedBookings.length,

      data: formattedBookings,
    };
  } catch (error) {
    console.error("❌ Error in getUpcomingScheduledBookings:", error);

    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const getEmployeeDropdown = async () => {
  try {
    const employees = await User.findAll({
      where: {
        role_id: {
          [Sequelize.Op.in]: [7, 8, 9],
        },
        is_active: true,
      },
      attributes: ["id", "role_id"],
      order: [["created_at", "DESC"]],
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    return employees.map((employee) => ({
      id: employee.id,
      role_id: employee.role_id,
      name: employee.user_profile?.name || "",
    }));
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getEmployeeHiringForms = async (reqQuery) => {
  try {
    const { employee_id } = reqQuery;

    if (!employee_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Employee ID is required");
    }

    const employee = await User.findByPk(employee_id, {
      attributes: ["id", "email"],
    });

    if (!employee) {
      throw new ApiError(httpStatus.NOT_FOUND, "Employee not found");
    }

    const forms = await FormSubmission.findAll({
      where: {
        applicant_email: employee.email?.trim().toLowerCase(),
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

      order: [["created_at", "DESC"]],
    });

    return forms;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  getAllUsers,
  getAllDrivers,
  getUserById,
  getBookinsByUserId,
  getBookingByEmployeeId,
  deleteUser,
  resetUserCredentials,
  getClosestEmployees,
  addNewUserAddress,
  deleteUserAddress,
  changeAssignedAdmin,
  adminAddUser,
  adminEditUser,
  changeEmployeeRole,
  getUserCount,
  getDriverCount,
  getAdminCount,
  getUserLoginTimings,
  getClientChecklistByUserId,
  clearLoginRecords,
  getAllServiceRequests,
  getServiceCount,
  getBookingCount,
  deleteServiceRequest,
  getPendingBookingCount,
  getCompletedBookingCount,
  getDeletedBookingCount,
  getMostBookedService,
  getAllUserNameByAdmin,
  getAllSupervisorByAdmin,
  getAllQualityInspectorByAdmin,
  getAllCleanerByAdmin,
  getAllTransactions,
  submitServiceQuote,
  submitServiceRequest,
  getServiceRequestById,
  editServiceRequest,
  getServiceRequestsByUserId,
  getLatestDraftQuote,
  getNextServiceRequestRef,
  getAllDraftQuotesByUser,
  deleteDraftQuote,
  getNextQuoteRef,
  saveDraftQuote,
  getServiceQuotesByUserId,
  getServiceQuoteById,
  editServiceQuote,
  toggleLogoutImageRequired,
  sendReviewEmail,
  createOrUpdateReviewLink,
  getReviewLink,
  expireQuotesJob,
  markQuoteAsBooked,
  markQuoteAsCheckPaid,
  getAllInvoices,
  handleTwilioSmsStatus,
  getAllUserName,
  deleteQuote,
  updateEmployeeType,
  getMonthlyInvoicesSummary,
  getLiveWorkingEmployees,
  getLateAbsentEmployees,
  getUpcomingScheduledBookings,
  getEmployeeDropdown,
  getClosestEmployeesByAddress,
  getUserAddressesByUserId,
  markQuoteAsACHPaid,
  getEmployeeHiringForms,
};
