const { randomUUID } = require("crypto");
const { getStorage } = require("firebase-admin/storage");

// Uploads a local file to the default Firebase Storage bucket and returns a
// tokenised download URL in the same format the Firebase client SDK produced.
const uploadFileToFirebase = async (localPath, destination, contentType) => {
  const bucket = getStorage().bucket();
  const token = randomUUID();

  await bucket.upload(localPath, {
    destination,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
};

module.exports = { uploadFileToFirebase };
