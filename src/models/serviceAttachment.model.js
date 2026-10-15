const { Sequelize, DataTypes, Model } = require('sequelize');
const sequelize = require('../config/central.db');

class ServiceAttachment extends Model { };

ServiceAttachment.init({
    id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    service_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        references: {
            model: 'services',
            key: 'id',
        },
    },
    title: {
        type: DataTypes.STRING,
        allowNull: true
    },
    file_type: {
        type: DataTypes.STRING,
        allowNull: true
    },
    file_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    file_uri: {
        type: DataTypes.STRING,
        allowNull: true
    },
    file_size: {
        type: DataTypes.STRING,
        allowNull: true
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
    tableName: 'service_attachments',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
})

ServiceAttachment.beforeUpdate(async (serviceAttachment) => {
    serviceAttachment.updated_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
});

ServiceAttachment.beforeDestroy(async (serviceAttachment) => {
    serviceAttachment.deleted_at = new Date().toISOString().replace(/T/, ' ').replace(/\..+/g, '');
    serviceAttachment.is_active = false;
});

module.exports = ServiceAttachment;
