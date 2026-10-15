/** @format */


/**
 * ONE-OFF CLEANUP SCRIPT
 * ------------------------------------------------------------------
 * Deletes all bookings dated between 2026-10-01 and 2217-12-31
 * (inclusive), along with their related child records.
 *
 * These bookings were created erroneously by the old
 * `recurrence_end_type === "never"` logic in createRecurringBookings /
 * createRecurringGuestBookings, which set a synthetic end date 10 years
 * in the future as a "safety net" — but repeated edits to recurring
 * series (edit_mode "following"/"all") re-run that generation logic
 * each time, which appears to have compounded far past the intended
 * 10-year cap.
 *
 * This is a HARD DELETE (force: true) — not recoverable via the
 * paranoid soft-delete. Runs immediately, no dry run / confirmation
 * step.
 *
 * USAGE:
 *   node scripts/cleanupErroneousFutureBookings.js
 */

const { Op } = require("sequelize");
const sequelize = require("../config/central.db");
const {
  Booking,
  BookingAssignment,
  BookingAttachment,
  GuestBookingAddress,
  Payment,
  Report,
} = require("../models"); // adjust path if your models index lives elsewhere

const RANGE_START = "2026-10-01 00:00:00";
const RANGE_END = "2217-12-31 23:59:59";
const BATCH_SIZE = 2000;

async function getNextBatchOfIds() {
  const rows = await Booking.findAll({
    attributes: ["id"],
    where: {
      date: { [Op.gte]: RANGE_START, [Op.lte]: RANGE_END },
    },
    paranoid: false,
    limit: BATCH_SIZE,
    raw: true,
  });
  return rows.map((r) => r.id);
}

async function deleteBatch(ids) {
  return sequelize.transaction(async (t) => {
    // child tables first, to avoid FK issues / orphaned rows
    await BookingAssignment.destroy({
      where: { booking_id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });

    await BookingAttachment.destroy({
      where: { booking_id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });

    await GuestBookingAddress.destroy({
      where: { booking_id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });

    // Payment / Report may or may not be paranoid models — force:true is
    // simply ignored by Sequelize if the model isn't paranoid, so this is
    // safe either way.
    await Payment.destroy({
      where: { booking_id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });

    await Report.destroy({
      where: { booking_id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });

    // finally, the bookings themselves
    await Booking.destroy({
      where: { id: { [Op.in]: ids } },
      force: true,
      transaction: t,
    });
  });
}

async function run() {
  let totalDeleted = 0;

  while (true) {
    const ids = await getNextBatchOfIds();
    if (ids.length === 0) break;

    await deleteBatch(ids);
    totalDeleted += ids.length;

    console.log(`Deleted ${totalDeleted} booking(s) so far...`);
  }

  console.log(`✅ Done. Total bookings deleted: ${totalDeleted}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Cleanup script failed:", err);
    process.exit(1);
  });