// Loaded with `node --require` before index.js in a child process: same mocks as the
// app tests, then an uncaught exception once the server has had time to start.
require("./env");
const { mockPackage, mockDatabase, mockFirebase } = require("./mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
mockDatabase();
mockFirebase();

if (process.env.THROW_AFTER_MS) {
  setTimeout(() => {
    throw new Error("simulated crash");
  }, Number(process.env.THROW_AFTER_MS));
}
