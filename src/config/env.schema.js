// Every environment variable the app reads, checked once at start-up by config.js.
// .env.example lists exactly these keys (tests/configSource.test.js keeps the two in step).
// Other variables in the environment are ignored.
const Joi = require("joi");

// Optional settings: an empty value (`KEY=` in .env) counts as not set
const optional = (schema) => schema.empty("");

const timeZone = Joi.string().custom((value, helpers) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return helpers.error("any.invalid");
  }
}, "IANA time zone");

const envSchema = Joi.object({
  // App
  APP_NAME: Joi.string().required().description("Application name"),
  NODE_ENV: Joi.string().valid("production", "development", "test").required(),
  PORT: optional(Joi.number()).default(5000).description("Port the API listens on"),
  DEFAULT_TIMEZONE: optional(timeZone).default("UTC").description("Time zone of the server process (keep UTC)"),
  BUSINESS_TIMEZONE: optional(timeZone)
    .default("America/New_York")
    .description("Time zone the business runs on: \"today\", weeks, months and cron jobs"),
  ACCESSDOMAINS: Joi.string().required().description("Origins allowed to call the API (CORS), comma separated"),
  API_BASE_URL: optional(Joi.string().uri({ scheme: ["http", "https"] }))
    .default("https://node.socialsanitation.com/api/v1")
    .description("Public URL of this API, ending in /api/v1: document and logo links, the Twilio status callback"),
  ADMIN_BASE_URL: optional(Joi.string().uri({ scheme: ["http", "https"] }))
    .default("https://admin.socialsanitation.com")
    .description("Public URL of the admin panel: links in emails, the Square checkout and DocuSign return pages"),
  DEFAULT_AMOUNT: optional(Joi.number()).default(5).description("Default amount of a new payment row"),
  PUPPETEER_EXECUTABLE_PATH: optional(Joi.string())
    .default("/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome")
    .description("Chrome binary used by puppeteer-core for PDF generation"),
  GOOGLE_API_KEY: optional(Joi.string()).description("Google Maps key used to read coordinates from map links"),

  // Database
  CENTRAL_MYSQL_HOST: Joi.string().required().description("MySQL host"),
  CENTRAL_MYSQL_PORT: Joi.string().required().description("MySQL port"),
  CENTRAL_MYSQL_USER: Joi.string().required().description("MySQL user"),
  CENTRAL_MYSQL_PASSWORD: optional(Joi.string()).description("MySQL password"),
  CENTRAL_MYSQL_DB: Joi.string().required().description("MySQL database name"),

  // Sign-in tokens
  JWT_SECRET: Joi.string().required().description("Secret that signs admin and app tokens (hex)"),
  JWT_ACCESS_EXPIRATION_DAYS: Joi.number().positive().required().description("Days an app sign-in token is valid"),
  JWT_ADMIN_ACCESS_EXPIRATION_DAYS: optional(Joi.number().positive())
    .default(5)
    .description("Days an admin sign-in token is valid"),
  JWT_ADMIN_RESET_EXPIRATION_DAYS: optional(Joi.number().positive())
    .default(1)
    .description("Days an admin password-reset token is valid"),

  // The first super admin (npm run auth); role ids live in src/config/roles.js
  ADM_DEPT_ID: optional(Joi.string()).description("Department of the first super admin"),
  SUPER_ADMIN_NAME: optional(Joi.string()).description("Name of the first super admin"),
  SUPER_ADMIN_EMAIL: optional(Joi.string()).description("Email of the first super admin"),
  SUPER_ADMIN_PASSWORD: optional(Joi.string()).description("Password of the first super admin"),

  // Firebase (chat database, push notifications, file storage)
  FIREBASE_PROJECT_ID: Joi.string().required().description("Firebase project id"),
  FIREBASE_CLIENT_EMAIL: Joi.string().required().description("Firebase service account email"),
  FIREBASE_PRIVATE_KEY: Joi.string().required().description("Firebase service account private key (\\n for line breaks)"),
  FIREBASE_DATABASE_URL: optional(Joi.string())
    .default("https://social-sanitation-default-rtdb.firebaseio.com")
    .description("Firebase Realtime Database URL"),
  FIREBASE_STORAGE_BUCKET: optional(Joi.string())
    .default("social-sanitation.firebasestorage.app")
    .description("Firebase Storage bucket"),

  // Mail (Microsoft Graph)
  AZURE_TENANT_ID: optional(Joi.string()).description("Microsoft 365 tenant id"),
  AZURE_CLIENT_ID: Joi.string().required().description("App registration client id"),
  AZURE_CLIENT_SECRET: Joi.string().required().description("App registration client secret"),
  AZURE_SENDER_EMAIL: optional(Joi.string()).description("Mailbox emails are sent from"),

  // Square payments
  SQUARE_ENVIRONMENT: optional(Joi.string())
    .default("sandbox")
    .description("\"production\" for live payments; anything else uses the sandbox"),
  SQUARE_ACCESS_TOKEN: optional(Joi.string()).description("Square access token"),
  SQUARE_APP_ID: optional(Joi.string()).description("Square application id (sent to the apps)"),
  SQUARE_LOCATION_ID: optional(Joi.string()).description("Square location id"),
  SQUARE_WEBHOOK_SIGNATURE_KEY: optional(Joi.string()).description("Signature key of the Square webhook subscription"),
  SQUARE_WEBHOOK_URL: optional(Joi.string()).description("Notification URL registered with Square for the webhook"),

  // DocuSign
  DOCUSIGN_INTEGRATION_KEY: optional(Joi.string()).description("DocuSign integration key"),
  DOCUSIGN_USER_ID: optional(Joi.string()).description("DocuSign user id the app signs in as"),
  DOCUSIGN_ACCOUNT_ID: optional(Joi.string()).description("DocuSign account id"),
  DOCUSIGN_PRIVATE_KEY: optional(Joi.string()).description("DocuSign RSA private key (\\n for line breaks)"),
  DOCUSIGN_OAUTH_BASE_PATH: optional(Joi.string())
    .default("account-d.docusign.com")
    .description("DocuSign sign-in host (demo: account-d.docusign.com, live: account.docusign.com)"),
  DOCUSIGN_BASE_PATH: optional(Joi.string())
    .default("https://demo.docusign.net/restapi")
    .description("DocuSign API base path (live: the account's base URI + /restapi)"),

  // SMS (Twilio)
  TWILIO_ACCOUNT_SID: optional(Joi.string()).description("Twilio account SID"),
  TWILIO_AUTH_TOKEN: optional(Joi.string()).description("Twilio auth token"),
  TWILIO_FROM: optional(Joi.string()).description("Twilio sender number"),
}).unknown();

module.exports = envSchema;
