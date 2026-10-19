// Audit row 20: columns and tables nothing uses any more. The Stripe customer id (Stripe was
// removed in 0e637ed), and the Google Calendar event ids and OAuth tokens (Google Calendar was
// removed in 89e2405; the login responses still send authorize/authorization, now always false).
// Skips whatever this database doesn't have. Back up the database before running it: what these
// columns and tables hold is gone afterwards.
const COLUMNS = [
  ["users", "stripe_customer_id"],
  ["bookings", "calendar_event_id"],
  ["booking_details", "calendar_event_id"],
];
const TABLES = ["user_oauths", "admin_oauths"];

module.exports = {
  async up({ queryInterface }) {
    const tables = (await queryInterface.showAllTables()).map((table) => (typeof table === "string" ? table : table.tableName));

    for (const [table, column] of COLUMNS) {
      if (!tables.includes(table)) continue;
      const columns = await queryInterface.describeTable(table);
      if (columns[column]) await queryInterface.removeColumn(table, column);
    }

    for (const table of TABLES) {
      if (tables.includes(table)) await queryInterface.dropTable(table);
    }
  },
};
