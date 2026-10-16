// Loaded with `node --require` before index.js or worker.js in a child process: same mocks as the
// app tests, then an uncaught exception once the server has had time to start.
require("./env");
const { mockPackage, mockDatabase, mockFirebase } = require("./mocks");

// node-cron stand-in: tasks never run, but keep the process alive as real ones do
const tasks = new Set();
mockPackage("node-cron", {
  schedule: () => {
    const timer = setInterval(() => {}, 60000);
    const task = { stop: () => clearInterval(timer) };
    tasks.add(task);
    return task;
  },
  shutdown: async () => tasks.forEach((task) => task.stop()),
});
mockDatabase();
mockFirebase();

if (process.env.THROW_AFTER_MS) {
  setTimeout(() => {
    throw new Error("simulated crash");
  }, Number(process.env.THROW_AFTER_MS));
}
