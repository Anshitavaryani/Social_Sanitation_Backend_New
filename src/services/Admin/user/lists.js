// Admin user service: user lists, profiles, name dropdowns, addresses, login times and hiring forms

const { status: httpStatus } = require("http-status");
const { Sequelize, Op } = require("sequelize");
const {
  User,
  Profile,
  UserAttachment,
  userLoginTiming,
  BookingAssignment,
  UserAddress,
  ClientChecklistDetail,
  ClientChecklist,
  Country,
  State,
  City,
  FormSubmission,
  FormSection,
} = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { ROLE, EMPLOYEE_ROLE_IDS } = require("../../../config/roles");

const getAllUsers = async (reqBody) => {
  try {
    const userDoc = await User.findAll({
      where: {
        role_id: ROLE.CLIENT,
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
    throw ApiError.orInternal(error);
  }
};

const getAllDrivers = async (reqBody) => {
  try {
    const userDoc = await User.findAll({
      where: {
        role_id: {
          [Sequelize.Op.in]: EMPLOYEE_ROLE_IDS,
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
    throw ApiError.orInternal(error);
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
    throw ApiError.from(error);
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
    throw ApiError.from(error);
  }
};

const getAllUserNameByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: ROLE.CLIENT, is_active: true },
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
    throw ApiError.orInternal(error);
  }
};

const getAllSupervisorByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: ROLE.SUPERVISOR, is_active: true },
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
    throw ApiError.orInternal(error);
  }
};

const getAllQualityInspectorByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: ROLE.QUALITY_INSPECTOR, is_active: true },
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
    throw ApiError.orInternal(error);
  }
};

const getAllCleanerByAdmin = async (id) => {
  try {
    // Fetch users with their service provider booking details
    const userDocs = await User.findAll({
      where: { role_id: ROLE.CLEANER, is_active: true },
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
    throw ApiError.orInternal(error);
  }
};

const getAllUserName = async () => {
  try {
    const users = await User.findAll({
      where: { role_id: ROLE.CLIENT, is_active: true },
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
    throw ApiError.orInternal(error);
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
    throw ApiError.orInternal(error);
  }
};

const getEmployeeDropdown = async () => {
  try {
    const employees = await User.findAll({
      where: {
        role_id: {
          [Sequelize.Op.in]: EMPLOYEE_ROLE_IDS,
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
    throw ApiError.from(error);
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
    throw ApiError.from(error);
  }
};

module.exports = {
  getAllUsers,
  getAllDrivers,
  getUserById,
  getUserLoginTimings,
  clearLoginRecords,
  getAllUserNameByAdmin,
  getAllSupervisorByAdmin,
  getAllQualityInspectorByAdmin,
  getAllCleanerByAdmin,
  getAllUserName,
  getEmployeeDropdown,
  getUserAddressesByUserId,
  getEmployeeHiringForms,
};
