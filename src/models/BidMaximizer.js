const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class BidMaximizer extends Model {}

BidMaximizer.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    cost_calculation_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    operational_cost: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    profit_margin_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 30,
    },

    overhead_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 10,
    },

    risk_buffer_amount: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    minimum_bid: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    recommended_bid: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    maximum_bid: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    commission_percentage: {
      type: DataTypes.FLOAT,
      defaultValue: 5,
    },

    commission_amount: {
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
    tableName: "bid_maximizers",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

module.exports = BidMaximizer;