/** @format */

/**
 * INDEX MIGRATION — bookings table
 * ------------------------------------------------------------------
 * Run this AFTER cleanupErroneousFutureBookings.js has finished.
 * Building indexes on a table with hundreds of thousands of junk rows
 * first would be slower and would index data you're about to delete
 * anyway.
 *
 * Rationale for each index, tied to actual query patterns already in
 * your codebase:
 *
 *  - idx_bookings_date
 *      Dashboard "upcoming scheduled bookings" (next 7 days) and any
 *      date-range filtering. This is the single most impactful index
 *      given how the table has been queried so far.
 *
 *  - idx_bookings_recurrence_id
 *      updateRecurringBookingWithEditMode looks up
 *      `WHERE recurrence_id = ...` for every "following"/"all" edit —
 *      currently a full table scan without this.
 *
 *  - idx_bookings_user_id
 *      Per-client booking lookups (GetUpcomingScheduledBookings,
 *      booking history per user, etc).
 *
 *  - idx_bookings_bdm_id
 *      BDM-scoped booking lists.
 *
 *  - idx_bookings_status_date (composite)
 *      Dashboard/attendance queries that filter by booking_status AND
 *      a date range together (e.g. late/absent, live-working,
 *      accepted-and-upcoming) benefit more from a composite index here
 *      than from two separate single-column indexes.
 *
 * Run with:
 *   node scripts/addBookingIndexes.js
 *
 * (Plain script using sequelize.query rather than a sequelize-cli
 * migration, since I don't know if this project uses migrations —
 * if it does, move the queryInterface.addIndex calls below into a
 * proper migration file instead of running this directly.)
 */

const sequelize = require("../config/central.db");

async function addIndexIfMissing(indexName, sql) {
  const [existing] = await sequelize.query(
    `SHOW INDEX FROM bookings WHERE Key_name = '${indexName}'`,
  );

  if (existing.length > 0) {
    console.log(`Skipping ${indexName} — already exists.`);
    return;
  }

  console.log(`Creating ${indexName}...`);
  await sequelize.query(sql);
  console.log(`✅ ${indexName} created.`);
}


async function run() {
  await addIndexIfMissing(
    "idx_bookings_date",
    "CREATE INDEX idx_bookings_date ON bookings (date)",
  );

  await addIndexIfMissing(
    "idx_bookings_recurrence_id",
    "CREATE INDEX idx_bookings_recurrence_id ON bookings (recurrence_id)",
  );

  await addIndexIfMissing(
    "idx_bookings_user_id",
    "CREATE INDEX idx_bookings_user_id ON bookings (user_id)",
  );

  await addIndexIfMissing(
    "idx_bookings_bdm_id",
    "CREATE INDEX idx_bookings_bdm_id ON bookings (bdm_id)",
  );

  await addIndexIfMissing(
    "idx_bookings_status_date",
    "CREATE INDEX idx_bookings_status_date ON bookings (booking_status, date)",
  );

  console.log("✅ Done adding indexes.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Index migration failed:", err);
    process.exit(1);
  });
