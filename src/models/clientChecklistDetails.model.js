const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class ClientChecklistDetail extends Model {}

ClientChecklistDetail.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    checklist_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      references: {
        model: "client_checklists",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    service_area: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    stalls: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    sinks: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },

    restrooms: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    num_desks_trash_cans: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    flooring_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    special_requests: {
      type: DataTypes.TEXT,
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
    tableName: "client_checklist_details",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

module.exports = ClientChecklistDetail;
