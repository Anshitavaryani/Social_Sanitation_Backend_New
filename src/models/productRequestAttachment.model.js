/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");

class ProductRequestAttachment extends Model {}

ProductRequestAttachment.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		product_request_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "product_requests",
				key: "id",
			},
		},
		title: {
			type: DataTypes.STRING,
			allowNull: true,
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
		tableName: "product_request_attachments",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

deactivateOnDestroy(ProductRequestAttachment);

module.exports = ProductRequestAttachment;
