const { Sequelize, DataTypes, Model } = require('sequelize');
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require('../config/central.db');


class ReviewLink extends Model { }
ReviewLink.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    apple_review_link: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    google_review_link: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    booking_review_link: {
        type: DataTypes.STRING(255),
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
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
}, {
    sequelize,
    tableName: 'review_links',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});


deactivateOnDestroy(ReviewLink);

module.exports = ReviewLink;
