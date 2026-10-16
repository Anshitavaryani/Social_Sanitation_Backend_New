// Configuration has one source: src/config/config.js reads the environment, checks it against
// src/config/env.schema.js and everything else reads config. .env.example documents that schema.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const util = require("util");
const { ROOT, mockPackage, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const { models } = mockDatabase();

const axiosCalls = [];
mockPackage("axios", {
  post: async (url, body, options) => {
    axiosCalls.push({ method: "post", url, body, headers: options.headers });
    // like axios, the response carries the request config, Authorization header included
    return {
      data: { payment_link: { id: "LINK_1", url: "https://square.link/u/abc", order_id: "ORDER_1" } },
      config: { url, headers: options.headers },
    };
  },
  delete: async (url, options) => {
    axiosCalls.push({ method: "delete", url, headers: options.headers });
    return { data: {} };
  },
});

const docusignCalls = {};
mockPackage("docusign-esign", {
  ApiClient: class {
    setOAuthBasePath(value) {
      docusignCalls.oAuthBasePath = value;
    }
    setBasePath(value) {
      docusignCalls.basePath = value;
    }
    async requestJWTUserToken(...args) {
      docusignCalls.jwt = args;
      return { body: { access_token: "docusign-token" } };
    }
    addDefaultHeader() {}
  },
});

const config = loadFromRoot("src/config/config.js");

// Every JS file of the app (not tests, not SQL dumps)
const appFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), path.join(ROOT, "app.js"), path.join(ROOT, "index.js")];
};

// Every `process.env` in a file: the variable it touches and whether it is assigned
const envUses = (file) => {
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
  const uses = [];
  const visit = (node, parent, grandparent) => {
    if (!node || typeof node.type !== "string") return;
    const isProcessEnv =
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" &&
      node.object.name === "process" &&
      (node.computed ? node.property.value === "env" : node.property.name === "env");
    if (isProcessEnv) {
      const access = parent && parent.type === "MemberExpression" && parent.object === node ? parent : null;
      uses.push({
        line: node.loc.start.line,
        name: access ? (access.computed ? access.property.value : access.property.name) : "(whole object)",
        assigned: Boolean(access && grandparent?.type === "AssignmentExpression" && grandparent.left === access),
      });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, node, parent));
      else if (child && typeof child.type === "string") visit(child, node, parent);
    }
  };
  visit(ast, null, null);
  return uses;
};

test("only src/config/config.js reads the environment", () => {
  const offenders = [];
  for (const file of appFiles()) {
    const relative = path.relative(ROOT, file);
    if (relative === path.join("src", "config", "config.js")) continue;
    for (const use of envUses(file)) {
      // index.js sets the two process-wide settings before the app loads
      const processSetting = relative === "index.js" && use.assigned && ["TZ", "NODE_TLS_REJECT_UNAUTHORIZED"].includes(use.name);
      if (!processSetting) offenders.push(`${relative}:${use.line} process.env.${use.name}`);
    }
  }
  assert.deepEqual(offenders, [], "read these through src/config/config.js");
});

test(".env.example lists exactly the variables the schema checks", () => {
  const schemaKeys = Object.keys(loadFromRoot("src/config/env.schema.js").describe().keys).sort();
  const exampleKeys = fs
    .readFileSync(path.join(ROOT, ".env.example"), "utf8")
    .split("\n")
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/))
    .filter(Boolean)
    .map((match) => match[1]);
  assert.equal(new Set(exampleKeys).size, exampleKeys.length, "no key listed twice");
  assert.deepEqual([...exampleKeys].sort(), schemaKeys);
});

// Loads a fresh copy of config.js with some variables changed (undefined removes one)
const CONFIG_MODULES = ["src/config/config.js", "src/config/env.schema.js"].map((file) => require.resolve(path.join(ROOT, file)));
const loadConfigWith = (overrides) => {
  const savedEnv = { ...process.env };
  const savedModules = CONFIG_MODULES.map((id) => require.cache[id]);
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    CONFIG_MODULES.forEach((id) => delete require.cache[id]);
    return require(CONFIG_MODULES[0]);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
    Object.assign(process.env, savedEnv);
    CONFIG_MODULES.forEach((id, i) => {
      if (savedModules[i]) require.cache[id] = savedModules[i];
      else delete require.cache[id];
    });
  }
};

test("public URLs default to the live addresses, must be full http(s) URLs, and lose a trailing slash", () => {
  const defaults = loadConfigWith({ API_BASE_URL: undefined, ADMIN_BASE_URL: undefined });
  assert.equal(defaults.apiBaseUrl, "https://node.socialsanitation.com/api/v1");
  assert.equal(defaults.adminBaseUrl, "https://admin.socialsanitation.com");
  const local = loadConfigWith({ API_BASE_URL: "http://localhost:3000/api/v1/", ADMIN_BASE_URL: "http://localhost:3001/" });
  assert.deepEqual([local.apiBaseUrl, local.adminBaseUrl], ["http://localhost:3000/api/v1", "http://localhost:3001"]);
  assert.throws(() => loadConfigWith({ API_BASE_URL: "node.socialsanitation.com/api/v1" }), /API_BASE_URL/);
});

