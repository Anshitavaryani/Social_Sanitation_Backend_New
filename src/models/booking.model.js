/** @format */

const { Sequelize, DataTypes, Model } = require("sequelize");
const { deactivateOnDestroy } = require("./hooks");
const sequelize = require("../config/central.db");
const { bookingTypes, paymentStatusTypes } = require("../config/types");

class Booking extends Model {}
Booking.init(
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
    service_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        model: "services",
        key: "id",
      },
    },
    address_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      references: {
        model: "user_address",
        key: "id",
      },
    },
    booking_unique_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    booking_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    client_name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bdm_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM("One Time Booking", "Recurring Booking"),
      allowNull: false,
    },

    date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    time: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    date_in_utc: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    time_in_utc: {
      type: DataTypes.TIME,
      allowNull: true,
    },
    end_time_by_admin: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    address_lat: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address_long: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    google_map_link: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    booking_status: {
      type: DataTypes.ENUM,
      values: [
        bookingTypes.ACCEPTED,
        bookingTypes.PENDING,
        bookingTypes.REJECTED,
        bookingTypes.ONGOING,
        bookingTypes.SUCCESS,
        bookingTypes.CANCELLED,
      ],
      defaultValue: bookingTypes.PENDING,
    },
    calendar_event_id: {
      type: DataTypes.STRING,
      defaultValue: true,
    },
    payment_status: {
      type: DataTypes.ENUM,
      values: [
        paymentStatusTypes.SUCCESS,
        paymentStatusTypes.PENDING,
        paymentStatusTypes.REJECTED,
      ],
      defaultValue: paymentStatusTypes.PENDING,
    },
    cancellation_reason_by_user: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    cancellation_reason_by_employee: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_exception: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_recurring: {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
    },
    recurring_every: {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    recurring_type: {
      type: Sequelize.ENUM("day", "week", "month", "year"),
      allowNull: true,
      defaultValue: null,
    },
    repeat_on_days: {
      type: Sequelize.JSON, // or Sequelize.ARRAY(Sequelize.STRING) in Postgres
      allowNull: true,
    },
    recurrence_end_type: {
      type: Sequelize.ENUM("never", "after", "on_date"),
      allowNull: true,
      defaultValue: null,
    },
    recurrence_end_value: {
      type: Sequelize.STRING, // to store date as string or number (flexible)
      allowNull: true,
      defaultValue: null,
    },
    parent_booking_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    recurrence_id: {
      type: Sequelize.STRING,
      allowNull: true,
    },

    time_zone: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    late_alert_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    absent_alert_sent: {
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
    tableName: "bookings",
    timestamps: true,
    underscored: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  },
);

deactivateOnDestroy(Booking);

module.exports = Booking;
