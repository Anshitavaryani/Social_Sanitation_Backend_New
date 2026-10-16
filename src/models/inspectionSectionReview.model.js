/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { inspectionReviewStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class InspectionSectionReview extends Model {}

InspectionSectionReview.init(
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

    // Original scope section reference
    scope_section_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    // Snapshot so the review remains understandable
    // even if the original scope section changes later.
    section_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    section_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },

    // Calculated from inspection_items
    total_items: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    completed_items: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
    },

    // BDM section review
    status: {
      type: DataTypes.ENUM(inspectionReviewStatusTypes.PENDING, inspectionReviewStatusTypes.APPROVED, inspectionReviewStatusTypes.ISSUE),
      allowNull: false,
      defaultValue: inspectionReviewStatusTypes.PENDING,
    },

    // Score is the number of completed items in this section.
    // Example: 12 completed out of 14 => score = 12.
    score: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },

    remark: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reviewed_by: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    reviewed_at: {
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
    tableName: "inspection_section_reviews",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = InspectionSectionReview;