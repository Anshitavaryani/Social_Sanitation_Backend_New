// Uploads over HTTP: files are written only after the route's access check passes, each file is
// limited to 25 MB, refused files get a JSON 400/413, and two files never share a name.
// Controllers are stubs that report what the upload layer handed them.
const { TEST_JWT_SECRET } = require("./helpers/env");
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { ROOT, mockModule, mockPackage, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

mockPackage("node-cron", { schedule: () => ({ stop() {} }) });
const { models } = mockDatabase();
mockFirebase();

const stubHandler = (req, res) => {
  const files = {};
  for (const [field, list] of Object.entries(req.files && !Array.isArray(req.files) ? req.files : {})) {
    files[field] = list.map((f) => f.filename);
  }
  res.status(200).json({
    files,
    file: req.file ? { name: req.file.originalname, inMemory: Buffer.isBuffer(req.file.buffer) } : null,
    note: req.body?.note ?? null,
    user_type: req.body?.user_type ?? null,
  });
};
const controllers = new Proxy({}, { get: (t, group) => (typeof group === "string" ? new Proxy({}, { get: () => stubHandler }) : undefined) });
mockModule("src/controllers/index.js", controllers);
for (const group of ["Admin", "Common", "User"]) mockModule(`src/controllers/${group}/index.js`, controllers);

const adminToken = (id = 1) =>
  jwt.sign({ id, role_id: id, department_id: 1, is_backlisted: false }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256", expiresIn: "5m" });
const userToken = () => jwt.sign({ sub: 9, role_id: 6, type: "access" }, TEST_JWT_SECRET, { expiresIn: "5m" });
const expiredAdminToken = () =>
  jwt.sign({ id: 1, role_id: 1, exp: Math.floor(Date.now() / 1000) - 60 }, Buffer.from(TEST_JWT_SECRET, "hex"), { algorithm: "HS256" });

// admin 1 is a super admin, admin 3 a sales executive (role 3)
models.Admin.findOne = async ({ where }) => ([1, 3].includes(Number(where.id)) ? { id: Number(where.id), role_id: Number(where.id), is_active: true } : null);
models.UserToken.findOne = async () => ({ id: 5, user_id: 9, role_id: 6 });
models.User.findOne = async () => ({ id: 9, role_id: 6, user_profile: { name: "App User" } });

const UPLOAD_DIRS = ["images", "docs"].map((d) => path.join(ROOT, "public/uploads", d));
for (const dir of UPLOAD_DIRS) fs.mkdirSync(dir, { recursive: true });
// Names multer gives uploads; other test files write their own files (PDFs) to the same folders
const isUpload = (name) => /^(images|docs|videos|gifs|audios)-\d+-[0-9a-f]{8}\./.test(name);
const uploadedFiles = () => UPLOAD_DIRS.flatMap((dir) => fs.readdirSync(dir).filter(isUpload).map((f) => path.join(dir, f)));
const existing = new Set(uploadedFiles());
const newFiles = () => uploadedFiles().filter((f) => !existing.has(f));

let server;
let baseUrl;
before(async () => {
  const { log, info } = console;
  console.log = console.info = () => {};
  const app = loadFromRoot("app.js");
  Object.assign(console, { log, info });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => {
  for (const file of newFiles()) fs.rmSync(file, { force: true });
});

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const formWith = (files, fields = { note: "hello" }) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const { field = "images", name = "photo.png", type = "image/png", content = PNG } of files) {
    form.append(field, new Blob([content], { type }), name);
  }
  return form;
};

const upload = async (method, url, form, { token, headers = {} } = {}) => {
  const res = await fetch(baseUrl + url, {
    method,
    headers: { role_id: "6", ...(token ? { "x-access-token": token } : {}), ...headers },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => undefined) };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Records every upload created in the upload folders while fn runs, then for waitMs more, or
// until until(events) is true (file events and the post-response deletion can lag under load)
const watchUploads = async (fn, { waitMs = 150, until = () => false } = {}) => {
  const events = [];
  const watchers = UPLOAD_DIRS.map((dir) => fs.watch(dir, (event, name) => isUpload(String(name)) && events.push(name)));
  try {
    const result = await fn();
    const deadline = Date.now() + waitMs;
    while (!until(events) && Date.now() < deadline) await sleep(25);
    return { result, events };
  } finally {
    watchers.forEach((w) => w.close());
  }
};

test("a request without a valid token never writes a file", async () => {
  const { result, events } = await watchUploads(async () => [
    await upload("POST", "/api/v1/service/createService", formWith([{}])),
    await upload("POST", "/api/v1/service/createService", formWith([{}]), { token: expiredAdminToken() }),
    await upload("POST", "/api/v1/service/createService", formWith([{}]), { token: userToken() }),
    await upload("POST", "/api/v1/booking/uploadImages", formWith([{}])),
  ]);
  assert.deepEqual(result.map((r) => r.status), [401, 401, 403, 401]);
  assert.deepEqual(events, [], "nothing was written, not even briefly");
});

test("files parsed for a request a role check then refuses (403) are deleted", async () => {
  const { result, events } = await watchUploads(
    () => upload("POST", "/api/v1/admin/auth/register", formWith([{}]), { token: adminToken(3) }),
    { waitMs: 3000, until: (seen) => seen.length > 0 && newFiles().length === 0 },
  );
  assert.equal(result.status, 403);
  assert.ok(events.length > 0, "the token was valid, so the file was written before the role check");
  assert.deepEqual(newFiles(), [], "and deleted after the 403");
});

test("an admin upload reaches the handler with its files, fields and the signed-in admin", async () => {
  const res = await upload("POST", "/api/v1/service/createService", formWith([{ name: "a.png" }, { name: "b.png" }]), { token: adminToken() });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.equal(res.json.user_type, "ADMIN");
  assert.equal(res.json.note, "hello");
  const [first, second] = res.json.files.images;
  assert.match(first, /^images-\d+-[0-9a-f]{8}\.png$/);
  assert.notEqual(first, second, "two files in one request get different names");
  assert.equal(newFiles().length, 2);
});

test("app-user, shared and public routes still accept uploads", async () => {
  const appUser = await upload("POST", "/api/v1/booking/uploadImages", formWith([{}]), { token: userToken() });
  assert.equal(appUser.status, 200, JSON.stringify(appUser.json));
  assert.equal(appUser.json.user_type, "USER");
  assert.equal(appUser.json.files.images.length, 1);

  const shared = await upload("PUT", "/api/v1/user/editAddress", formWith([{}]), { token: userToken() });
  assert.equal(shared.status, 200, JSON.stringify(shared.json));
  assert.equal(shared.json.files.images.length, 1);

  const open = await upload("POST", "/api/v1/contactUs/createContactUs", formWith([{ field: "docs", name: "brief.pdf", type: "application/pdf" }]));
  assert.equal(open.status, 200, JSON.stringify(open.json));
  assert.equal(open.json.files.docs.length, 1);
});

test("a file over 25 MB is refused with 413 and nothing is left on disk", async () => {
  const big = Buffer.alloc(25 * 1024 * 1024 + 1);
  const res = await upload("POST", "/api/v1/service/createService", formWith([{ content: big }]), { token: adminToken() });
  assert.equal(res.status, 413);
  assert.equal(res.json.success, false);
  assert.equal(res.json.message, "File too large. Each file can be up to 25 MB.");
  assert.deepEqual(newFiles(), []);
});

test("refused file types, unknown fields and too many files are a JSON 400", async () => {
  const token = adminToken();
  const exe = await upload("POST", "/api/v1/service/createService", formWith([{ name: "tool.exe", type: "application/x-msdownload" }]), { token });
  assert.equal(exe.status, 400);
  assert.match(exe.json.message, /^Only images/);

  const unknownField = await upload("POST", "/api/v1/service/createService", formWith([{ field: "attachments" }]), { token });
  assert.equal(unknownField.status, 400);
  assert.equal(unknownField.json.message, "Too many files, or an unexpected file field: attachments");

  const tooMany = await upload("POST", "/api/v1/service/createService", formWith(Array.from({ length: 21 }, () => ({}))), { token });
  assert.equal(tooMany.status, 400);
  assert.equal(tooMany.json.message, "Too many files, or an unexpected file field: images");
  assert.deepEqual(newFiles(), []);
});

test("the invoice CSV import keeps its own in-memory parser", async () => {
  const csv = formWith([{ field: "docs", name: "history.csv", type: "text/csv", content: Buffer.from("invoice,amount\n1,10\n") }], {});
  const res = await upload("POST", "/api/v1/invoice/import-historical-csv", csv, { token: adminToken() });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.file, { name: "history.csv", inMemory: true });
  assert.deepEqual(newFiles(), [], "not written to public/uploads");
});
