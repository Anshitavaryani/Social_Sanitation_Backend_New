// A stand-in database that records every model call, and every update, save or destroy on the rows
// it hands out, in one log. Tests set what a query returns with `respond`; anything else gets
// the empty result (findOne null, findAll [], create echoes the values with a new id).
// describe() turns query options into plain data, Sequelize operators included ({ "Op.ne": 3 }),
// so a log can be compared or asserted on.
const { mockModule, fakeSequelize } = require("./mocks");

const describe = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined || typeof value !== "object") {
    if (typeof value === "function") return "<fn>";
    if (typeof value === "symbol") return `Op.${value.description}`;
    return value;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "<Invalid Date>" : value.toISOString();
  if (Buffer.isBuffer(value)) return `<Buffer ${value.length}>`;
  if (value.__transaction) return "<tx>";
  if (value.__row) return `<${value.__model}#${value.id}>`;
  if (seen.has(value)) return "<circular>";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => describe(v, seen));
  const out = {};
  for (const key of Object.keys(value)) {
    if (key === "model" && typeof value[key] === "object" && value[key]?.__modelName) out.model = value[key].__modelName;
    else out[key] = describe(value[key], seen);
  }
  for (const sym of Object.getOwnPropertySymbols(value)) out[`Op.${sym.description}`] = describe(value[sym], seen);
  return out;
};

const recordingDatabase = () => {
  const log = [];
  const responses = new Map();
  let nextId = 1000;

  const row = (modelName, data = {}) => {
    const values = { ...data };
    const instance = {
      __row: true,
      __model: modelName,
      ...values,
      get(options) {
        if (typeof options === "string") return instance[options];
        const plain = {};
        for (const [key, v] of Object.entries(instance)) if (!key.startsWith("__") && typeof v !== "function") plain[key] = v;
        return plain;
      },
      toJSON() {
        return instance.get({ plain: true });
      },
      async update(changes, options) {
        log.push([`${modelName}#update`, instance.id, describe(changes), describe(options)]);
        Object.assign(instance, changes);
        return instance;
      },
      async save(options) {
        log.push([`${modelName}#save`, instance.id, describe(instance.get({ plain: true })), describe(options)]);
        return instance;
      },
      async destroy(options) {
        log.push([`${modelName}#destroy`, instance.id, describe(options)]);
        return 1;
      },
      async reload() {
        return instance;
      },
      async increment(field, options) {
        log.push([`${modelName}#increment`, instance.id, describe(field), describe(options)]);
        return instance;
      },
      setDataValue(key, v) {
        instance[key] = v;
      },
      getDataValue(key) {
        return instance[key];
      },
    };
    Object.defineProperty(instance, "dataValues", { get: () => instance.get({ plain: true }), enumerable: false });
    return instance;
  };

  // anything that looks like a row (has an id) is handed out as a recording instance
  const asRows = (modelName, value) => {
    if (Array.isArray(value)) return value.map((v) => asRows(modelName, v));
    if (value && typeof value === "object" && !value.__row && "id" in value) return row(modelName, value);
    return value;
  };

  const defaults = {
    findOne: () => null,
    findByPk: () => null,
    findAll: () => [],
    findAndCountAll: () => ({ count: 0, rows: [] }),
    count: () => 0,
    sum: () => 0,
    max: () => null,
    destroy: () => 1,
    update: () => [1],
  };

  const models = new Proxy(
    {},
    {
      get(target, modelName) {
        if (typeof modelName !== "string" || modelName === "then" || modelName === "__esModule") return undefined;
        if (!target[modelName]) {
          const model = { __modelName: modelName, rawAttributes: {}, belongsTo() {}, hasMany() {}, hasOne() {}, belongsToMany() {}, addHook() {} };
          for (const method of ["findOne", "findByPk", "findAll", "findAndCountAll", "count", "sum", "max", "destroy", "update", "create", "bulkCreate", "findOrCreate", "upsert"]) {
            model[method] = async (...args) => {
              log.push([`${modelName}.${method}`, ...args.map((a) => describe(a))]);
              const respond = responses.get(`${modelName}.${method}`);
              if (respond) return asRows(modelName, await respond(...args));
              if (method === "create") return row(modelName, { id: nextId++, ...args[0] });
              if (method === "bulkCreate") return args[0].map((v) => row(modelName, { id: nextId++, ...v }));
              if (method === "findOrCreate") return [row(modelName, { id: nextId++, ...args[0]?.defaults, ...args[0]?.where }), true];
              return defaults[method]();
            };
          }
          target[modelName] = model;
        }
        return target[modelName];
      },
    },
  );

  const sequelize = fakeSequelize();
  sequelize.transaction = async () => {
    const tx = {
      __transaction: true,
      finished: undefined,
      LOCK: { UPDATE: "UPDATE" },
      async commit() {
        tx.finished = "commit";
        log.push(["transaction.commit"]);
      },
      async rollback() {
        tx.finished = "rollback";
        log.push(["transaction.rollback"]);
      },
    };
    log.push(["transaction.start"]);
    return tx;
  };
  sequelize.query = async (...args) => {
    log.push(["sequelize.query", ...args.map((a) => describe(a))]);
    return [];
  };

  mockModule("src/models/index.js", models);
  mockModule("src/config/central.db.js", sequelize);

  return {
    models,
    sequelize,
    log,
    row,
    // respond("Invoice.findByPk", (id, options) => ({ id, ... })): what that call returns
    respond: (key, fn) => responses.set(key, fn),
    reset: () => {
      log.length = 0;
      responses.clear();
    },
    // the log entries for one model method or row method, e.g. calls("Invoice.create")
    calls: (key) => log.filter(([name]) => name === key),
  };
};

// Replaces a module with one whose every function records its call in the log and returns
// what `results[name]` gives (or undefined)
const recordingModule = (relativePath, log, results = {}) =>
  mockModule(
    relativePath,
    new Proxy(
      {},
      {
        get: (target, name) =>
          typeof name !== "string" || name === "then"
            ? undefined
            : async (...args) => {
                log.push([`${relativePath.split("/").pop().replace(".js", "")}.${name}`, ...args.map((a) => describe(a))]);
                const result = results[name];
                return typeof result === "function" ? result(...args) : result;
              },
      },
    ),
  );

module.exports = { recordingDatabase, recordingModule, describe };
