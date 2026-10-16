/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { invoicePaymentStatusTypes, jobStatusTypes, quoteStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class ServiceQuote extends Model {}

ServiceQuote.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },
    ref_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ref_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    service_dates: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    due_date: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    date: {
      type: DataTypes.STRING,
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
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    square_payment_url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    job_status: {
      type: DataTypes.ENUM(jobStatusTypes.NOT_BOOKED, jobStatusTypes.BOOKED, jobStatusTypes.EXPIRED),
      defaultValue: jobStatusTypes.NOT_BOOKED,
    },
    payment_status: {
      type: DataTypes.ENUM(invoicePaymentStatusTypes.NOT_PAID, invoicePaymentStatusTypes.PAID, invoicePaymentStatusTypes.CASH_PAID, invoicePaymentStatusTypes.CHECK_PAID,invoicePaymentStatusTypes.ACH_PAID),
      defaultValue: invoicePaymentStatusTypes.NOT_PAID,
    },
    pdf_url: {
  type: DataTypes.STRING,
  allowNull: true,
},

    square_payment_link_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(quoteStatusTypes.DRAFT, quoteStatusTypes.SAVED),
      defaultValue: quoteStatusTypes.DRAFT,
    },
    invoice_created: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    invoice_id: {
      type: DataTypes.BIGINT.UNSIGNED,
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
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "service_quotes",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

ServiceQuote.beforeUpdate(async (quote) => {
  quote.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
});

ServiceQuote.beforeDestroy(async (quote) => {
  quote.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  quote.is_active = false;
});

module.exports = ServiceQuote;
