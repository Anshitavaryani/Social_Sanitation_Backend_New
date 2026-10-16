const { Sequelize, DataTypes, Model } = require("sequelize");
const { recurringInvoiceStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class InvoiceRecurring extends Model {}

InvoiceRecurring.init(
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

    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    frequency: {
      type: DataTypes.ENUM(
        "WEEKLY",
        "BIWEEKLY",
        "MONTHLY",
        "QUARTERLY",
        "YEARLY",
      ),
      allowNull: false,
      defaultValue: "MONTHLY",
    },

    start_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    end_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    max_occurrences: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    occurrences_generated: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },

    next_billing_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    auto_send: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    status: {
      type: DataTypes.ENUM(
        recurringInvoiceStatusTypes.ACTIVE,
        recurringInvoiceStatusTypes.PAUSED,
        recurringInvoiceStatusTypes.COMPLETED,
        recurringInvoiceStatusTypes.CANCELLED,
      ),
      defaultValue: recurringInvoiceStatusTypes.ACTIVE,
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
    tableName: "invoice_recurring",
    timestamps: true,
    underscored: true,
  },
);

module.exports = InvoiceRecurring;