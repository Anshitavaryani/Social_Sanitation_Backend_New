
const { Sequelize, DataTypes, Model } = require("sequelize");
const { productRequestStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class ProductRequest extends Model {}

ProductRequest.init(
	{
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		product_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		employee_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		requested_quantity: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		status: {
			type: DataTypes.ENUM(productRequestStatusTypes.PENDING, productRequestStatusTypes.APPROVED, productRequestStatusTypes.REJECTED),
			defaultValue: productRequestStatusTypes.PENDING,
		},
		note: {
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
		tableName: "product_requests",
		timestamps: true,
		underscored: true,
        paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

ProductRequest.beforeUpdate(async (ProductRequest) => {
	ProductRequest.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

ProductRequest.beforeDestroy(async (ProductRequest) => {
	ProductRequest.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	ProductRequest.is_active = false;
});

module.exports = ProductRequest;
