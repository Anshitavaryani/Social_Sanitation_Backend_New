const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class QuoteItem extends Model {}

QuoteItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    quote_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    frequency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    calculation_type: {
      type: DataTypes.ENUM("sqft", "hour", "na"),
      allowNull: true,
      defaultValue: "na",
    },
    sqft: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    hour: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    unit_price: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: false,
    },

    amount: {
      type: DataTypes.DECIMAL(15, 6),
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
    tableName: "quote_items",
    timestamps: true,
    underscored: true,
  },
);

module.exports = QuoteItem;
