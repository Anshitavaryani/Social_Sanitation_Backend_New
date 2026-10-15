const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class CostCalculation extends Model {}

CostCalculation.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    property_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    client_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    estimated_sqft: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    room_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    restroom_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    stall_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    kitchen_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    trash_can_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    walkaround_minutes: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    employee_count: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },

    hourly_wage: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    estimated_minutes: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    estimated_hours: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    hours_per_employee: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    labor_cost: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    equipment_cost: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    chemical_cost: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    total_operational_cost: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "cost_calculations",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = CostCalculation;
