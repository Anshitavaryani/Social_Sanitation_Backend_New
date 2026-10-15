/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const sequelize = require("../config/central.db");

class Break extends Model {}
Break.init(
	{
		id: {
			type: DataTypes.BIGINT.UNSIGNED,
			autoIncrement: true,
			primaryKey: true,
		},

		user_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
			defaultValue: null,
			onDelete: "CASCADE",
			onUpdate: "CASCADE",
			references: {
				model: "users",
				key: "id",
			},
		},
		role_id: {
			type: DataTypes.INTEGER,
			allowNull: true,
			onDelete: "RESTRICT",
			onUpdate: "CASCADE",
			references: {
				model: "roles",
				key: "id",
			},
		},
		attendance_id: {
			type: DataTypes.BIGINT.UNSIGNED,
			allowNull: true,
		},
		break_start: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		break_end: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		break_start_est: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		break_end_est: {
			type: DataTypes.DATE,
			allowNull: true,
		},
		duration_minutes: {
			type: DataTypes.STRING,
			allowNull: true,
			defaultValue: 0,
		},
		status: {
			type: DataTypes.ENUM("active", "completed"),
			defaultValue: "active",
		},
		break_start_lat: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		break_start_lng: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		break_end_lat: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		break_end_lng: {
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
		tableName: "breaks",
		timestamps: true,
		underscored: true,
		paranoid: true,
		createdAt: "created_at",
		updatedAt: "updated_at",
		deletedAt: "deleted_at",
	}
);

Break.beforeUpdate(async (Break) => {
	Break.updated_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
});

Break.beforeDestroy(async (Break) => {
	Break.deleted_at = new Date()
		.toISOString()
		.replace(/T/, " ")
		.replace(/\..+/g, "");
	Break.is_active = false;
});

module.exports = Break;
