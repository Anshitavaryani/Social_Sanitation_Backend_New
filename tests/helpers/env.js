// Test environment: required by every test file before anything from src/.
// dotenv never overrides variables that are already set, so these values win
// over the developer's .env and no test talks to a real service.
const { generateKeyPairSync } = require("crypto");

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const TEST_JWT_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

Object.assign(process.env, {
  NODE_ENV: "test",
  DEBUG: "none",
  APP_NAME: "social_sanitation_test",
  PORT: "0",
  JWT_SECRET: TEST_JWT_SECRET,
  CENTRAL_MYSQL_HOST: "127.0.0.1",
  CENTRAL_MYSQL_PORT: "3999",
  CENTRAL_MYSQL_USER: "test",
  CENTRAL_MYSQL_PASSWORD: "test",
  CENTRAL_MYSQL_DB: "test",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "2",
  FIREBASE_PROJECT_ID: "demo-test",
  FIREBASE_CLIENT_EMAIL: "test@demo-test.iam.gserviceaccount.com",
  FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  FIREBASE_STORAGE_BUCKET: "demo-test.firebasestorage.app",
  TWILIO_ACCOUNT_SID: "AC00000000000000000000000000000000",
  TWILIO_AUTH_TOKEN: "test",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_ACCESS_TOKEN: "test-square-token",
  SQUARE_LOCATION_ID: "test-location",
  AZURE_CLIENT_ID: "test",
  AZURE_CLIENT_SECRET: "test",
  AZURE_TENANT_ID: "common",
});

module.exports = { TEST_JWT_SECRET, privateKey };
