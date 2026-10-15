// firebase-admin upload helper, exercised against a local fake of the Cloud Storage API.
const { privateKey } = require("./helpers/env");
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { ROOT, loadFromRoot } = require("./helpers/mocks");

const { CRC32C } = require(require.resolve("@google-cloud/storage", { paths: [ROOT] }));

const requests = [];
let server;
let tmpFile;
const fileBytes = crypto.randomBytes(2048);

before(async () => {
  // Minimal resumable-upload API: session POST -> Location, then PUT of the bytes
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url.includes("uploadType=resumable")) {
        res.setHeader("location", `http://127.0.0.1:${server.address().port}/upload-session/1`);
        return res.end("{}");
      }
      const crc = new CRC32C();
      crc.update(body);
      res.end(
        JSON.stringify({
          name: "uploaded",
          bucket: process.env.FIREBASE_STORAGE_BUCKET,
          crc32c: crc.toString(),
          md5Hash: crypto.createHash("md5").update(body).digest("base64"),
        }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.STORAGE_EMULATOR_HOST = `http://127.0.0.1:${server.address().port}`;

  const { initializeApp, cert } = require(require.resolve("firebase-admin/app", { paths: [ROOT] }));
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ss-upload-")), "photo.png");
  fs.writeFileSync(tmpFile, fileBytes);
});

after(() => new Promise((resolve) => server.close(resolve)));

test("uploads the file with a download token and returns a tokenised Firebase URL", async () => {
  const { uploadFileToFirebase } = loadFromRoot("src/config/firebaseStorage.js");
  const destination = "files/images/images-123.png";

  const url = await uploadFileToFirebase(tmpFile, destination, "image/png");

  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  const match = url.match(
    /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)\?alt=media&token=([0-9a-f-]{36})$/,
  );
  assert.ok(match, `unexpected URL format: ${url}`);
  assert.equal(match[1], bucket);
  assert.equal(decodeURIComponent(match[2]), destination);

  const session = requests.find((r) => r.method === "POST");
  const metadata = JSON.parse(session.body.toString());
  const sessionUrl = new URL(session.url, "http://localhost");
  assert.equal(sessionUrl.searchParams.get("name"), destination);
  assert.equal(metadata.contentType || session.headers["x-upload-content-type"], "image/png");
  assert.equal(metadata.metadata.firebaseStorageDownloadTokens, match[3], "URL token must match the stored token");
  assert.ok(session.url.startsWith(`/upload/storage/v1/b/${bucket}/o`));

  const upload = requests.find((r) => r.method === "PUT");
  assert.ok(upload.body.equals(fileBytes), "uploaded bytes must be the local file");
});
