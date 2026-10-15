/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { leaveStatusTypes } = require("../config/types");

class Attendance extends Model {}
Attendance.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		user_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			defaultValue: null,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "users",
				key: "id",
			},
		},
		role_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			onDelete: "RESTRICT",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
		},
		clock_in: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		clock_out: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		clock_in_est: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		clock_out_est: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		total_hours: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: 0,
		},
		is_on_leave: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		leave_reason: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		leave_status: {
			type: DataTypes.ENUM,
			values: [
				leaveStatusTypes.ACCEPTED,
				leaveStatusTypes.PENDING,
				leaveStatusTypes.REJECTED,
			],
			defaultValue: leaveStatusTypes.PENDING,
		},
		leave_date: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		leave_date_est: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		clock_in_image_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_in_image_uri: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_in_image_size: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_out_image_name: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_out_image_uri: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_out_image_size: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_in_lat: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_in_lng: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_out_lat: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		clock_out_lng: {
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
		tableName: "attendances",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

Attendance.beforeUpdate(async (attendance) => {
	attendance.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

Attendance.beforeDestroy(async (attendance) => {
	attendance.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	attendance.is_active = false;
});

module.exports = Attendance;
