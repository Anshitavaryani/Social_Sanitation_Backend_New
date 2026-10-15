/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class UserConsent extends Model {}

UserConsent.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},

		first_name: {
			type: DataTypes.STRING(50),
			allowNull: false,
		},

		last_name: {
			type: DataTypes.STRING(50),
			allowNull: false,
		},

		email: {
			type: DataTypes.STRING(100),
			allowNull: true,
			validate: {
				isEmail: true,
			},
		},

		phone_no: {
			type: DataTypes.STRING(20),
			allowNull: false,
		},

		service: {
			type: DataTypes.STRING(100),
			allowNull: false,
		},

		message: {
			type: DataTypes.TEXT,
			allowNull: true,
		},

		// ✅ Consent checkbox (main requirement)
		consent_calls: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		consent_autodialer: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		consent_marketing: {
			type: DataTypes.BOOLEAN,
			defaultValue: false,
		},
		consent_sms: {
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
		tableName: "user_consents",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	},
);

// hooks (same as your pattern)
UserConsent.beforeUpdate(async (obj) => {
	obj.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

UserConsent.beforeDestroy(async (obj) => {
	obj.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	obj.is_active = false;
});

module.exports = UserConsent;
