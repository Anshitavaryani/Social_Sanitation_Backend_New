/** @format */
const { Sequelize, DataTypes, Model } = require("sequelize");
const { quoteRequestStatusTypes } = require("../config/types");
const sequelize = require("../config/central.db");

class QuoteRequest extends Model {}

QuoteRequest.init(
	{
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		user_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		status: {
			type: DataTypes.ENUM(quoteRequestStatusTypes.PENDING, quoteRequestStatusTypes.ACCEPTED, quoteRequestStatusTypes.REJECTED),
			defaultValue: quoteRequestStatusTypes.PENDING,
		},
		quoted_price: {
			type: DataTypes.FLOAT,
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
		tableName: "quote_requests",
		timestamps: true,
		underscored: true,
		paranoid: true,
	}
);

module.exports = QuoteRequest;
