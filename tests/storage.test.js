// Uploads can live outside the code folder (STORAGE_DIR): files are saved there, and served from
// there first and from the old public/uploads while files are copied across.
require("./helpers/env");
const os = require("os");
const fs = require("fs");
const path = require("path");

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ss-storage-"));
process.env.STORAGE_DIR = storageRoot;

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { ROOT, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
mockDatabase();
mockFirebase();

const storage = loadFromRoot("src/config/storage.js");
const name = (label) => `storage-test-${label}-${process.pid}.png`;
const legacyFile = path.join(ROOT, "public", "uploads", "images", name("legacy"));
const newFile = () => path.join(storage.UPLOAD_DIRS.images, name("new"));

let server;
let baseUrl;
before(async () => {
  const app = loadFromRoot("app.js"); // creates the upload folders under STORAGE_DIR
  fs.mkdirSync(path.dirname(legacyFile), { recursive: true });
  fs.writeFileSync(legacyFile, "old location");
  fs.writeFileSync(newFile(), "new location");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  fs.rmSync(legacyFile, { force: true });
  fs.rmSync(storageRoot, { recursive: true, force: true });
  return new Promise((resolve) => server.close(resolve));
});

const statusOf = async (url) => (await fetch(baseUrl + url)).status;

test("with STORAGE_DIR set, uploads go to <STORAGE_DIR>/uploads and its folders exist", () => {
  assert.equal(storage.UPLOAD_DIRS.images, path.join(storageRoot, "uploads", "images"));
  for (const folder of storage.UPLOAD_FOLDERS) assert.ok(fs.existsSync(storage.UPLOAD_DIRS[folder]), folder);
});

test("files are served from storage, and from public/uploads while they are copied across", async () => {
  for (const url of [
    `/api/v1/images/${name("new")}`,
    `/images/${name("new")}`,
    `/uploads/images/${name("new")}`,
    `/api/v1/images/${name("legacy")}`,
    `/uploads/images/${name("legacy")}`,
  ]) {
    assert.equal(await statusOf(url), 200, url);
  }
  assert.equal(await statusOf(`/api/v1/images/missing-${process.pid}.png`), 404);
});

test("audio is served at /audios (it was saved there, but only /songs was served); template sources are not public", async () => {
  fs.writeFileSync(path.join(storage.UPLOAD_DIRS.audios, "note.mp3"), "mp3");
  assert.equal(await statusOf("/api/v1/audios/note.mp3"), 200);
  assert.equal(await statusOf("/songs/note.mp3"), 404);
  assert.equal(await statusOf("/Email_Template/emailBase.js"), 404);
  assert.equal(await statusOf("/assets/logo.jpg"), 200);
});
