const { status: httpStatus } = require("http-status");
const ApiError = require("../../utils/ApiError");
const { Op } = require("sequelize");
const { dayjs, monthBoundsUtc } = require("../../utils/time");
const {
  Equipment,
  EmployeeEquipmentAssignment,
  User,
  Profile,
  EmployeeEquipmentSignature,
} = require("../../models");
const { sendEmployeeEquipmentFormEmail } = require("./email.service");


const createEquipment = async (body) => {
  try {
    const equipment = await Equipment.create(body);

    if (!equipment) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Unable to create equipment.");
    }

    return equipment;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateEquipment = async (equipmentId, body) => {
  try {
    const equipment = await Equipment.findByPk(equipmentId);

    if (!equipment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Equipment not found.");
    }

    await equipment.update(body);

    return equipment;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const deleteEquipment = async (equipmentId) => {
  try {
    const equipment = await Equipment.findByPk(equipmentId);

    if (!equipment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Equipment not found.");
    }

    await equipment.update({
      is_active: false,
      deleted_at: new Date(),
    });

    await equipment.destroy();

    return true;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllEquipments = async (query) => {
  try {
    const { page = 1, limit = 10, search = "" } = query;

    const offset = (page - 1) * limit;

    const where = {};

    if (search) {
      where.name = {
        [Op.like]: `%${search}%`,
      };
    }

    const { rows, count } = await Equipment.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit: Number(limit),
      offset: Number(offset),
    });

    return {
      equipments: rows,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(count / limit),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const assignEquipment = async (body) => {
  try {
    const equipment = await Equipment.findByPk(body.equipment_id);

    if (!equipment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Equipment not found.");
    }

    if (body.assigned_quantity <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Assigned quantity must be greater than 0.",
      );
    }

    if (body.assigned_quantity > equipment.quantity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Only ${equipment.quantity} ${equipment.name} available in stock.`,
      );
    }

    await equipment.update({
      quantity: equipment.quantity - body.assigned_quantity,
    });

    const assignment = await EmployeeEquipmentAssignment.create({
      employee_id: body.employee_id,
      equipment_id: body.equipment_id,
      assigned_quantity: body.assigned_quantity,
      returned_quantity: 0,
      expected_return_date: body.expected_return_date,
      status: "ASSIGNED",

      // Signature required
      signature_version: 1,
      signed_version: 0,
    });

    return assignment;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const updateAssignment = async (assignmentId, body) => {
  try {
    const assignment = await EmployeeEquipmentAssignment.findByPk(assignmentId);

    if (!assignment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Assignment not found.");
    }

    const equipment = await Equipment.findByPk(assignment.equipment_id);

    if (!equipment) {
      throw new ApiError(httpStatus.NOT_FOUND, "Equipment not found.");
    }

    const assignedQuantity = Number(assignment.assigned_quantity || 0);

    const previousReturned = Number(assignment.returned_quantity || 0);

    const newReturned = Number(body.returned_quantity);

    /*
     * ==========================================
     * VALIDATE RETURNED QUANTITY
     * ==========================================
     */

    if (!Number.isInteger(newReturned)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Returned quantity must be a valid number.",
      );
    }

    if (newReturned < 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Returned quantity cannot be negative.",
      );
    }

    if (newReturned > assignedQuantity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Returned quantity cannot exceed assigned quantity.",
      );
    }

    /*
     * ==========================================
     * CALCULATE NEW RETURNED STOCK
     * ==========================================
     */

    const difference = newReturned - previousReturned;

    /*
     * If employee returned additional equipment,
     * add only the additional quantity back to stock.
     *
     * Example:
     *
     * Assigned = 5
     * Previously returned = 0
     * New returned = 1
     *
     * difference = 1
     *
     * Stock +1
     */

    if (difference > 0) {
      await equipment.increment("quantity", {
        by: difference,
      });
    }

    /*
     * ==========================================
     * DETERMINE STATUS
     * ==========================================
     */

    let status = "ASSIGNED";

    if (newReturned === assignedQuantity) {
      status = "RETURNED";
    } else if (newReturned > 0) {
      status = "PARTIALLY_RETURNED";
    }

    /*
     * ==========================================
     * CHECK WHETHER SIGNATURE IS REQUIRED AGAIN
     * ==========================================
     *
     * Signature is required again when:
     *
     * 1. Returned quantity changes
     * 2. Status changes
     *
     * Remarks alone do NOT require a new signature.
     */

    const quantityChanged = previousReturned !== newReturned;

    const statusChanged = assignment.status !== status;

    const signatureVersionChanged = quantityChanged || statusChanged;

    /*
     * ==========================================
     * PREPARE UPDATE
     * ==========================================
     */

    const updateData = {
      returned_quantity: newReturned,

      status,

      actual_return_date:
        status === "RETURNED"
          ? assignment.actual_return_date || new Date()
          : null,

      remarks: body.remarks !== undefined ? body.remarks : assignment.remarks,
    };

    /*
     * ==========================================
     * NEW SIGNATURE VERSION
     * ==========================================
     *
     * Example:
     *
     * Version 1 / Signed 1
     *
     * Admin returns 1
     *
     * Version 2 / Signed 1
     *
     * Employee must sign version 2.
     */

    if (signatureVersionChanged) {
      updateData.signature_version =
        Number(assignment.signature_version || 0) + 1;

      // Keep the old signed version.
      // Employee must sign the new version.
      updateData.signed_version = Number(assignment.signed_version || 0);
    }

    await assignment.update(updateData);

    return assignment;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAllAssignments = async (query) => {
  try {
    const { page = 1, limit = 10, search = "" } = query;

    const offset = (Number(page) - 1) * Number(limit);

    const profileWhere = {};

    if (search) {
      profileWhere.name = {
        [Op.like]: `%${search}%`,
      };
    }

    const { rows, count } = await EmployeeEquipmentAssignment.findAndCountAll({
      include: [
        {
          model: User,
          as: "equipment_assignment_user",
          required: true,
          attributes: ["id", "user_name", "email"],
          include: [
            {
              model: Profile,
              as: "user_profile",
              attributes: ["name", "mobile"],
              where: profileWhere,
              required: search ? true : false,
            },
          ],
        },

        {
          model: Equipment,
          as: "assignment_equipment",
          required: true,
          attributes: ["id", "name"],
        },

        {
          model: EmployeeEquipmentSignature,
          as: "equipment_signatures",
          required: false,
          separate: true,
          limit: 1,
          order: [["signed_at", "DESC"]],
          attributes: ["id", "signature_version", "signature", "signed_at"],
        },
      ],

      order: [["created_at", "DESC"]],

      limit: Number(limit),
      offset,

      distinct: true,
    });

    const assignments = rows.map((item) => {
      const latestSignature = item.equipment_signatures?.[0] || null;

      const signatureRequired =
        Number(item.signature_version) !== Number(item.signed_version);

      return {
        id: item.id,

        employee: {
          id: item.equipment_assignment_user.id,

          name: item.equipment_assignment_user.user_profile?.name || null,

          mobile: item.equipment_assignment_user.user_profile?.mobile || null,

          email: item.equipment_assignment_user.email,
        },

        equipment: {
          id: item.assignment_equipment.id,
          name: item.assignment_equipment.name,
        },

        assigned_quantity: item.assigned_quantity,

        returned_quantity: item.returned_quantity,

        pending_quantity: item.assigned_quantity - item.returned_quantity,

        assigned_date: item.assigned_date,

        expected_return_date: item.expected_return_date,

        actual_return_date: item.actual_return_date,

        status: item.status,

        remarks: item.remarks,

        /*
         * ==========================
         * SIGNATURE INFORMATION
         * ==========================
         */

        signature: {
          required: signatureRequired,

          status: signatureRequired ? "PENDING" : "SIGNED",

          current_version: item.signature_version,

          signed_version: item.signed_version,

          latest: latestSignature
            ? {
                id: latestSignature.id,

                signature_version: latestSignature.signature_version,

                signature: latestSignature.signature,

                signed_at: latestSignature.signed_at,
              }
            : null,
        },
      };
    });

    return {
      assignments,

      pagination: {
        total: count,

        page: Number(page),

        limit: Number(limit),

        total_pages: Math.ceil(count / Number(limit)),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const assignmentOverview = async () => {
  try {
    const totalEquipmentTypes = await Equipment.count();

    const availableStock = (await Equipment.sum("quantity")) || 0;

    const assignedRecords = await EmployeeEquipmentAssignment.findAll({
      where: {
        status: {
          [Op.in]: ["ASSIGNED", "PARTIALLY_RETURNED"],
        },
      },
      attributes: ["assigned_quantity", "returned_quantity"],
    });

    const assignedStock = assignedRecords.reduce((total, item) => {
      return total + (item.assigned_quantity - item.returned_quantity);
    }, 0);

    const returnedStock =
      (await EmployeeEquipmentAssignment.sum("returned_quantity")) || 0;

    const overdueAssignments = await EmployeeEquipmentAssignment.count({
      where: {
        status: {
          [Op.ne]: "RETURNED",
        },
        expected_return_date: {
          [Op.lt]: new Date(),
        },
      },
    });

    const totalStock = availableStock + assignedStock;

    return {
      total_equipment_types: totalEquipmentTypes,
      total_stock: totalStock,
      available_stock: availableStock,
      assigned_stock: assignedStock,
      returned_stock: returnedStock,
      overdue_assignments: overdueAssignments,
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getAssignmentEquipmentHistory = async (assignmentId) => {
  try {
    // Find assignment
    const assignment =
      await EmployeeEquipmentAssignment.findOne({
        where: {
          id: assignmentId,
        },

        include: [
          {
            model: User,
            as: "equipment_assignment_user",
            required: true,
            attributes: [
              "id",
              "user_name",
              "email",
              "employee_type",
            ],

            include: [
              {
                model: Profile,
                as: "user_profile",
                attributes: ["name", "mobile"],
              },
            ],
          },

          {
            model: Equipment,
            as: "assignment_equipment",
            required: false,
            attributes: ["id", "name"],
          },

          {
            model: EmployeeEquipmentSignature,
            as: "equipment_signatures",
            required: false,
            separate: true,
            order: [["signed_at", "ASC"]],
            attributes: [
              "id",
              "assignment_id",
              "employee_id",
              "signature_version",
              "action",
              "status",
              "quantity",
              "remaining_quantity",
              "signature",
              "signed_at",
              "created_at",
            ],
          },
        ],
      });

    if (!assignment) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Equipment assignment not found.",
      );
    }

    const signatures =
      assignment.equipment_signatures || [];

    const signatureVersion = Number(
      assignment.signature_version || 0,
    );

    const signedVersion = Number(
      assignment.signed_version || 0,
    );

    return {
      assignment: {
        id: assignment.id,

        employee: {
          id:
            assignment.equipment_assignment_user?.id ||
            null,

          name:
            assignment.equipment_assignment_user
              ?.user_profile?.name || null,

          mobile:
            assignment.equipment_assignment_user
              ?.user_profile?.mobile || null,

          email:
            assignment.equipment_assignment_user
              ?.email || null,

          employee_type:
            assignment.equipment_assignment_user
              ?.employee_type || null,
        },

        equipment: assignment.assignment_equipment
          ? {
              id:
                assignment.assignment_equipment.id,

              name:
                assignment.assignment_equipment.name,
            }
          : null,

        assigned_quantity:
          assignment.assigned_quantity,

        returned_quantity:
          assignment.returned_quantity,

        pending_quantity:
          Number(
            assignment.assigned_quantity || 0,
          ) -
          Number(
            assignment.returned_quantity || 0,
          ),

        assigned_date:
          assignment.assigned_date,

        expected_return_date:
          assignment.expected_return_date,

        actual_return_date:
          assignment.actual_return_date,

        status: assignment.status,

        remarks: assignment.remarks,

        signature: {
          current_version:
            signatureVersion,

          signed_version:
            signedVersion,

          required:
            signatureVersion !== signedVersion,

          status:
            signatureVersion !== signedVersion
              ? "PENDING"
              : "SIGNED",

          total_signatures:
            signatures.length,
        },
      },

      history: signatures.map((item) => ({
        id: item.id,

        assignment_id:
          item.assignment_id,

        employee_id:
          item.employee_id,

        signature_version:
          item.signature_version,

        action: item.action,

        status: item.status,

        quantity:
          item.quantity,

        remaining_quantity:
          item.remaining_quantity,

        signature:
          item.signature,

        signed_at:
          item.signed_at,

        created_at:
          item.created_at,
      })),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getMonthlyEmployeeEquipmentRecords = async (query) => {
  try {
    const {
      month,
      search = "",
      page = 1,
      limit = 10,
    } = query;

    if (!month) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Month is required. Example: 2026-08",
      );
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Invalid month format. Please use YYYY-MM.",
      );
    }

    const { start: startDate, end: endDate } = monthBoundsUtc(month);

    const offset =
      (Number(page) - 1) * Number(limit);

    // ==========================================
    // EMPLOYEE SEARCH
    // ==========================================

    const profileWhere = {};

    if (search) {
      profileWhere.name = {
        [Op.like]: `%${search}%`,
      };
    }

    // ==========================================
    // FIND EMPLOYEES HAVING EQUIPMENT
    // DURING SELECTED MONTH
    // ==========================================

    const {
      rows: employees,
      count,
    } = await User.findAndCountAll({
      where: {
        is_active: true,
        role_id: {
          [Op.in]: [7, 8, 9],
        },
      },

      attributes: [
        "id",
        "user_name",
        "email",
        "employee_type",
      ],

      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name", "mobile"],
          where: profileWhere,
          required: Boolean(search),
        },

        {
          model: EmployeeEquipmentAssignment,
          as: "user_equipment_assignments",
          required: true,

          where: {
            assigned_date: {
              [Op.lte]: endDate,
            },

            [Op.or]: [
              {
                actual_return_date: null,
              },
              {
                actual_return_date: {
                  [Op.gte]:
                    startDate,
                },
              },
            ],
          },

          include: [
            {
              model: Equipment,
              as: "assignment_equipment",
              required: false,
              attributes: [
                "id",
                "name",
              ],
            },
          ],
        },
      ],

      limit: Number(limit),
      offset,

      distinct: true,
    });

    // ==========================================
    // FORMAT EMPLOYEE RECORDS
    // ==========================================

    const records = employees.map(
      (employee) => {
        // IMPORTANT:
        // This must match the association alias above.
        const assignments =
          employee.user_equipment_assignments ||
          [];

        const totalAssigned =
          assignments.reduce(
            (total, item) =>
              total +
              Number(
                item.assigned_quantity || 0,
              ),
            0,
          );

        const totalReturned =
          assignments.reduce(
            (total, item) =>
              total +
              Number(
                item.returned_quantity || 0,
              ),
            0,
          );

        const totalPending =
          totalAssigned -
          totalReturned;

        return {
          employee: {
            id: employee.id,

            name:
              employee.user_profile?.name ||
              null,

            email:
              employee.email,

            mobile:
              employee.user_profile?.mobile ||
              null,

            employee_type:
              employee.employee_type ||
              null,
          },

          summary: {
            total_assignments:
              assignments.length,

            total_assigned_quantity:
              totalAssigned,

            total_returned_quantity:
              totalReturned,

            total_pending_quantity:
              totalPending,
          },

          assignments:
            assignments.map(
              (assignment) => ({
                id: assignment.id,

                equipment:
                  assignment.assignment_equipment
                    ? {
                        id:
                          assignment
                            .assignment_equipment
                            .id,

                        name:
                          assignment
                            .assignment_equipment
                            .name,
                      }
                    : null,

                assigned_quantity:
                  assignment.assigned_quantity,

                returned_quantity:
                  assignment.returned_quantity,

                pending_quantity:
                  Number(
                    assignment.assigned_quantity ||
                      0,
                  ) -
                  Number(
                    assignment.returned_quantity ||
                      0,
                  ),

                assigned_date:
                  assignment.assigned_date,

                expected_return_date:
                  assignment.expected_return_date,

                actual_return_date:
                  assignment.actual_return_date,

                status:
                  assignment.status,

                remarks:
                  assignment.remarks,
              }),
            ),
        };
      },
    );

    return {
      month: {
        value: month,

        label: dayjs(`${month}-01`).format("MMMM YYYY"),

        start_date: `${month}-01`,

        end_date: dayjs(`${month}-01`).endOf("month").format("YYYY-MM-DD"),
      },

      records,

      pagination: {
        total: count,

        page: Number(page),

        limit: Number(limit),

        total_pages: Math.ceil(
          count / Number(limit),
        ),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const sendEmployeeEquipmentForm = async (
  assignmentId,
) => {
  try {
    // ==========================================
    // FIND ASSIGNMENT
    // ==========================================

    const assignment =
      await EmployeeEquipmentAssignment.findByPk(
        assignmentId,
        {
          include: [
            {
              model: User,
              as: "equipment_assignment_user",
              required: true,
              attributes: [
                "id",
                "user_name",
                "email",
                "employee_type",
              ],
              include: [
                {
                  model: Profile,
                  as: "user_profile",
                  attributes: [
                    "name",
                    "mobile",
                  ],
                },
              ],
            },

            {
              model: Equipment,
              as: "assignment_equipment",
              required: true,
              attributes: [
                "id",
                "name",
              ],
            },

            {
              model: EmployeeEquipmentSignature,
              as: "equipment_signatures",
              required: false,
              separate: true,
              order: [
                ["signed_at", "ASC"],
              ],
              attributes: [
                "id",
                "assignment_id",
                "employee_id",
                "signature_version",
                "action",
                "status",
                "quantity",
                "remaining_quantity",
                "signature",
                "signed_at",
                "created_at",
              ],
            },
          ],
        },
      );

    if (!assignment) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Equipment assignment not found.",
      );
    }

    // ==========================================
    // EMPLOYEE
    // ==========================================

    const employee =
      assignment.equipment_assignment_user;

    if (!employee) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Employee not found for this assignment.",
      );
    }

    if (!employee.email) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Employee email not found.",
      );
    }

    // ==========================================
    // SIGNATURE HISTORY
    // ==========================================

    const signatures =
      assignment.equipment_signatures || [];

    // ==========================================
    // FORMAT ASSIGNMENT
    // ==========================================

    const assignmentData = {
      id: assignment.id,

      employee: {
        id: employee.id,

        name:
          employee.user_profile?.name ||
          null,

        email: employee.email,

        mobile:
          employee.user_profile?.mobile ||
          null,

        employee_type:
          employee.employee_type ||
          null,
      },

      equipment:
        assignment.assignment_equipment
          ? {
              id:
                assignment
                  .assignment_equipment
                  .id,

              name:
                assignment
                  .assignment_equipment
                  .name,
            }
          : null,

      assigned_quantity:
        assignment.assigned_quantity,

      returned_quantity:
        assignment.returned_quantity,

      pending_quantity:
        Number(
          assignment.assigned_quantity || 0,
        ) -
        Number(
          assignment.returned_quantity || 0,
        ),

      assigned_date:
        assignment.assigned_date,

      expected_return_date:
        assignment.expected_return_date,

      actual_return_date:
        assignment.actual_return_date,

      status:
        assignment.status,

      remarks:
        assignment.remarks,

      signature: {
        current_version:
          Number(
            assignment.signature_version || 0,
          ),

        signed_version:
          Number(
            assignment.signed_version || 0,
          ),

        required:
          Number(
            assignment.signature_version || 0,
          ) !==
          Number(
            assignment.signed_version || 0,
          ),

        status:
          Number(
            assignment.signature_version || 0,
          ) !==
          Number(
            assignment.signed_version || 0,
          )
            ? "PENDING"
            : "SIGNED",

        history:
          signatures.map(
            (item) => ({
              id: item.id,

              assignment_id:
                item.assignment_id,

              employee_id:
                item.employee_id,

              signature_version:
                item.signature_version,

              action:
                item.action,

              status:
                item.status,

              quantity:
                item.quantity,

              remaining_quantity:
                item.remaining_quantity,

              signature:
                item.signature,

              signed_at:
                item.signed_at,

              created_at:
                item.created_at,
            }),
          ),
      },
    };

    // ==========================================
    // SEND EMAIL
    // ==========================================

    await sendEmployeeEquipmentFormEmail({
      to: employee.email,

      name:
        employee.user_profile?.name ||
        "Employee",

      assignment:
        assignmentData,
    });

    return {
      assignment_id:
        assignment.id,

      employee_id:
        employee.id,

      email:
        employee.email,

      equipment:
        assignment.assignment_equipment?.name ||
        null,

      message:
        "Equipment form sent successfully.",
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// employee equipment signature service functions

const getMyEquipment = async (body, query) => {
  try {
    const { user } = body;
    const { page = 1, limit = 10, status } = query;

    const offset = (Number(page) - 1) * Number(limit);

    const where = {
      employee_id: user.id,
    };

    if (status) {
      where.status = status;
    }

    const { rows, count } = await EmployeeEquipmentAssignment.findAndCountAll({
      where,

      include: [
        {
          model: Equipment,
          as: "assignment_equipment",
          required: true,
          attributes: ["id", "name", "quantity"],
        },
      ],

      order: [["created_at", "DESC"]],

      limit: Number(limit),
      offset,

      distinct: true,
    });

    const assignments = rows.map((item) => ({
      id: item.id,

      equipment: {
        id: item.assignment_equipment.id,
        name: item.assignment_equipment.name,
      },

      assigned_quantity: item.assigned_quantity,

      returned_quantity: item.returned_quantity,

      pending_quantity: item.assigned_quantity - item.returned_quantity,

      assigned_date: item.assigned_date,

      expected_return_date: item.expected_return_date,

      actual_return_date: item.actual_return_date,

      status: item.status,

      remarks: item.remarks,

      signature: {
        required: item.signature_version !== item.signed_version,

        signature_version: item.signature_version,

        signed_version: item.signed_version,

        status:
          item.signature_version === item.signed_version ? "SIGNED" : "PENDING",
      },
    }));

    return {
      assignments,

      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(count / Number(limit)),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const signEquipment = async (body, assignmentId) => {
  try {
    const { user, signature } = body;

    if (!user || !user.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Employee information not found.",
      );
    }

    if (!signature) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Signature is required.");
    }

    const assignment = await EmployeeEquipmentAssignment.findOne({
      where: {
        id: assignmentId,
        employee_id: user.id,
      },
    });

    if (!assignment) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Equipment assignment not found.",
      );
    }

    const signatureVersion = Number(assignment.signature_version || 0);

    const signedVersion = Number(assignment.signed_version || 0);

    // Employee already signed the current version
    if (signatureVersion === signedVersion) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This equipment assignment is already signed.",
      );
    }

    const assignedQuantity = Number(assignment.assigned_quantity || 0);

    const returnedQuantity = Number(assignment.returned_quantity || 0);

    const remainingQuantity = assignedQuantity - returnedQuantity;

    /*
     * Determine why the employee is signing
     */

    let action;

    if (assignment.status === "ASSIGNED") {
      action = "ASSIGNED";
    } else if (assignment.status === "PARTIALLY_RETURNED") {
      action = "PARTIAL_RETURN";
    } else if (assignment.status === "RETURNED") {
      action = "FULL_RETURN";
    } else {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Employee cannot sign equipment with status ${assignment.status}.`,
      );
    }

    /*
     * Quantity being acknowledged by this signature
     */

    let signedQuantity;

    if (action === "ASSIGNED") {
      signedQuantity = assignedQuantity;
    } else if (action === "PARTIAL_RETURN") {
      signedQuantity = returnedQuantity;
    } else {
      // FULL_RETURN
      signedQuantity = returnedQuantity;
    }

    /*
     * Create signature history
     */

    const signatureDoc = await EmployeeEquipmentSignature.create({
      assignment_id: assignment.id,

      employee_id: user.id,

      signature_version: signatureVersion,

      action,

      status: assignment.status,

      quantity: signedQuantity,

      remaining_quantity: remainingQuantity,

      signature,

      signed_at: new Date(),
    });

    /*
     * Mark current assignment version as signed
     */

    await assignment.update({
      signed_version: signatureVersion,
    });

    return signatureDoc;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getEquipmentSignatureHistory = async (body, assignmentId) => {
  try {
    const { user } = body;

    if (!user || !user.id) {
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        "Employee information not found.",
      );
    }

    const assignment = await EmployeeEquipmentAssignment.findOne({
      where: {
        id: assignmentId,
        employee_id: user.id,
      },
    });

    if (!assignment) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Equipment assignment not found.",
      );
    }

    const signatures = await EmployeeEquipmentSignature.findAll({
      where: {
        assignment_id: assignmentId,
        employee_id: user.id,
      },
      attributes: [
        "id",
        "assignment_id",
        "employee_id",
        "signature_version",
        "action",
        "status",
        "quantity",
        "remaining_quantity",
        "signature",
        "signed_at",
        "created_at",
      ],
      order: [["signed_at", "DESC"]],
    });

    const signatureVersion = Number(assignment.signature_version || 0);

    const signedVersion = Number(assignment.signed_version || 0);

    return {
      assignment_id: assignmentId,

      current_signature_version: signatureVersion,

      current_signed_version: signedVersion,

      signature_required: signatureVersion !== signedVersion,

      signatures: signatures.map((item) => ({
        id: item.id,

        assignment_id: item.assignment_id,

        employee_id: item.employee_id,

        signature_version: item.signature_version,

        action: item.action,

        status: item.status,

        quantity: item.quantity,

        remaining_quantity: item.remaining_quantity,

        signature: item.signature,

        signed_at: item.signed_at,

        created_at: item.created_at,
      })),
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

const getEquipmentByEmployeeId = async (employeeId, query) => {
  try {
    const { page = 1, limit = 10, status } = query;

    const offset =
      (Number(page) - 1) * Number(limit);

    const where = {
      employee_id: employeeId,
    };

    if (status) {
      where.status = status;
    }

    const { rows, count } =
      await EmployeeEquipmentAssignment.findAndCountAll({
        where,

        include: [
          {
            model: Equipment,
            as: "assignment_equipment",
            required: true,
            attributes: ["id", "name", "quantity"],
          },
        ],

        order: [["created_at", "DESC"]],

        limit: Number(limit),
        offset,

        distinct: true,
      });

    const assignments = rows.map((item) => ({
      id: item.id,

      equipment: {
        id: item.assignment_equipment.id,
        name: item.assignment_equipment.name,
      },

      assigned_quantity:
        item.assigned_quantity,

      returned_quantity:
        item.returned_quantity,

      pending_quantity:
        Number(item.assigned_quantity || 0) -
        Number(item.returned_quantity || 0),

      assigned_date:
        item.assigned_date,

      expected_return_date:
        item.expected_return_date,

      actual_return_date:
        item.actual_return_date,

      status: item.status,

      remarks: item.remarks,

      signature: {
        required:
          Number(item.signature_version || 0) !==
          Number(item.signed_version || 0),

        signature_version:
          item.signature_version,

        signed_version:
          item.signed_version,

        status:
          Number(item.signature_version || 0) ===
          Number(item.signed_version || 0)
            ? "SIGNED"
            : "PENDING",
      },
    }));

    return {
      assignments,

      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(
          count / Number(limit),
        ),
      },
    };
  } catch (error) {
    throw new ApiError(
      error.statusCode ||
        httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

module.exports = {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getAllEquipments,

  assignEquipment,
  updateAssignment,
  getAllAssignments,
  assignmentOverview,

  getAssignmentEquipmentHistory,
  getMonthlyEmployeeEquipmentRecords,
  sendEmployeeEquipmentForm,

  getMyEquipment,
  signEquipment,
  getEquipmentSignatureHistory,

  getEquipmentByEmployeeId,
};
