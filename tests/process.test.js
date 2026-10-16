// index.js: the server starts, and an uncaught exception ends the process with
// code 1 so pm2 (autorestart: true) replaces it with a clean one.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path");
const { ROOT } = require("./helpers/mocks");

const runIndex = (env, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--require", path.join(__dirname, "helpers/childPreload.js"), "index.js"],
      { cwd: ROOT, env: { ...process.env, LOG_LEVEL: "info", ...env } },
    );
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`index.js did not exit within ${timeoutMs}ms\n${output}`));
    }, timeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });

test("an uncaught exception is logged and the process exits with code 1", async () => {
  const { code, output } = await runIndex({ THROW_AFTER_MS: "3000" });
  assert.match(output, /Listening to PORT/, "server should have started first");
  assert.match(output, /Uncaught Exception/);
  assert.equal(code, 1);
});

test("SIGTERM shuts the server down cleanly with code 0", async () => {
  const child = spawn(
    process.execPath,
    ["--require", path.join(__dirname, "helpers/childPreload.js"), "index.js"],
    { cwd: ROOT, env: { ...process.env, LOG_LEVEL: "info" } },
  );
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
    if (/Listening to PORT/.test(output)) child.kill("SIGTERM");
  });
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 0);
  assert.match(output, /Server closed/);
});
