const { Sequelize, DataTypes, Model, ENUM } = require('sequelize');
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require('../config/central.db');
const { otpTypes } = require('../config/types');
const { OTP_RULES } = require('../config/rules');

class OTP extends Model { }
OTP.init({
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    email: {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    role_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        onDelete:'RESTRICT',
        onUpdate: 'CASCADE',
        references: {
            model: 'roles',
            key: 'id',
        },
    },
    user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        references: {
            model: 'users',
            key: 'id',
        },
    },
    dialing_code: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    mobile: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    code: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    type: {
        type: ENUM,
        values: [ otpTypes.EMAIL_VERIFICATION, otpTypes.FORGOT_PASSWORD, otpTypes.MOBILE_VERIFICATION, otpTypes.RESET_PASSWORD ],
        allowNull: false,
        defaultValue: otpTypes.EMAIL_VERIFICATION
    },
    otp_expiration_time: {
        type: DataTypes.DATE,
        allowNull: false
    },
    is_verified: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
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
    tableName: 'otps',
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at'
});

// A new code is valid for 5 minutes. Later saves keep the expiry the row has (they used to push it
// 5 minutes ahead on every save), so verifying a forgot-password code can give the reset token
// its own lifetime.
OTP.beforeValidate(async (OTP) => {
    if (!OTP.isNewRecord || OTP.otp_expiration_time) return;
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + OTP_RULES.APP_CODE_MINUTES);
    OTP.otp_expiration_time = expirationTime;
});

deactivateOnDestroy(OTP);

module.exports = OTP;
