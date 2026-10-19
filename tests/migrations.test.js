// npm run migrate applies versioned migrations (src/migrations) once per database. It used to run
// sequelize.sync({ alter: true }), which can drop or rewrite columns.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { sequelize } = mockDatabase();
const syncCalls = [];
sequelize.sync = async (options) => syncCalls.push(options ?? null);

const migrate = loadFromRoot("src/config/migrate.js");
const recorded = [];
let applied = [];
migrate.Meta.sync = async () => {};
migrate.Meta.findAll = async () => applied.map((name) => ({ name }));
migrate.Meta.create = async ({ name }) => recorded.push(name);

const migrationFiles = fs.readdirSync(path.join(ROOT, "src/migrations")).filter((name) => name.endsWith(".js")).sort();

test("pending migrations run in file-name order and are recorded; applied ones are skipped", async () => {
  applied = [];
  recorded.length = 0;
  syncCalls.length = 0;
  assert.deepEqual((await migrate.status()).pending, migrationFiles);
  assert.deepEqual(await migrate.up(), migrationFiles);
  assert.deepEqual(recorded, migrationFiles);

  applied = migrationFiles;
  recorded.length = 0;
  assert.deepEqual(await migrate.up(), []);
  assert.deepEqual(recorded, []);
});

test("the baseline creates missing tables and alters nothing", async () => {
  syncCalls.length = 0;
  await loadFromRoot("src/migrations/20261016-000-baseline.js").up({ sequelize });
  assert.deepEqual(syncCalls, [null], "sync() with no options: CREATE TABLE IF NOT EXISTS only");
});

test("nothing calls sync({ alter: true }) any more", () => {
  const offenders = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (entry.name.endsWith(".js") && /\.sync\(\s*\{[^}]*alter\s*:\s*true/.test(fs.readFileSync(full, "utf8").replace(/\/\/.*$/gm, ""))) {
        offenders.push(path.relative(ROOT, full));
      }
    });
  walk(path.join(ROOT, "src"));
  assert.deepEqual(offenders, []);
});

test("the unused Stripe and Google Calendar columns and tables are dropped where they exist", async () => {
  const calls = [];
  const queryInterface = {
    showAllTables: async () => ["users", "bookings", "user_oauths"],
    describeTable: async (table) => (table === "users" ? { id: {}, stripe_customer_id: {} } : { id: {} }),
    removeColumn: async (...args) => calls.push(["removeColumn", ...args]),
    dropTable: async (table) => calls.push(["dropTable", table]),
  };
  await loadFromRoot("src/migrations/20261019-001-remove-unused-columns.js").up({ sequelize, queryInterface });
  assert.deepEqual(calls, [
    ["removeColumn", "users", "stripe_customer_id"],
    ["dropTable", "user_oauths"],
  ], "bookings has no calendar_event_id here, booking_details and admin_oauths don't exist: skipped");
});
