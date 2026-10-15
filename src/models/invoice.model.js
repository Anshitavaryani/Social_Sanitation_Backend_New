/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Invoice extends Model {}

Invoice.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    client_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    quote_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    ref_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ref_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    custom_ref_no: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    event_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    service_dates: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    due_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    billing_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    to_company_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    address_1: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address_2: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    total_due: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: false,
    },
    deposit_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    deposit_percentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 25.0,
    },

    deposit_amount: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: true,
    },

    balance_amount: {
      type: DataTypes.DECIMAL(15, 6),
      allowNull: true,
    },

    payment_stage: {
      type: DataTypes.ENUM(
        "FULL",
        "DEPOSIT_PENDING",
        "DEPOSIT_PAID",
        "BALANCE_PENDING",
        "COMPLETED",
      ),
      allowNull: false,
      defaultValue: "FULL",
    },

    balance_due_date: {
  type: DataTypes.DATEONLY,
  allowNull: true,
},

    deposit_paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    balance_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    balance_paid_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    payment_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    square_payment_link_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payment_status: {
      type: DataTypes.ENUM(
        "NOT_PAID",
        "PAID",
        "CASH_PAID",
        "CHECK_PAID",
        "ACH_PAID",
      ),
      defaultValue: "NOT_PAID",
    },
    last_sent_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scheduled_send_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "CANCELLED"),
      defaultValue: "ACTIVE",
    },
    pdf_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_historical: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
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
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "invoices",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

Invoice.beforeUpdate(async (quote) => {
  quote.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
});

Invoice.beforeDestroy(async (quote) => {
  quote.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  quote.is_active = false;
});

module.exports = Invoice;
