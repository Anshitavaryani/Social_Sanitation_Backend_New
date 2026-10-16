/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");

class ServiceChecklistHeading extends Model {}
ServiceChecklistHeading.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		role_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		title: {
			type: DataTypes.STRING,
			allowNull: false,
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
		tableName: "service_checklist_headings",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

deactivateOnDestroy(ServiceChecklistHeading);

module.exports = ServiceChecklistHeading;
