const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class ServiceRequestQuoteItem extends Model {}

ServiceRequestQuoteItem.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		service_request_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		description: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		frequency: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		quantity: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		unit_price: {
			type: DataTypes.DECIMAL(15, 6),
			allowNull: false,
		},
		amount: {
			type: DataTypes.DECIMAL(15, 6),
			allowNull: false,
		},
		created_at: {
			type: DataTypes.DATE,
			defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
		},
		updated_at: {
			type: DataTypes.DATE,
			defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
		},
	},
	{
		sequelize,
		tableName: "service_request_quote_items",
		timestamps: true,
		underscored: true,
	}
);

module.exports = ServiceRequestQuoteItem;
