/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");

class AttendancePayroll extends Model {}

AttendancePayroll.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},

		attendance_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "attendances",
				key: "id",
			},
		},

		pay_per_day: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0.0,
		},

		bonus: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0.0,
		},

		total_amount: {
			type: DataTypes.DECIMAL(10, 2),
			allowNull: true,
			defaultValue: 0.0,
		},

		is_manual: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},

		notes: {
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
		tableName: "attendance_payrolls",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

/* 🔁 Hooks (same pattern as Attendance) */
deactivateOnDestroy(AttendancePayroll);

module.exports = AttendancePayroll;
