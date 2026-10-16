/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");
const { reportTypes } = require("../config/types");

class Report extends Model {}
Report.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
        report_type: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		reported_by: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "users",
				key: "id",
			},
		},
		reported_to: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "users",
				key: "id",
			},
		},
		reporter_role_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			onDelete: "RESTRICT",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
		},
        reported_role_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			onDelete: "RESTRICT",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
		},
		booking_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
		},
		report_reason: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		status: {
			type: DataTypes.ENUM,
			values: [
				reportTypes.ACCEPTED,
				reportTypes.PENDING,
				reportTypes.COMPLETED,
			],
			defaultValue: reportTypes.PENDING,
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
		tableName: "reports",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

deactivateOnDestroy(Report);

module.exports = Report;
