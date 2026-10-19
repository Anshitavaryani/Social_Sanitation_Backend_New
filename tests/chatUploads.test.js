// Chat and team-chat attachments now go through the shared firebase-admin upload helper.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { mockModule, mockDatabase, mockFirebase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();
const { db, sent } = mockFirebase();

const uploads = [];
mockModule("src/config/firebaseStorage.js", {
  uploadFileToFirebase: async (localPath, destination, contentType) => {
    uploads.push({ localPath, destination, contentType, existed: fs.existsSync(localPath) });
    return `https://firebasestorage.googleapis.com/v0/b/test/o/${encodeURIComponent(destination)}?alt=media&token=t`;
  },
});

const chatService = loadFromRoot("src/services/Common/chat.service.js");
const groupChatService = loadFromRoot("src/services/Common/groupChat.service.js");

const tmpUpload = (name) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ss-chat-")), name);
  fs.writeFileSync(file, "x");
  return file;
};

beforeEach(() => {
  uploads.length = 0;
  db.writes.length = 0;
  db.data = {};
});

test("direct chat uploads the multer file from disk and stores its URL on both messages", async () => {
  const filePath = tmpUpload("images-1.jpg");
  models.User.findOne = async ({ where }) => ({ id: where.id, role_id: 6 });
  models.User.findByPk = async (id) => ({ id, role_id: 6, name: "Client" });
  models.UserToken.findAll = async () => [{ fcm_token: "device-token" }];
  const quiet = console.log;
  const quietError = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    await chatService.sendMessage(
      { user: { id: 1, role_id: 1 }, message: "hello", receiverUserId: 9, user_type: "ADMIN" },
      { images: [{ path: filePath, filename: "images-1.jpg", mimetype: "image/jpeg" }] },
      {},
    );
  } finally {
    console.log = quiet;
    console.error = quietError;
  }

  assert.deepEqual(uploads, [
    { localPath: filePath, destination: "files/images/images-1.jpg", contentType: "image/jpeg", existed: true },
  ]);
  const pushes = db.writes.filter((w) => w.op === "push");
  assert.equal(pushes.length, 2);
  for (const write of pushes) {
    assert.equal(write.value.imageUrls.length, 1);
    assert.match(write.value.imageUrls[0], /files%2Fimages%2Fimages-1\.jpg/);
  }
  assert.equal(sent.length, 1, "the app user the admin wrote to gets a push notification");
  assert.deepEqual(sent[0].tokens, ["device-token"]);
});

test("team chat uploads every attachment type and deletes the local temp file afterwards", async () => {
  db.data["GroupChats/42"] = { isTeam: false };
  const image = tmpUpload("images-2.png");
  const pdf = tmpUpload("docs-1.pdf");
  const quietError = console.error;
  console.error = () => {};

  let result;
  try {
    result = await groupChatService.sendGroupMessage(
      { groupId: 42, message: "see attached", user_type: "ADMIN", user: { id: 3, role_id: 1, user_profile: { name: "Admin" } } },
      {
        images: [{ path: image, filename: "images-2.png", originalname: "site.png", mimetype: "image/png" }],
        docs: [{ path: pdf, filename: "docs-1.pdf", originalname: "report.pdf", mimetype: "application/pdf" }],
      },
    );
  } finally {
    console.error = quietError;
  }

  assert.equal(uploads.length, 2);
  assert.ok(uploads.every((u) => u.existed && u.destination.startsWith("team-chat/")));
  assert.deepEqual(
    uploads.map((u) => u.contentType),
    ["image/png", "application/pdf"],
  );
  assert.deepEqual(
    result.attachments.map((a) => [a.type, a.fileName]),
    [
      ["IMAGE", "site.png"],
      ["PDF", "report.pdf"],
    ],
  );
  assert.equal(result.imageUrls.length, 1);
  assert.equal(fs.existsSync(image), false, "temp image should be removed");
  assert.equal(fs.existsSync(pdf), false, "temp pdf should be removed");
});
