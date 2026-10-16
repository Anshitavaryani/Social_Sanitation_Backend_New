// In-memory stand-ins for the database layer and other side-effecting modules.
// Each test file runs in its own process, so a mock lives for one file only.
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

// The files at the project root that run as code (the guard tests scan them along with src/)
const ENTRY_FILES = ["app.js", "index.js", "worker.js"].map((file) => path.join(ROOT, file));

const resolveFromRoot = (relativePath) => require.resolve(path.join(ROOT, relativePath));

// Replace a module in the require cache before anything loads it.
const mockModule = (relativePath, exports) => {
  const id = resolveFromRoot(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return exports;
};

// Same, for an installed package resolved by name (e.g. "node-cron").
const mockPackage = (name, exports) => {
  const id = require.resolve(name, { paths: [ROOT] });
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return exports;
};

const loadFromRoot = (relativePath) => require(path.join(ROOT, relativePath));

// A model whose query methods resolve to empty results unless a test replaces them.
const fakeModel = (name) => ({
  name,
  findOne: async () => null,
  findByPk: async () => null,
  findAll: async () => [],
  findAndCountAll: async () => ({ count: 0, rows: [] }),
  count: async () => 0,
  create: async (values) => ({ id: 1, ...values }),
  bulkCreate: async (rows) => rows,
  update: async () => [1],
  destroy: async () => 1,
  belongsTo() {},
  hasMany() {},
  hasOne() {},
  belongsToMany() {},
  addHook() {},
});

// Any model name a service destructures from src/models becomes a fake model.
// Tests reach the same object through the returned proxy to stub methods.
const fakeModels = () =>
  new Proxy(
    {},
    {
      get(target, key) {
        if (typeof key !== "string" || key === "then" || key === "__esModule") {
          return undefined;
        }
        if (!(key in target)) target[key] = fakeModel(key);
        return target[key];
      },
    },
  );

const fakeTransaction = () => {
  const tx = {
    committed: false,
    rolledBack: false,
    LOCK: { UPDATE: "UPDATE" },
    commit: async () => {
      tx.committed = true;
    },
    rollback: async () => {
      tx.rolledBack = true;
    },
  };
  return tx;
};

// A real Sequelize instance (so model files can call define/init) that never
// connects: transactions and raw queries are replaced with in-memory fakes.
const fakeSequelize = () => {
  const { Sequelize } = require(require.resolve("sequelize", { paths: [ROOT] }));
  const sequelize = new Sequelize("test", "test", "test", {
    host: "127.0.0.1",
    port: 3999,
    dialect: "mysql",
    logging: false,
  });
  const transactions = [];
  sequelize.transactions = transactions;
  sequelize.transaction = async () => {
    const tx = fakeTransaction();
    transactions.push(tx);
    return tx;
  };
  sequelize.query = async () => [];
  sequelize.authenticate = async () => {};
  return sequelize;
};

// Replaces src/models and src/config/central.db; returns the proxies to stub.
const mockDatabase = () => {
  const models = mockModule("src/models/index.js", fakeModels());
  const sequelize = mockModule("src/config/central.db.js", fakeSequelize());
  return { models, sequelize };
};

// puppeteer-core stand-in: one browser whose tabs come from newPage() (a tab gets a close() if it has
// none); launch options are recorded. Nothing starts Chrome.
const mockPuppeteer = (newPage = () => ({})) => {
  const launches = [];
  mockPackage("puppeteer-core", {
    launch: async (options) => {
      launches.push(options);
      return {
        connected: true,
        newPage: async () => ({ close: async () => {}, ...(await newPage()) }),
        on() {},
        close: async () => {},
      };
    },
  });
  return { launches };
};

// An in-memory Firebase Realtime Database. Reads return whatever a test seeded
// at that exact path (or "no data"), writes are recorded, nothing hits the network.
const snapshotOf = (key, value) => ({
  key,
  val: () => (value === undefined ? null : value),
  exists: () => value !== undefined && value !== null,
  forEach: (fn) => {
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (fn(snapshotOf(childKey, childValue)) === true) return true;
      }
    }
    return false;
  },
  numChildren: () => (value && typeof value === "object" ? Object.keys(value).length : 0),
});

const fakeRef = (db, refPath) => {
  const ref = new Proxy(
    {},
    {
      get(target, key) {
        if (key === "then" || typeof key !== "string") return undefined;
        if (key === "key") return refPath.split("/").filter(Boolean).pop() || null;
        if (key === "path") return refPath;
        if (["once", "get"].includes(key)) return async () => snapshotOf(ref.key, db.data[refPath]);
        if (["set", "update", "remove", "transaction"].includes(key)) {
          return async (value) => {
            db.writes.push({ op: key, path: refPath, value });
          };
        }
        if (key === "push") {
          return (value) => {
            const child = fakeRef(db, `${refPath}/pushed-${db.writes.length}`);
            db.writes.push({ op: "push", path: refPath, value });
            return child;
          };
        }
        if (key === "child") return (childPath) => fakeRef(db, `${refPath}/${childPath}`.replace(/\/+$/, ""));
        if (["on", "off"].includes(key)) return () => {};
        // orderByChild, equalTo, limitToLast, ... keep the same ref
        return () => ref;
      },
    },
  );
  return ref;
};

const mockFirebase = () => {
  const db = { data: {}, writes: [] };
  const database = { ref: (refPath = "") => fakeRef(db, String(refPath).replace(/\/+$/, "")) };
  mockPackage("firebase-admin/database", {
    getDatabase: () => database,
    ServerValue: { TIMESTAMP: { ".sv": "timestamp" } },
  });
  const sent = [];
  mockPackage("firebase-admin/messaging", {
    getMessaging: () => ({
      sendEachForMulticast: async (message) => {
        sent.push(message);
        return { successCount: 0, failureCount: 0, responses: [] };
      },
      send: async (message) => {
        sent.push(message);
        return "fake-message-id";
      },
    }),
  });
  return { db, sent };
};

// Express-like response recorder for calling controllers and middleware directly.
const fakeResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      res.headersSent = true;
      return res;
    },
    send(payload) {
      res.body = payload;
      res.headersSent = true;
      return res;
    },
  };
  return res;
};

// Runs a catchAsync-wrapped handler and resolves with the response or the error passed to next().
const runHandler = (handler, req) =>
  new Promise((resolve) => {
    const res = fakeResponse();
    const done = (err) => resolve({ res, err });
    const originalJson = res.json;
    res.json = (payload) => {
      originalJson(payload);
      done();
      return res;
    };
    handler(req, res, done);
  });

module.exports = {
  ROOT,
  ENTRY_FILES,
  mockModule,
  mockPackage,
  loadFromRoot,
  fakeModel,
  fakeModels,
  fakeSequelize,
  mockDatabase,
  mockFirebase,
  mockPuppeteer,
  fakeResponse,
  runHandler,
};
