const { Sequelize, DataTypes, Model } = require("sequelize");
const { equipmentAssignmentStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class EmployeeEquipmentAssignment extends Model {}

EmployeeEquipmentAssignment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    employee_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    equipment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    assigned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    returned_quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    assigned_date: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    expected_return_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    actual_return_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        equipmentAssignmentStatusTypes.ASSIGNED,
        equipmentAssignmentStatusTypes.PARTIALLY_RETURNED,
        equipmentAssignmentStatusTypes.RETURNED,
        equipmentAssignmentStatusTypes.OVERDUE,
        equipmentAssignmentStatusTypes.LOST,
      ),
      defaultValue: equipmentAssignmentStatusTypes.ASSIGNED,
    },

    remarks: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ================================
    // EQUIPMENT SIGNATURE VERSIONING
    // ================================

    signature_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    signed_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "employee_equipment_assignments",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = EmployeeEquipmentAssignment;