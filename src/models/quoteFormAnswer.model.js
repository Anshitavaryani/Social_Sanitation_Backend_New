/** @format */
const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class QuoteFormAnswer extends Model {}

QuoteFormAnswer.init(
	{
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		quote_request_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
		user_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		question_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
		},
		answer: {
			type: DataTypes.TEXT,
			allowNull: false,
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
		tableName: "quote_form_answers",
		timestamps: true,
		underscored: true,
		paranoid: true,
	}
);

module.exports = QuoteFormAnswer;
