const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Service extends Model {}
Service.init(
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    abbreviation: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // name_in_es: {
    //   type: DataTypes.STRING(50),
    //   allowNull: true,
    // },
    // abbreviation_in_es: {
    //   type: DataTypes.STRING(50),
    //   allowNull: true,
    // },
    // description_in_es: {
    //   type: DataTypes.TEXT,
    //   allowNull: true,
    // },
    // name_in_en: {
    //   type: DataTypes.STRING(50),
    //   allowNull: true,
    // },
    // abbreviation_in_en: {
    //   type: DataTypes.STRING(50),
    //   allowNull: true,
    // },
    // description_in_en: {
    //   type: DataTypes.TEXT,
    //   allowNull: true,
    // },
    price: {
     type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
    },
    average_rating: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 0,
    },
    rating: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: 0,
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
    tableName: "services",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

Service.beforeUpdate(async (service) => {
  service.updated_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
});
Service.beforeDestroy(async (service) => {
  service.deleted_at = new Date()
    .toISOString()
    .replace(/T/, " ")
    .replace(/\..+/g, "");
  service.is_active = false;
});

module.exports = Service;
