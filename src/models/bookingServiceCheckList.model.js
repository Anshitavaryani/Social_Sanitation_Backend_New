const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class BookingServiceChecklist extends Model { };
BookingServiceChecklist.init({
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
            model: 'service_checklist',
            key: 'id',
        },
    },
    booking_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
    },
    is_completed: {
		type: DataTypes.BOOLEAN,
		defaultValue: false,
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
    tableName: 'booking_service_checklist',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
})

BookingServiceChecklist.beforeUpdate(async (BookingServiceChecklist) => {
    BookingServiceChecklist.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

BookingServiceChecklist.beforeDestroy(async (BookingServiceChecklist) => {
    BookingServiceChecklist.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    BookingServiceChecklist.is_active = false;
});

module.exports = BookingServiceChecklist;
