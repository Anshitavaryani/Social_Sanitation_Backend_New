/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const { contractStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class ServiceEstimate extends Model {}
ServiceEstimate.init(
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
    client_company_name: {
      type: DataTypes.STRING(),
      allowNull: true,
    },
    address_line_1: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    address_line_2: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    state: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    zip: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    contact_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    contact_phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    contact_fax: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    contact_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    signed_date: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    frequency: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    file_name: {
      type: DataTypes.STRING(),
      allowNull: true,
    },
    file_url: {
      type: DataTypes.STRING(),
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

    client_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        contractStatusTypes.DRAFT,
        contractStatusTypes.PENDING_SIGNATURE,
        contractStatusTypes.SIGNED,
        contractStatusTypes.DECLINED,
        contractStatusTypes.VOIDED,
        contractStatusTypes.FAILED,
      ),
      allowNull: true,
      defaultValue: contractStatusTypes.DRAFT,
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    scope_sections: {
      type: DataTypes.JSON,
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
      onUpdate: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "service_estimates",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

deactivateOnDestroy(ServiceEstimate);

module.exports = ServiceEstimate;
