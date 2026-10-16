const { Sequelize, DataTypes, Model } = require("sequelize");
const { equipmentAssignmentStatusTypes, equipmentSignatureActionTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class EmployeeEquipmentSignature extends Model {}

EmployeeEquipmentSignature.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    assignment_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "employee_equipment_assignments",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    employee_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },

    signature_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    signature: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },

    signed_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    action: {
  type: DataTypes.ENUM(
    equipmentSignatureActionTypes.ASSIGNED,
    equipmentSignatureActionTypes.PARTIAL_RETURN,
    equipmentSignatureActionTypes.FULL_RETURN,
  ),
  allowNull: false,
},

status: {
  type: DataTypes.ENUM(
    equipmentAssignmentStatusTypes.ASSIGNED,
    equipmentAssignmentStatusTypes.PARTIALLY_RETURNED,
    equipmentAssignmentStatusTypes.RETURNED,
  ),
  allowNull: false,
},

quantity: {
  type: DataTypes.INTEGER,
  allowNull: false,
},

remaining_quantity: {
  type: DataTypes.INTEGER,
  allowNull: false,
},

    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    sequelize,
    tableName: "employee_equipment_signatures",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = EmployeeEquipmentSignature;