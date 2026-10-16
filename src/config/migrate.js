// npm run migrate: applies, in file-name order, the migrations in src/migrations this database has
// not run yet, and records each in its SequelizeMeta table (the table sequelize-cli and umzug use,
// so either could take over). npm run migrate -- --status lists applied and pending ones.
// A migration exports up({ sequelize, queryInterface }).
const fs = require("fs");
const path = require("path");
const { DataTypes } = require("sequelize");
const sequelize = require("./central.db");

const MIGRATIONS_DIR = path.join(__dirname, "../migrations");

const Meta = sequelize.define(
  "SequelizeMeta",
  { name: { type: DataTypes.STRING, primaryKey: true, allowNull: false } },
  { tableName: "SequelizeMeta", timestamps: false },
);

const migrationNames = () =>
  fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".js"))
    .sort();

const status = async () => {
  await Meta.sync();
  const applied = (await Meta.findAll({ order: [["name", "ASC"]] })).map((row) => row.name);
  return { applied, pending: migrationNames().filter((name) => !applied.includes(name)) };
};

const up = async () => {
  const { pending } = await status();
  for (const name of pending) {
    await require(path.join(MIGRATIONS_DIR, name)).up({ sequelize, queryInterface: sequelize.getQueryInterface() });
    await Meta.create({ name });
  }
  return pending;
};

if (require.main === module) {
  const run = async () => {
    if (process.argv.includes("--status")) {
      const { applied, pending } = await status();
      console.log("applied:", applied.join(", ") || "none");
      console.log("pending:", pending.join(", ") || "none");
      return;
    }
    const applied = await up();
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "the database is up to date");
  };
  run()
    .then(() => sequelize.close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}

module.exports = { status, up, Meta };
