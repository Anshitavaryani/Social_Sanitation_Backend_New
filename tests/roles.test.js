// Role ids have one source, src/config/roles.js: every other file names roles (ROLE.CLIENT,
// EMPLOYEE_ROLE_IDS, ...) instead of writing their numbers.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, loadFromRoot } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const roles = loadFromRoot("src/config/roles.js");

test("role ids and groups match the roles table", () => {
  const { ROLE } = roles;
  assert.deepEqual(
    [ROLE.SUPER_ADMIN, ROLE.ADMIN, ROLE.OPERATIONS_ADMIN, ROLE.BDM, ROLE.CLIENT],
    [1, 2, 3, 5, 6],
  );
  assert.deepEqual([...roles.EMPLOYEE_ROLE_IDS], [7, 8, 9, 10, 11], "every role from supervisor to housekeeping is an employee");
  assert.deepEqual([...roles.BOOKING_ROLE_IDS], [7, 8, 9]);
  assert.deepEqual([...roles.APP_USER_ROLE_IDS], [6, 7, 8, 9, 10, 11]);
  assert.deepEqual([...roles.TEAM_CHAT_ADMIN_ROLE_IDS], [1, 3, 5], "admins (role 2) are not part of team chat");
  assert.equal(roles.ROLE_NAMES[ROLE.OPERATIONS_ADMIN], "Operations Administrator");
  assert.equal(roles.ROLE_NAMES[ROLE.HOUSEKEEPING], "Housekeeping");
});

const ROLE_KEYS = new Set(["role_id", "roleId", "sub_role_id"]);
const nameOf = (node) => {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) return node.property.name;
  if (node.type === "CallExpression" && node.callee.name === "Number") return nameOf(node.arguments[0]);
  return null;
};
const mentionsRole = (node) => ROLE_KEYS.has(nameOf(node));
const isNumberLiteral = (node) =>
  node?.type === "Literal" && (typeof node.value === "number" || (typeof node.value === "string" && /^\d+$/.test(node.value)));
const isRoleNumberArray = (node) =>
  node?.type === "ArrayExpression" &&
  node.elements.length >= 2 &&
  node.elements.every((el) => el?.type === "Literal" && Number.isInteger(el.value) && el.value >= 1 && el.value <= 11);

// Numeric role ids in a file: { role_id: 6 }, role_id === "6", [7, 8, 9] next to a role field
const roleNumbersIn = (file) => {
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
  const found = [];
  const visit = (node, ancestors) => {
    if (!node || typeof node.type !== "string") return;
    const parent = ancestors[ancestors.length - 1];
    if (node.type === "Property" && ROLE_KEYS.has(node.key.name ?? node.key.value) && isNumberLiteral(node.value)) {
      found.push(`${node.loc.start.line} ${node.key.name ?? node.key.value}: ${node.value.raw}`);
    }
    if (node.type === "BinaryExpression" && ["===", "==", "!==", "!="].includes(node.operator)) {
      if ((mentionsRole(node.left) && isNumberLiteral(node.right)) || (mentionsRole(node.right) && isNumberLiteral(node.left))) {
        found.push(`${node.loc.start.line} comparison with ${(isNumberLiteral(node.right) ? node.right : node.left).raw}`);
      }
    }
    if (isRoleNumberArray(node)) {
      const nearRoleField = ancestors.slice(-4).some((a) => a.type === "Property" && ROLE_KEYS.has(a.key.name ?? a.key.value));
      const includesRole =
        parent?.type === "MemberExpression" &&
        parent.property.name === "includes" &&
        mentionsRole(ancestors[ancestors.length - 2]?.arguments?.[0]);
      const roleVariable = parent?.type === "VariableDeclarator" && /role/i.test(parent.id.name || "");
      if (nearRoleField || includesRole || roleVariable) found.push(`${node.loc.start.line} [${node.elements.map((e) => e.value).join(", ")}]`);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      const next = [...ancestors, node];
      if (Array.isArray(child)) child.forEach((item) => visit(item, next));
      else if (child && typeof child.type === "string") visit(child, next);
    }
  };
  visit(ast, []);
  return found;
};

const appFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["node_modules", "uploads", "dumps"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), path.join(ROOT, "app.js"), path.join(ROOT, "index.js")];
};

test("only src/config/roles.js writes role ids as numbers", () => {
  const offenders = [];
  for (const file of appFiles()) {
    const relative = path.relative(ROOT, file);
    if (relative === path.join("src", "config", "roles.js")) continue;
    for (const hit of roleNumbersIn(file)) offenders.push(`${relative}:${hit}`);
  }
  assert.deepEqual(offenders, [], "use ROLE / the role groups from src/config/roles.js");
});

test("the roles seed has every role id the code uses, with the same names", () => {
  const sql = fs.readFileSync(path.join(ROOT, "src/seeders/dumps/roles.sql"), "utf8");
  const seeded = Object.fromEntries([...sql.matchAll(/^\((\d+), '([^']+)'/gm)].map(([, id, name]) => [id, name]));
  for (const [id, name] of Object.entries(roles.ROLE_NAMES)) assert.equal(seeded[id], name, `role ${id}`);
});
