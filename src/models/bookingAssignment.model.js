/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class BookingAssignment extends Model {}
BookingAssignment.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		booking_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "bookings",
				key: "id",
			},
		},
		employee_id: {
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
			defaultValue: null,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
		},

		clock_out_alert_sent: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
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
		tableName: "booking_assignments",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

BookingAssignment.beforeUpdate(async (bookingAssignment) => {
	bookingAssignment.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});
BookingAssignment.beforeDestroy(async (bookingAssignment) => {
	bookingAssignment.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	bookingAssignment.is_active = false;
});

module.exports = BookingAssignment;
