/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class ScopeItem extends Model {}

ScopeItem.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		section_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		description: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		is_daily: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		is_weekly: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		is_monthly: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		order: {
			type: DataTypes.INTEGER,
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
		tableName: "scope_items",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	},
);

module.exports = ScopeItem;