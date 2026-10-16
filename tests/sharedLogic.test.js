// Logic that used to be copied file to file, now written once: the model destroy hook, the PDF
// browser launch, the app-user token check, and the success flag of JSON responses.
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { ROOT, mockPuppeteer, mockDatabase, loadFromRoot, runHandler } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const { models, sequelize } = mockDatabase();

const { launches } = mockPuppeteer();

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
  const Details = loadFromRoot("src/models/clientChecklistDetails.model.js");
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
  const { launchPdfBrowser } = loadFromRoot("src/config/pdfBrowser.js");
  const config = loadFromRoot("src/config/config.js");
  await launchPdfBrowser();
  assert.deepEqual(launches[0], {
    headless: true,
    executablePath: config.PUPPETEER_EXECUTABLE_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    handleSIGINT: false,
    handleSIGTERM: false,
  });
  const elsewhere = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (entry.name.endsWith(".js") && full !== path.join(ROOT, "src/config/pdfBrowser.js") && /puppeteer\.launch\(/.test(fs.readFileSync(full, "utf8"))) {
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

test("catch blocks rethrow with ApiError.from: the caught error's status, else 500, and its message", () => {
  const ApiError = loadFromRoot("src/utils/ApiError.js");
  for (const [caught, status] of [
    [new ApiError(404, "Estimate not found"), 404],
    [Object.assign(new Error("Card declined"), { statusCode: 402 }), 402],
    [new Error("connect ECONNREFUSED"), 500],
    [{ statusCode: 0, message: "zero" }, 500],
  ]) {
    const rethrown = ApiError.from(caught);
    assert.ok(rethrown instanceof ApiError);
    assert.deepEqual([rethrown.statusCode, rethrown.message], [status, caught.message]);
  }

  // no hand-written copy of it is left: new ApiError(e.statusCode ? e.statusCode : 500, e.message) or
  // the || form (rethrows with another fallback status or message are different and stay)
  const is500 = (n) => (n.type === "MemberExpression" && n.property.name === "INTERNAL_SERVER_ERROR") || (n.type === "Literal" && n.value === 500);
  const isProp = (n, id, prop) => n?.type === "MemberExpression" && !n.computed && n.object.name === id && n.property.name === prop;
  const isCopy = (node) => {
    if (node.type !== "NewExpression" || node.callee.name !== "ApiError" || node.arguments.length !== 2) return false;
    const [status, message] = node.arguments;
    const id = message.type === "MemberExpression" && message.property.name === "message" ? message.object.name : null;
    if (!id) return false;
    if (status.type === "ConditionalExpression") return isProp(status.test, id, "statusCode") && isProp(status.consequent, id, "statusCode") && is500(status.alternate);
    return status.type === "LogicalExpression" && status.operator === "||" && isProp(status.left, id, "statusCode") && is500(status.right);
  };
  const handWritten = [];
  const visit = (node, file) => {
    if (!node || typeof node.type !== "string") return;
    if (isCopy(node)) handWritten.push(`${path.relative(ROOT, file)}:${node.loc.start.line}`);
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, file));
      else if (child && typeof child.type === "string") visit(child, file);
    }
  };
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith(".js") || full === path.join(ROOT, "src/utils/ApiError.js")) return;
      visit(espree.parse(fs.readFileSync(full, "utf8"), { ecmaVersion: "latest", loc: true }), full);
    });
  walk(path.join(ROOT, "src"));
  assert.deepEqual(handWritten, [], "use ApiError.from(error)");
});

test("catch blocks that may see other services' errors keep their own 404s and 400s (they all became 500)", async () => {
  const ApiError = loadFromRoot("src/utils/ApiError.js");
  const own = new ApiError(404, "Contract Agreement not found");
  assert.equal(ApiError.orInternal(own), own);
  const other = Object.assign(new Error("Request failed with status code 401"), { statusCode: 401 });
  assert.deepEqual([ApiError.orInternal(other).statusCode, ApiError.orInternal(other).message], [500, other.message], "another service's status stays out");

  const service = loadFromRoot("src/services/Admin/serviceEstimate.service.js");
  models.ContractAgreement.findOne = async () => null;
  await assert.rejects(service.deleteContractAgreement(9), (err) => err.statusCode === 404 && err.message === "Contract Agreement not found");

  // no catch block rebuilds a 500 by hand any more
  const is500 = (n) => (n.type === "MemberExpression" && n.property.name === "INTERNAL_SERVER_ERROR") || (n.type === "Literal" && n.value === 500);
  const left = [];
  const visit = (node, file) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "CatchClause" && node.param?.type === "Identifier") {
      for (const statement of node.body.body) {
        const created = statement.type === "ThrowStatement" ? statement.argument : null;
        if (created?.type === "NewExpression" && created.callee.name === "ApiError" && is500(created.arguments[0]) && created.arguments[1]?.object?.name === node.param.name && created.arguments[1]?.property?.name === "message") {
          left.push(`${path.relative(ROOT, file)}:${statement.loc.start.line}`);
        }
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, file));
      else if (child && typeof child.type === "string") visit(child, file);
    }
  };
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (entry.name.endsWith(".js")) visit(espree.parse(fs.readFileSync(full, "utf8"), { ecmaVersion: "latest", loc: true }), full);
    });
  walk(path.join(ROOT, "src"));
  assert.deepEqual(left, [], "use ApiError.orInternal(error)");
});

test("admin edits change only editable columns: not id, is_active, timestamps or ownership links", async () => {
  const Product = loadFromRoot("src/models/product.model.js");
  const UserScopeSection = loadFromRoot("src/models/userScopeSection.model.js");
  const { editableFields } = loadFromRoot("src/utils/editableFields.js");
  assert.deepEqual(editableFields(Product), ["name", "description", "quantity"]);
  assert.deepEqual(editableFields(UserScopeSection, ["user_id", "master_section_id"]), ["title", "order", "is_red"]);

  const productService = loadFromRoot("src/services/Common/product.service.js");
  const product = Product.build({ id: 5, name: "Mop", description: "", quantity: 1, is_active: true }, { isNewRecord: false });
  models.Product.findByPk = async () => product;
  models.Product.rawAttributes = Product.rawAttributes; // the service sees the stand-in model
  written = null;
  await productService.updateProductById(5, {
    name: "Mop XL",
    quantity: 3,
    id: 99,
    is_active: false,
    deleted_at: "2026-10-16 00:00:00",
    user: { id: 1 },
  });
  assert.deepEqual(Object.keys(written).sort(), ["description", "name", "quantity", "updated_at"]);
  assert.deepEqual([written.name, written.quantity, product.id, product.is_active], ["Mop XL", 3, 5, true]);
});
