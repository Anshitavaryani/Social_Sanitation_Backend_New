/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { bookingTypes } = require("../config/types");

class BookingDetails extends Model {}
BookingDetails.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		booking_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
		},
		booking_details_unique_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		bdm_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
		},
		address_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "user_address",
				key: "id",
			},
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
		service_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "services",
				key: "id",
			},
		},
		date: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		time: {
			type: DataTypes.TIME,
			allowNull: true,
		},
		date_in_utc: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		time_in_utc: {
			type: DataTypes.TIME,
			allowNull: true,
		},
		booking_status: {
			type: DataTypes.ENUM,
			values: [
				bookingTypes.ACCEPTED,
				bookingTypes.PENDING,
				bookingTypes.REJECTED,
				bookingTypes.ONGOING,
				bookingTypes.SUCCESS,
				bookingTypes.CANCELLED,
				bookingTypes.DELETED,
			],
			defaultValue: bookingTypes.PENDING,
		},
		service_start_time: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		service_end_time: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		cancellation_reason_by_user: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		cancellation_reason_by_employee: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		is_active: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
		calendar_event_id: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: null,
		},

		time_zone: {
			type: DataTypes.STRING(255),
			allowNull: true,
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
		tableName: "booking_details",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

BookingDetails.beforeUpdate(async (bookingDetails) => {
	bookingDetails.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});
BookingDetails.beforeDestroy(async (bookingDetails) => {
	bookingDetails.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	bookingDetails.is_active = false;
});

module.exports = BookingDetails;
