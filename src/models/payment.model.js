/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { paymentStatusTypes, paymentModeTypes, currancyTypes, paymentPurposeTypes } = require("../config/types");
const config = require("../config/config");

class Payment extends Model {}
Payment.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    transaction_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    square_order_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    currency: {
      type: DataTypes.ENUM,
      values: [
        currancyTypes.CHF,
        currancyTypes.EUR,
        currancyTypes.INR,
        currancyTypes.KYD,
        currancyTypes.OMR,
        currancyTypes.USD,
      ],
      defaultValue: currancyTypes.USD,
    },
    user_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      references: {
        model: "users",
        key: "id",
      },
    },
    booking_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    quote_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    payment_purpose: {
  type: DataTypes.ENUM(paymentPurposeTypes.FULL, paymentPurposeTypes.DEPOSIT, paymentPurposeTypes.BALANCE),
  allowNull: false,
  defaultValue: paymentPurposeTypes.FULL,
},
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: config.DEFAULT_AMOUNT,
    },
    square_customer_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    square_payment_link_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Description Not Available.",
    },
    payment_status: {
      type: DataTypes.ENUM(
        paymentStatusTypes.PENDING,
        paymentStatusTypes.SUCCESS,
        paymentStatusTypes.REJECTED,
      ),
      allowNull: false,
      defaultValue: paymentStatusTypes.PENDING,
    },
    payment_mode: {
      type: DataTypes.ENUM(
        paymentModeTypes.BANK_ACCOUNT,
        paymentModeTypes.DEBIT_CARD,
        paymentModeTypes.CREDIT_CARD,
        paymentModeTypes.GOOGLE_PAY,
        paymentModeTypes.PHONE_PAY,
        paymentModeTypes.UNKNOWN,
        paymentModeTypes.CARD,
        paymentModeTypes.APPLE_PAY,
      ),
      allowNull: false,
      defaultValue: paymentModeTypes.APPLE_PAY,
    },
    receipt_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    email_sent: {
      type: Sequelize.BOOLEAN,
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
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "payments",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

Payment.beforeUpdate((Payment) => {
  Payment.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
});

Payment.beforeDestroy((Payment) => {
  Payment.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
  Payment.is_active = false;
});

module.exports = Payment;
