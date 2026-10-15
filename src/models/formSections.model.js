/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class FormSection extends Model {}
FormSection.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		submission_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			defaultValue: null,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "form_submissions",
				key: "id",
			},
		},
        section_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
        data: {
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
		tableName: "form_sections",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

FormSection.beforeUpdate(async (FormSection) => {
	FormSection.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});
FormSection.beforeDestroy(async (FormSection) => {
	FormSection.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	FormSection.is_active = false;
});

module.exports = FormSection;
