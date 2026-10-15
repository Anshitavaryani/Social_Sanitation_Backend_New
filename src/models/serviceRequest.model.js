/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class ServiceRequest extends Model {}

ServiceRequest.init(
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
    service_days: {
      type: DataTypes.STRING,
      allowNull: true,
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
      // defaultValue: 0,
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
      type: DataTypes.ENUM("NOT_BOOKED", "BOOKED", "EXPIRED"),
      defaultValue: "NOT_BOOKED",
    },
    payment_status: {
      type: DataTypes.ENUM("NOT_PAID", "PAID", "CASH_PAID"),
      defaultValue: "NOT_PAID",
    },

    square_payment_link_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    docusign_envelope_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    signed_file_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("DRAFT", "SAVED", "SIGNED"),
      defaultValue: "DRAFT",
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
    tableName: "service_requests",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

ServiceRequest.beforeUpdate(async (request) => {
  request.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
});

ServiceRequest.beforeDestroy(async (request) => {
  request.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/, "");
  request.is_active = false;
});

module.exports = ServiceRequest;
