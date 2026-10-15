/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class FormAttachment extends Model {}
FormAttachment.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		submission_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		file_type: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		file_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		file_uri: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		file_size: {
			type: DataTypes.STRING,
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
		tableName: "form_attachments",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

FormAttachment.beforeUpdate(async (FormAttachment) => {
	FormAttachment.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

FormAttachment.beforeDestroy(async (FormAttachment) => {
	FormAttachment.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	FormAttachment.is_active = false;
});

module.exports = FormAttachment;
