/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class FormSubmission extends Model {}
FormSubmission.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    language: {
      type: DataTypes.ENUM("english", "spanish"),
      allowNull: false,
    },
    applicant_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    pdf_url: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
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
    tableName: "form_submissions",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

FormSubmission.beforeUpdate(async (FormSubmission) => {
  FormSubmission.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
});
FormSubmission.beforeDestroy(async (FormSubmission) => {
  FormSubmission.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
  FormSubmission.is_active = false;
});

module.exports = FormSubmission;
