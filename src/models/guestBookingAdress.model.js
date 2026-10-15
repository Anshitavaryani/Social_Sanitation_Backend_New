/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class GuestBookingAddress extends Model {}

GuestBookingAddress.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		booking_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		address_lat: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		address_long: {
			type: DataTypes.STRING,
			allowNull: true,
		},

		address: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
		country_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			defaultValue: 233,
		},
		state_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		city_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
		},
		google_map_link: {
			type: DataTypes.TEXT,
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
		tableName: "guest_booking_address",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

GuestBookingAddress.beforeUpdate(async (GuestBookingAddress) => {
	GuestBookingAddress.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

GuestBookingAddress.beforeDestroy(async (GuestBookingAddress) => {
	GuestBookingAddress.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	GuestBookingAddress.is_active = false;
});

module.exports = GuestBookingAddress;
