/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class InspectionItemImage extends Model {}

InspectionItemImage.init(
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

        inspection_item_id: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        // User/employee/BDM who uploaded the image
        uploaded_by: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
        },

        uploaded_by_role: {
            type: DataTypes.ENUM(
                "EMPLOYEE",
                "BDM"
            ),
            allowNull: false,
        },

        // Actual stored image path/url
        image: {
            type: DataTypes.STRING,
            allowNull: false,
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
        tableName: "inspection_item_images",
        timestamps: true,
        underscored: true,
        paranoid: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        deletedAt: "deleted_at",
    },
);

module.exports = InspectionItemImage;