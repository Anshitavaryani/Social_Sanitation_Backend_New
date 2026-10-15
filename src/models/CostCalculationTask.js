const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class CostCalculationTask extends Model {}

CostCalculationTask.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    calculation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    service_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    estimated_minutes: {
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

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
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
  },
  {
    sequelize,
    tableName: "cost_calculation_tasks",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = CostCalculationTask;