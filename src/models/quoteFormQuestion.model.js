/** @format */
const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");
const { quoteQuestionTypes } = require("../config/types");

class QuoteFormQuestion extends Model {}

QuoteFormQuestion.init(
	{
		id: {
			type: DataTypes.INTEGER,
			autoIncrement: true,
			primaryKey: true,
		},
		question: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		type: {
			type: DataTypes.ENUM(...Object.values(quoteQuestionTypes)),
			defaultValue: quoteQuestionTypes.TEXT,
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
		tableName: "quote_form_questions",
		timestamps: true,
		underscored: true,
		paranoid: true,
	}
);

module.exports = QuoteFormQuestion;
