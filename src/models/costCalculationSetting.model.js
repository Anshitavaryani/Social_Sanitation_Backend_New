const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class CostCalculationSetting extends Model {}

CostCalculationSetting.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    client_type: {
      type: DataTypes.ENUM("COMMERCIAL", "RESIDENTIAL"),
      allowNull: false,
    },

    item_type: {
      type: DataTypes.ENUM(
        "SQFT",
        "ROOM",
        "RESTROOM",
        "STALL",
        "KITCHEN",
        "TRASH_CAN",
        "CARPET",
        "CONCRETE",
        "VCT_LVT",
        "TILE",
      ),
      allowNull: false,
    },

    minutes_per_unit: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
    },
  },
  {
    sequelize,
    tableName: "cost_calculation_settings",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = CostCalculationSetting;
