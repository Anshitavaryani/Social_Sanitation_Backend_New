// Reads every route definition from src/routes/v1 and works out its access level from the
// middleware it declares. Used by tests/routeAccess.test.js.
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const ROUTES_DIR = path.join(ROOT, "src/routes/v1");
const METHODS = ["get", "post", "put", "patch", "delete"];

// Mount prefix of each route file, read from the group index files
const mountPrefixes = () => {
  const prefixes = {};
  for (const group of ["Common", "Admin", "User"]) {
    const source = fs.readFileSync(path.join(ROUTES_DIR, group, "index.js"), "utf8");
    const fileOf = {};
    for (const m of source.matchAll(/const (\w+) = require\(["']\.\/([\w.]+?)(?:\.js)?["']\)/g)) fileOf[m[1]] = m[2];
    for (const m of source.matchAll(/path:\s*["']([^"']+)["'],\s*route:\s*(\w+)/g)) {
      prefixes[path.join(group, `${fileOf[m[2]]}.js`)] = m[1];
    }
  }
  return prefixes;
};

const AUTH_MARKERS = {
  publicRoute: "PUBLIC",
  requireAuth: "AUTH",
  verifyAnyAuthJWTToken: "AUTH",
  requireAdmin: "ADMIN",
  requireAdminRole: "ADMIN",
  validateJWTtoken: "ADMIN",
  verifyAuthJWTToken: "USER",
};

// Names of the auth middlewares used by a route, in order
const markersOf = (node, found = []) => {
  if (!node) return found;
  if (node.type === "Identifier" && AUTH_MARKERS[node.name]) found.push(node.name);
  else if (node.type === "MemberExpression" && !node.computed && AUTH_MARKERS[node.property.name]) found.push(node.property.name);
  else if (node.type === "ArrayExpression") node.elements.forEach((el) => markersOf(el, found));
  else if (node.type === "SpreadElement") markersOf(node.argument, found);
  else if (node.type === "CallExpression") markersOf(node.callee, found);
  return found;
};

const routeInventory = () => {
  const routes = [];
  for (const [file, prefix] of Object.entries(mountPrefixes())) {
    const source = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
    const ast = espree.parse(source, { ecmaVersion: 2023, loc: true });
    (function visit(node) {
      if (!node || typeof node.type !== "string") return;
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.name === "router" &&
        METHODS.includes(node.callee.property.name) &&
        node.arguments[0] &&
        node.arguments[0].type === "Literal"
      ) {
        const middleware = node.arguments.slice(1, -1);
        const markers = middleware.flatMap((m) => markersOf(m));
        // first middleware that actually runs (arrays and spreads are flattened in order)
        const flatten = (n) =>
          n.type === "ArrayExpression" ? n.elements.flatMap(flatten) : n.type === "SpreadElement" ? flatten(n.argument) : [n];
        const first = middleware.flatMap(flatten)[0];
        routes.push({
          method: node.callee.property.name.toUpperCase(),
          path: `/api/v1/${prefix}/${node.arguments[0].value}`.replace(/\/+/g, "/").replace(/\/$/, ""),
          file: `${file}:${node.loc.start.line}`,
          markers,
          // The level is the strictest auth middleware on the route
          level: markers.includes("verifyAuthJWTToken")
            ? "USER"
            : markers.some((m) => AUTH_MARKERS[m] === "ADMIN")
              ? "ADMIN"
              : markers.some((m) => AUTH_MARKERS[m] === "AUTH")
                ? "AUTH"
                : markers.includes("publicRoute")
                  ? "PUBLIC"
                  : "NONE",
          firstIsMarker: first ? markersOf(first).length > 0 : false,
        });
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value.type === "string") visit(value);
      }
    })(ast);
  }
  return routes;
};

module.exports = { routeInventory };
