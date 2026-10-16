// One shared Chrome renders every PDF (src/config/pdfBrowser.js): launched once, one tab per
// document that is closed even when rendering fails, launched again after a crash, and closed once
// no PDF has been rendered for IDLE_CLOSE_MS. The pages themselves live in src/templates/pdf.
require("./helpers/env");
const { test, mock, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, mockPackage, loadFromRoot } = require("./helpers/mocks");

const browsers = [];
mockPackage("puppeteer-core", {
  launch: async (options) => {
    const browser = {
      options,
      tabs: [],
      connected: true,
      listeners: {},
      on(event, listener) {
        browser.listeners[event] = listener;
      },
      async newPage() {
        const tab = {
          closed: false,
          async setContent(html) {
            if (html === "<broken>") throw new Error("render failed");
          },
          async evaluate() {},
          async evaluateHandle() {},
          async pdf() {
            return Buffer.from("%PDF-");
          },
          async close() {
            tab.closed = true;
          },
        };
        browser.tabs.push(tab);
        return tab;
      },
      async close() {
        browser.connected = false;
        browser.listeners.disconnected?.();
      },
    };
    browsers.push(browser);
    return browser;
  },
});

const { renderPdf, closePdfBrowser, IDLE_CLOSE_MS } = loadFromRoot("src/config/pdfBrowser.js");
const render = (html = "<p>ok</p>") => renderPdf(html, { fonts: true, images: true, pdf: { format: "A4" } });

beforeEach(async () => {
  await closePdfBrowser();
  browsers.length = 0;
});

test("PDFs rendered together share one Chrome, and every tab is closed", async () => {
  const pdfs = await Promise.all([render(), render(), render()]);
  assert.deepEqual(pdfs.map(String), ["%PDF-", "%PDF-", "%PDF-"]);
  assert.equal(browsers.length, 1);
  assert.equal(browsers[0].tabs.length, 3);
  assert.ok(browsers[0].tabs.every((tab) => tab.closed));
  await render();
  assert.equal(browsers.length, 1, "the next PDF uses the same Chrome");
});

test("a failed render closes its tab and leaves Chrome usable", async () => {
  await assert.rejects(render("<broken>"), /render failed/);
  assert.ok(browsers[0].tabs[0].closed);
  await render();
  assert.equal(browsers.length, 1);
});

test("Chrome is launched again after it crashes", async () => {
  await render();
  browsers[0].connected = false;
  browsers[0].listeners.disconnected();
  await render();
  assert.equal(browsers.length, 2);
});

test("Chrome is closed once no PDF has been rendered for IDLE_CLOSE_MS", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    await render();
    mock.timers.tick(IDLE_CLOSE_MS - 1);
    assert.equal(browsers[0].connected, true);
    mock.timers.tick(1);
    await new Promise(setImmediate);
    assert.equal(browsers[0].connected, false, "closed when idle");
    await render();
    assert.equal(browsers.length, 2, "started again for the next PDF");
  } finally {
    mock.timers.reset();
  }
});

test("puppeteer leaves SIGINT and SIGTERM to the app, which closes Chrome when it stops", async () => {
  await render();
  assert.equal(browsers[0].options.handleSIGINT, false);
  assert.equal(browsers[0].options.handleSIGTERM, false);
  for (const entry of ["index.js", "worker.js"]) {
    assert.match(fs.readFileSync(path.join(ROOT, entry), "utf8"), /closePdfBrowser/, entry);
  }
});

test("PDF pages are written only in src/templates/pdf", () => {
  const offenders = [];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      const relative = path.relative(ROOT, full).split(path.sep).join("/");
      if (!entry.name.endsWith(".js") || relative.startsWith("src/templates/")) return;
      if (/<!doctype html|<html[\s>]/i.test(fs.readFileSync(full, "utf8"))) offenders.push(relative);
    });
  walk(path.join(ROOT, "src"));
  assert.deepEqual(offenders, []);
});
