/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");
const { notificationTypes } = require("../config/types");


class Notification extends Model {}
Notification.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		user_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "users",
				key: "id",
			},
		},
		role_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
		},
		title: {
			type: DataTypes.STRING(),
			allowNull: true,
		},
		notification: {
			type: DataTypes.STRING(),
			allowNull: true,
		},
		notification_types: {
			type: DataTypes.ENUM,
			values: [
				notificationTypes.SERVICE_BOOKED,
				notificationTypes.BOOKING_ACCEPTED,
				notificationTypes.SERVICE_ASSIGNED,
				notificationTypes.BOOKING_REJECTED,
				notificationTypes.BOOKING_COMPLETED,
				notificationTypes.BOOKING_STARTED,
				notificationTypes.ORDER_PLACED,
				notificationTypes.ORDER_ACCEPTED,
				notificationTypes.ORDER_DELIVERED,
				notificationTypes.ORDER_SHIPPED,
				notificationTypes.CHAT_MESSAGE,
			],
			defaultValue: notificationTypes.CHAT_MESSAGE,
		},
		is_active: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},

		is_admin_read: {
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
		tableName: "notifications",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

deactivateOnDestroy(Notification);

module.exports = Notification;
