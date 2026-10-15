const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class InvoiceItem extends Model {}

InvoiceItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    invoice_id: {
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
      allowNull: false,
      defaultValue: "na",
    },
    sqft: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    hour: {
      type: DataTypes.FLOAT,
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
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    tableName: "invoice_items",
    timestamps: true,
    underscored: true,
  },
);

module.exports = InvoiceItem;
