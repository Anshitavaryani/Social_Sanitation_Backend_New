/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Inspection extends Model {}

Inspection.init(
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

    // BDM who created/reviews the inspection
    bdm_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    // Employee assigned to perform the inspection
    employee_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    // Name for easy identification
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Actual inspection date
    inspection_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM(
        "ASSIGNED",
        "IN_PROGRESS",
        "SUBMITTED",
        "UNDER_REVIEW",
        "COMPLETED",
        "REOPENED",
        "CANCELLED",
      ),
      defaultValue: "ASSIGNED",
    },

    reopen_count: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    reopened_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Final BDM score
    score: {
      type: DataTypes.TINYINT.UNSIGNED,
      allowNull: true,
    },

    // Final BDM overall comment
    overall_remark: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    started_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    employee_submitted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    bdm_completed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    // Client report/email tracking
    client_email_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    client_email_sent_at: {
      type: DataTypes.DATE,
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

    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "inspections",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = Inspection;
