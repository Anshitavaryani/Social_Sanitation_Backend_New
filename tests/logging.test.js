// The app logs through src/config/logger.js (time, level, pm2 keeps it); console is left to the
// command-line scripts. Errors are logged as their stack only.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

// npm run auth / migrate / seed and the index script print to the terminal on purpose
const COMMAND_LINE = [/^src\/scripts\//, /^src\/seeders\//, /^src\/config\/createSuperAdmin\.js$/, /^src\/config\/migrate\.js$/];

const consoleUses = (file) => {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "MemberExpression" && node.object.name === "console") found.push(`${node.loc.start.line} console.${node.property.name}`);
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  visit(espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", loc: true }));
  return found;
};

const sourceFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["uploads", "dumps", "assets"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "public")), path.join(ROOT, "app.js"), path.join(ROOT, "index.js")];
};

test("only the command-line scripts use console; the app uses the logger", () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (COMMAND_LINE.some((pattern) => pattern.test(relative))) continue;
    for (const use of consoleUses(file)) offenders.push(`${relative}:${use}`);
  }
  assert.deepEqual(offenders, [], "use src/config/logger.js");
});

test("the logger writes like console, an error as its stack only, and is silent in tests", () => {
  const { spawnSync } = require("child_process");
  const script = `
    process.env.NODE_ENV = "production";
    delete process.env.LOG_LEVEL;
    const logger = require(${JSON.stringify(path.join(ROOT, "src/config/logger.js"))});
    const error = Object.assign(new Error("Duplicate entry"), { sql: "INSERT INTO users (email) VALUES ('jane@example.com')" });
    logger.error("Insert failed:", error);
    logger.info("Invoice %s sent", "RHK12");
    logger.debug("not in production");
  `;
  const run = spawnSync(process.execPath, ["-r", path.join(ROOT, "tests/helpers/env.js"), "-e", script], { encoding: "utf8" });
  const output = run.stdout + run.stderr;
  assert.match(output, /error: Insert failed: Error: Duplicate entry\n\s+at /);
  assert.match(output, /info: Invoice RHK12 sent/);
  assert.doesNotMatch(output, /jane@example\.com/, "the SQL with customer data stays out");
  assert.doesNotMatch(output, /not in production/);
});
