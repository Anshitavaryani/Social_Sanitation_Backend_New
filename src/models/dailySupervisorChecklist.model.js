const { Sequelize, DataTypes, Model } = require('sequelize');
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require('../config/central.db');

class DailySupervisorChecklist extends Model { };
DailySupervisorChecklist.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    service_checklist_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        references: {
            model: 'daily_checklist',
            key: 'id',
        },
    },
    employee_id: {
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
    is_completed: {
		type: DataTypes.BOOLEAN,
		defaultValue: false,
	},
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        onUpdate: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
    }
}, {
    sequelize,
    tableName: 'daily_supervisor_checklist',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
})

deactivateOnDestroy(DailySupervisorChecklist);

module.exports = DailySupervisorChecklist;
