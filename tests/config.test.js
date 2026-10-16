// Configuration, project files and the real Sequelize model definitions (no DB connection).
require("./helpers/env");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, ENTRY_FILES, loadFromRoot } = require("./helpers/mocks");

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

let sequelize;
after(async () => {
  if (sequelize) await sequelize.close();
});

test("the database connection uses CENTRAL_MYSQL_PORT", () => {
  // Never authenticate against a real server from tests
  const { Sequelize } = require(require.resolve("sequelize", { paths: [ROOT] }));
  const originalAuthenticate = Sequelize.prototype.authenticate;
  Sequelize.prototype.authenticate = async () => {};
  try {
    sequelize = loadFromRoot("src/config/central.db.js");
  } finally {
    Sequelize.prototype.authenticate = originalAuthenticate;
  }
  assert.equal(sequelize.config.port, 3999);
  assert.equal(sequelize.config.host, "127.0.0.1");
});

test("Chrome path for PDFs defaults to the current server binary and can be overridden", () => {
  const config = loadFromRoot("src/config/config.js");
  assert.equal(
    config.PUPPETEER_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH ||
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
  );
});

test("npm scripts point at files that exist", () => {
  for (const script of ["start", "staging"]) {
    const configFile = pkg.scripts[script].match(/pm2 start (\S+)/)[1];
    assert.ok(fs.existsSync(path.join(ROOT, configFile)), `${script}: ${configFile} is missing`);
  }
  for (const script of ["auth", "migrate"]) {
    const file = pkg.scripts[script].match(/node (\S+)/)[1];
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${script}: ${file} is missing`);
  }
});

test("removed and deprecated packages stay out of package.json", () => {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const name of [
    "stripe",
    "googleapis",
    "firebase",
    "randomatic",
    "puppeteer",
    "socket.io",
    "passport",
    "express-jwt",
    "body-parser",
    "cookie-parser",
    "isomorphic-fetch",
    "uuid",
    "swagger-jsdoc",
    "swagger-ui-express",
    "nodemailer",
  ]) {
    assert.equal(deps[name], undefined, `${name} should not be a dependency`);
  }
  assert.match(pkg.engines.node, /^>=22\.12/);
});

test("no source file requires a package that is not installed as a dependency", () => {
  const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const builtins = new Set(require("module").builtinModules);
  const missing = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["uploads", "node_modules"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  for (const file of [...walk(path.join(ROOT, "src")), ...ENTRY_FILES]) {
    const source = fs.readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(/require\(\s*["']([^"'.][^"']*)["']\s*\)/g)) {
      const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
      if (!deps.has(name) && !builtins.has(name.replace(/^node:/, ""))) {
        missing.push(`${path.relative(ROOT, file)} -> ${spec}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("every include alias used by the services exists on the real models", () => {
  const { Sequelize } = require(require.resolve("sequelize", { paths: [ROOT] }));
  const originalAuthenticate = Sequelize.prototype.authenticate;
  Sequelize.prototype.authenticate = async () => {};
  let models;
  try {
    models = loadFromRoot("src/models/index.js");
  } finally {
    Sequelize.prototype.authenticate = originalAuthenticate;
  }

  assert.equal(models.BookingDetails, undefined, "legacy booking_details model is not loaded");
  assert.ok(models.Booking.rawAttributes.booking_status);
  assert.ok(models.InspectionItemImage.associations.item, "InspectionItemImage -> item");
  assert.ok(models.InspectionItem.associations.inspection, "InspectionItem -> inspection");

  // Collect `model: X, as: "alias"` pairs from service and controller includes
  const broken = [];
  const dirs = ["src/services", "src/controllers"].map((d) => path.join(ROOT, d));
  const files = dirs.flatMap(function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : [],
    );
  });
  const targets = new Map(); // alias -> set of target model names that define it
  // Every model registered on the connection, including ones index.js does not export
  for (const model of Object.values(models.Booking.sequelize.models)) {
    for (const [alias, association] of Object.entries(model.associations)) {
      if (!targets.has(alias)) targets.set(alias, new Set());
      targets.get(alias).add(association.target.name);
    }
  }
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/model:\s*([A-Za-z_]+),\s*as:\s*["']([^"']+)["']/g)) {
      const [, modelVar, alias] = match;
      const model = models[modelVar];
      if (!model) continue; // imported under a different name; not checked here
      const ok = targets.has(alias) && targets.get(alias).has(model.name);
      if (!ok) {
        const line = source.slice(0, match.index).split("\n").length;
        broken.push(`${path.relative(ROOT, file)}:${line} ${modelVar} as "${alias}"`);
      }
    }
  }
  assert.deepEqual(broken, []);
});
