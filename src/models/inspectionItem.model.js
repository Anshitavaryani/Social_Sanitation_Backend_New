/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { inspectionReviewStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class InspectionItem extends Model {}

InspectionItem.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    inspection_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    // Original Universal Scope references
    scope_section_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    scope_item_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    // Snapshot values
    section_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    item_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    section_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    is_daily: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    is_weekly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    is_monthly: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    item_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // Employee's work
    employee_completed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },

    employee_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // BDM review
    bdm_status: {
      type: DataTypes.ENUM(inspectionReviewStatusTypes.PENDING, inspectionReviewStatusTypes.APPROVED, inspectionReviewStatusTypes.ISSUE),
      defaultValue: inspectionReviewStatusTypes.PENDING,
    },

    bdm_remark: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    bdm_reviewed_at: {
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
    tableName: "inspection_items",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = InspectionItem;
