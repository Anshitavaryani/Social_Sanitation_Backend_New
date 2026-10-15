const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class UserOAuth extends Model {}
UserOAuth.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		role_id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			onDelete: "RESTRICT",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
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
		refresh_token: {
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
		tableName: "user_oauths",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

UserOAuth.beforeUpdate(async (userOAuth) => {
	userOAuth.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

UserOAuth.beforeDestroy(async (userOAuth) => {
	userOAuth.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	userOAuth.is_active = false;
});

module.exports = UserOAuth;
