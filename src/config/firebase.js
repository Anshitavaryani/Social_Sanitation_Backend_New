const { initializeApp, cert, getApps } = require("firebase-admin/app");
const config = require("./config.js");

// The Firebase app behind push notifications, the Realtime Database (chat, live attendance) and
// Storage (chat files). Each process starts it once: the API (index.js) and the jobs (worker.js).
const initFirebase = () => {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
    databaseURL: config.firebase.databaseUrl,
    storageBucket: config.firebase.storageBucket,
  });
};

module.exports = { initFirebase };