test("an empty optional setting takes its default", () => {
  const fresh = loadConfigWith({
    PORT: "",
    BUSINESS_TIMEZONE: "",
    SQUARE_ENVIRONMENT: "",
    DOCUSIGN_OAUTH_BASE_PATH: "",
    DOCUSIGN_BASE_PATH: "",
    FIREBASE_DATABASE_URL: "",
    JWT_ADMIN_ACCESS_EXPIRATION_DAYS: "",
    JWT_ADMIN_RESET_EXPIRATION_DAYS: "",
  });
  assert.equal(fresh.port, 5000);
  assert.equal(fresh.businessTimeZone, "America/New_York");
  assert.equal(fresh.square.environment, "sandbox");
  assert.equal(fresh.docusign.oAuthBasePath, "account-d.docusign.com");
  assert.equal(fresh.docusign.basePath, "https://demo.docusign.net/restapi");
  assert.equal(fresh.firebase.databaseUrl, "https://social-sanitation-default-rtdb.firebaseio.com");
  assert.equal(fresh.jwt.adminAccessExpirationDays, 5);
  assert.equal(fresh.jwt.adminResetExpirationDays, 1);
});

test("a missing required setting or an unknown time zone stops start-up and names the variable", () => {
  for (const key of ["JWT_SECRET", "JWT_ACCESS_EXPIRATION_DAYS", "ACCESSDOMAINS", "FIREBASE_PRIVATE_KEY", "AZURE_CLIENT_SECRET"]) {
    assert.throws(() => loadConfigWith({ [key]: undefined }), new RegExp(`Config validation error: .*${key}`), key);
  }
  assert.throws(() => loadConfigWith({ BUSINESS_TIMEZONE: "Mars/Olympus_Mons" }), /BUSINESS_TIMEZONE/);
  assert.throws(() => loadConfigWith({ JWT_ACCESS_EXPIRATION_DAYS: "thirty" }), /JWT_ACCESS_EXPIRATION_DAYS/);
});

test("private keys stored on one line with \\n become multi-line", () => {
  const fresh = loadConfigWith({
    FIREBASE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nAAA\\n-----END PRIVATE KEY-----",
    DOCUSIGN_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nBBB\\n-----END RSA PRIVATE KEY-----",
  });
  assert.equal(fresh.firebase.privateKey, "-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----");
  assert.equal(fresh.docusign.privateKey, "-----BEGIN RSA PRIVATE KEY-----\nBBB\n-----END RSA PRIVATE KEY-----");
});

test("values come from the file DOTENV_CONFIG_PATH names; variables already set win", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ss-env-")), "app.env");
  fs.writeFileSync(file, "GOOGLE_API_KEY=from-file\nAPP_NAME=from-file\n");
  const fresh = loadConfigWith({ DOTENV_CONFIG_PATH: file, GOOGLE_API_KEY: undefined });
  assert.equal(fresh.GOOGLE_API_KEY, "from-file");
  assert.equal(fresh.app_name, "social_sanitation_test");
});

test("the business time zone comes from config", () => {
  assert.equal(loadFromRoot("src/utils/time.js").BUSINESS_TZ, config.businessTimeZone);
});

test("Square payment links use the configured environment, token and location, and the token is never logged", async () => {
  const squareService = loadFromRoot("src/services/Common/square.service.js");
  models.Payment.create = async (row) => row;
  const printed = [];
  const { log, error } = console;
  console.log = console.error = (...args) => printed.push(util.format(...args));
  const original = { ...config.square };
  try {
    axiosCalls.length = 0;
    await squareService.generateSquarePaymentLink({ amount: 10, refNo: "Q-1", customerEmail: "c@example.com", user_id: 9 });
    await squareService.deleteSquarePaymentLink("LINK_1");
    config.square.environment = "production";
    await squareService.generateSquarePaymentLink({ amount: 10, refNo: "Q-2", customerEmail: "c@example.com", user_id: 9 });
  } finally {
    Object.assign(console, { log, error });
    Object.assign(config.square, original);
  }

  assert.deepEqual(
    axiosCalls.map((c) => `${c.method} ${c.url}`),
    [
      "post https://connect.squareupsandbox.com/v2/online-checkout/payment-links",
      "delete https://connect.squareupsandbox.com/v2/online-checkout/payment-links/LINK_1",
      "post https://connect.squareup.com/v2/online-checkout/payment-links",
    ],
  );
  assert.deepEqual(axiosCalls[0].headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer test-square-token",
    "Square-Version": "2024-10-17",
  });
  assert.deepEqual(axiosCalls[1].headers, { Authorization: "Bearer test-square-token", "Square-Version": "2024-10-17" });
  assert.equal(axiosCalls[0].body.order.location_id, "test-location");
  assert.ok(!printed.some((line) => line.includes("test-square-token")), "the access token never reaches the logs");
});

test("DocuSign signs in with the configured hosts and credentials (demo by default)", async () => {
  const { getDocusignClient } = loadFromRoot("src/services/Common/docusignAuth.service.js");
  const original = { ...config.docusign };
  try {
    Object.assign(config.docusign, { integrationKey: "ik", userId: "uid", privateKey: "line1\nline2" });
    await getDocusignClient();
    assert.equal(docusignCalls.oAuthBasePath, "account-d.docusign.com");
    assert.equal(docusignCalls.basePath, "https://demo.docusign.net/restapi");
    assert.deepEqual(docusignCalls.jwt, ["ik", "uid", "signature impersonation", "line1\nline2", 3600]);

    Object.assign(config.docusign, { oAuthBasePath: "account.docusign.com", basePath: "https://na4.docusign.net/restapi" });
    await getDocusignClient();
    assert.equal(docusignCalls.oAuthBasePath, "account.docusign.com");
    assert.equal(docusignCalls.basePath, "https://na4.docusign.net/restapi");
  } finally {
    Object.assign(config.docusign, original);
  }
});
