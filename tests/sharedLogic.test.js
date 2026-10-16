// Logic that used to be copied file to file, now written once: the model destroy hook, the PDF
// browser launch, the app-user token check, and the success flag of JSON responses.
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { ROOT, mockPackage, mockDatabase, loadFromRoot, runHandler } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const { models, sequelize } = mockDatabase();

const launches = [];
mockPackage("puppeteer-core", { launch: async (options) => launches.push(options) && { close: async () => {} } });

// What an instance save sends to the database
let written;
sequelize.getQueryInterface().update = async (instance, table, values) => {
  written = { ...values };
  return [instance, 1];
};

const modelFiles = () =>
  fs
    .readdirSync(path.join(ROOT, "src/models"))
    .filter((name) => name.endsWith(".js") && !["index.js", "hooks.js"].includes(name))
    .map((name) => path.join(ROOT, "src/models", name));

test("a destroyed row gets is_active = false; Sequelize itself writes updated_at and deleted_at", async () => {
  const BDMUser = loadFromRoot("src/models/BDMUser.model.js");
  const row = () => BDMUser.build({ id: 1, is_active: true, deleted_at: null }, { isNewRecord: false });

  written = null;
  await row().destroy();
  assert.equal(written.is_active, false);
  assert.ok(written.deleted_at instanceof Date, "deleted_at from Sequelize");

  written = null;
  const updated = row();
  updated.changed("is_active", true);
  await updated.save();
  assert.equal(typeof written.updated_at, "object", "updated_at from Sequelize (the old hooks' strings never reached the database)");

  // no is_active column, so nothing to deactivate
  const Details = loadFromRoot("src/models/clientChecklsitDetails.model.js");
  written = null;
  await Details.build({ id: 1, deleted_at: null }, { isNewRecord: false }).destroy();
  assert.equal("is_active" in written, false);
});

test("models share the destroy hook instead of writing their own timestamp hooks", () => {
  const ownTimestampHooks = [];
  let shared = 0;
  for (const file of modelFiles()) {
    const code = fs.readFileSync(file, "utf8");
    if (/\bdeactivateOnDestroy\(\w+\);/.test(code)) shared += 1;
    const ast = espree.parse(code, { ecmaVersion: "latest", range: true });
    for (const statement of ast.body) {
      const call = statement.expression;
      const hook = call?.type === "CallExpression" && call.callee.type === "MemberExpression" ? call.callee.property.name : null;
      if (!["beforeUpdate", "beforeDestroy"].includes(hook)) continue;
      const fn = call.arguments[call.arguments.length - 1];
      if (/\b(updated_at|deleted_at|is_active)\b/.test(code.slice(fn.range[0], fn.range[1]))) {
        ownTimestampHooks.push(`${path.basename(file)} ${hook}`);
      }
    }
  }
  assert.deepEqual(ownTimestampHooks, [], "use deactivateOnDestroy from src/models/hooks.js");
  assert.equal(shared, 61, "the 61 models that had the hook and have an is_active column");
});

test("Chrome for PDFs is launched in one place, with the configured binary", async () => {
  const { launchPdfBrowser } = loadFromRoot("src/config/puppeteer.js");
  const config = loadFromRoot("src/config/config.js");
  await launchPdfBrowser();
  assert.deepEqual(launches[0], {
    headless: true,
    executablePath: config.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const elsewhere = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (entry.name.endsWith(".js") && full !== path.join(ROOT, "src/config/puppeteer.js") && /puppeteer\.launch\(/.test(fs.readFileSync(full, "utf8"))) {
        elsewhere.push(path.relative(ROOT, full));
      }
    });
  walk(path.join(ROOT, "src"));
  assert.deepEqual(elsewhere, [], "use launchPdfBrowser()");
});

test("JSON responses say success: false for errors (some 400s and a 404 said true)", async () => {
  const responseWrapper = loadFromRoot("src/config/responseWrapper.js");
  const send = (status) => {
    let body;
    const res = { status: () => res, json: (json) => (body = json) };
    responseWrapper(res, "", "message", status);
    return body.success;
  };
  assert.deepEqual([200, 201, 304, 400, 404, 500].map(send), [true, true, true, false, false, false]);

  const adminAuth = loadFromRoot("src/middlewares/adminAuth.middleware.js");
  const { res } = await runHandler(adminAuth.validateLoginAdminBody, { body: {} });
  assert.deepEqual([res.statusCode, res.body.success], [400, false]);
});

// ----- the app-user token check (routes with userAuthMiddleware.verifyAuthJWTToken)

const appToken = (claims = {}, options = { expiresIn: "5m" }) => jwt.sign({ sub: 9, type: "access", ...claims }, TEST_JWT_SECRET, options);
const adminToken = () => jwt.sign({ id: 1, role_id: 1 }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256", expiresIn: "5m" });

const checkAppUser = async (headers) => {
  const { verifyAuthJWTToken } = loadFromRoot("src/middlewares/userAuth.middleware.js");
  const req = { method: "GET", originalUrl: "/api/v1/user/profile", headers, body: {}, ip: "203.0.113.5", header: (name) => headers[name.toLowerCase()] };
  return { req, ...(await runHandler(verifyAuthJWTToken, req)) };
};

test("an app-user route accepts the session and user of the role in the role_id header", async () => {
  const lookups = [];
  models.UserToken.findOne = async ({ where }) => lookups.push(["session", where]) && { id: 5, user_id: 9, role_id: 7 };
  models.User.findOne = async ({ where }) => lookups.push(["user", where]) && { id: 9, role_id: 7 };
  const token = appToken();
  const { req, err } = await checkAppUser({ "x-access-token": token, role_id: "7" });
  assert.equal(err, undefined);
  assert.deepEqual([req.body.user.id, req.body.user_type, req.body.ip_address], [9, "USER", "203.0.113.5"]);
  assert.deepEqual(
    lookups.map(([kind, where]) => [kind, where.role_id]),
    [["session", "7"], ["user", "7"]],
  );
});

test("an app-user route refuses a missing role_id header (500 before), admin and expired tokens", async () => {
  const errorOf = async (headers) => (await checkAppUser(headers)).err;
  const missingRole = await errorOf({ "x-access-token": appToken() });
  assert.deepEqual([missingRole.statusCode, missingRole.message], [401, "Send the role_id header with the access token."]);
  const admin = await errorOf({ "x-access-token": adminToken(), role_id: "6" });
  assert.deepEqual([admin.statusCode, admin.message], [401, "Invalid access token. Please log in again."]);
  const expired = await errorOf({ "x-access-token": appToken({}, { expiresIn: -10 }), role_id: "6" });
  assert.deepEqual([expired.statusCode, expired.message], [401, "Your session has expired. Please log in again."]);
  models.UserToken.findOne = async () => null; // no session for this role
  const otherRole = await errorOf({ "x-access-token": appToken(), role_id: "6" });
  assert.deepEqual([otherRole.statusCode, otherRole.message], [401, "Your session has ended. Please log in again."]);
});
