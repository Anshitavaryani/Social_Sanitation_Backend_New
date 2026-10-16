// The two processes pm2 runs: index.js (the API) and worker.js (the scheduled jobs). Each starts,
// stops cleanly with code 0, and ends with code 1 after an uncaught exception so pm2
// (autorestart: true) replaces it with a clean one.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path");
const { ROOT } = require("./helpers/mocks");

const STARTED = { "index.js": /Listening to PORT/, "worker.js": /Worker started: 10 scheduled jobs/ };

// Runs an entry file with the test mocks; sends `signal` once it has started, if given
const run = (entry, { env = {}, signal, timeoutMs = 30000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--require", path.join(__dirname, "helpers/childPreload.js"), entry], {
      cwd: ROOT,
      env: { ...process.env, LOG_LEVEL: "info", ...env },
    });
    let output = "";
    let signalled = false;
    const collect = (chunk) => {
      output += chunk;
      if (signal && !signalled && STARTED[entry].test(output)) {
        signalled = true;
        child.kill(signal);
      }
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${entry} did not exit within ${timeoutMs}ms\n${output}`));
    }, timeoutMs);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

test("an uncaught exception is logged and the API process exits with code 1", async () => {
  const { code, output } = await run("index.js", { env: { THROW_AFTER_MS: "3000" } });
  assert.match(output, STARTED["index.js"], "server should have started first");
  assert.match(output, /Uncaught Exception/);
  assert.equal(code, 1);
});

test("the API shuts down cleanly with code 0 on SIGINT (pm2) and SIGTERM", async () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const { code, output } = await run("index.js", { signal });
    assert.equal(code, 0, signal);
    assert.match(output, /Server closed/, signal);
  }
});

test("the worker starts the jobs and stops cleanly on SIGINT (pm2) and SIGTERM", async () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const { code, output } = await run("worker.js", { signal });
    assert.equal(code, 0, signal);
    assert.match(output, /Worker stopped/, signal);
    assert.doesNotMatch(output, /Listening to PORT/, "the worker serves no requests");
  }
});

test("an uncaught exception in the worker exits with code 1", async () => {
  const { code, output } = await run("worker.js", { env: { THROW_AFTER_MS: "3000" } });
  assert.match(output, STARTED["worker.js"]);
  assert.match(output, /Uncaught Exception/);
  assert.equal(code, 1);
});
