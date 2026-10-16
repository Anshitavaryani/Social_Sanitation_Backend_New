/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const { contractStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class ContractAgreement extends Model {}

ContractAgreement.init(
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
    client_legal_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    client_representative: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    service_address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    total_monthly_price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },

    contract_date: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    client_name: {
      type: DataTypes.STRING(),
      allowNull: true,
    },

    client_email: {
      type: DataTypes.STRING(),
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

    status: {
      type: DataTypes.ENUM(
        contractStatusTypes.DRAFT,
        contractStatusTypes.PENDING_SIGNATURE,
        contractStatusTypes.SIGNED,
        contractStatusTypes.DECLINED,
        contractStatusTypes.VOIDED,
        contractStatusTypes.FAILED,
      ),
      defaultValue: contractStatusTypes.DRAFT,
    },

    payment_url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    signature: {
      type: DataTypes.TEXT,
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
    tableName: "contract_agreements",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

deactivateOnDestroy(ContractAgreement);

module.exports = ContractAgreement;
