/** @format */

// One-off: attachment rows saved with a file_uri that did not resolve. Products and services
// stored "/uploads/<file>" before b386e45, hiring forms "/uploads" before 9b53b1f; images are
// served at /images. Safe to run more than once.
//
//   node src/scripts/fixFileUris.js
const sequelize = require("../config/central.db");

const FIXES = [
  ["product_attachments", "UPDATE product_attachments SET file_uri = '/images' WHERE file_uri LIKE '/uploads/%'"],
  ["service_attachments", "UPDATE service_attachments SET file_uri = '/images' WHERE file_uri LIKE '/uploads/%'"],
  ["form_attachments", "UPDATE form_attachments SET file_uri = '/images' WHERE file_uri = '/uploads'"],
];

async function run() {
  for (const [table, sql] of FIXES) {
    const [result] = await sequelize.query(sql);
    console.log(`${table}: ${result.affectedRows ?? 0} rows fixed`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fixing file_uri values failed:", err);
    process.exit(1);
  });
