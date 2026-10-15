const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class AdminOAuth extends Model {}
AdminOAuth.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},
		admin_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: false,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "admins",
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
		tableName: "admin_oauths",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

AdminOAuth.beforeUpdate(async (adminOAuth) => {
	adminOAuth.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

AdminOAuth.beforeDestroy(async (adminOAuth) => {
	adminOAuth.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	adminOAuth.is_active = false;
});

module.exports = AdminOAuth;
