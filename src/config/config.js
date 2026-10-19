// The only module that reads the environment (tests/configSource.test.js enforces it).
// Values come from .env (or DOTENV_CONFIG_PATH), are checked against env.schema.js at
// start-up, and are exported grouped by service; the rest of the app reads them from here.
const dotenv = require('dotenv')
const path = require('path')

const envSchema = require('./env.schema');

// Tests point DOTENV_CONFIG_PATH at a file that does not exist, so they never read a developer's .env
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../../.env'), quiet: true });

const { value: envVars, error } = envSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
    throw new Error(`Config validation error: ${error.message}`);
}

// Private keys are stored in .env on one line, with \n for each line break
const multiline = (key) => key && key.replace(/\\n/g, '\n');

module.exports = {
    app_name: envVars.APP_NAME,
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    logLevel: envVars.LOG_LEVEL || { development: 'debug', test: 'silent' }[envVars.NODE_ENV] || 'info',
    DEFAULT_TIMEZONE: envVars.DEFAULT_TIMEZONE,
    businessTimeZone: envVars.BUSINESS_TIMEZONE,
    accessDomains: envVars.ACCESSDOMAINS,
    // Public URLs, without a trailing slash (storage.js and company.js build links from them)
    apiBaseUrl: envVars.API_BASE_URL.replace(/\/+$/, ''),
    adminBaseUrl: envVars.ADMIN_BASE_URL.replace(/\/+$/, ''),
    // Uploaded and generated files live in <storageDir>/uploads (default: public/uploads)
    storageDir: envVars.STORAGE_DIR,
    ownershipChecks: envVars.OWNERSHIP_CHECKS,
    DEFAULT_AMOUNT: envVars.DEFAULT_AMOUNT,
    PUPPETEER_EXECUTABLE_PATH: envVars.PUPPETEER_EXECUTABLE_PATH,
    GOOGLE_API_KEY: envVars.GOOGLE_API_KEY,

    databases: {
        central: {
            db: envVars.CENTRAL_MYSQL_DB,
            port: envVars.CENTRAL_MYSQL_PORT,
            host: envVars.CENTRAL_MYSQL_HOST,
            user: envVars.CENTRAL_MYSQL_USER,
            passwd: envVars.CENTRAL_MYSQL_PASSWORD,
        },
    },
    jwt: {
        secret: envVars.JWT_SECRET,
        accessExpirationDays: envVars.JWT_ACCESS_EXPIRATION_DAYS,
        adminAccessExpirationDays: envVars.JWT_ADMIN_ACCESS_EXPIRATION_DAYS,
        adminResetExpirationDays: envVars.JWT_ADMIN_RESET_EXPIRATION_DAYS,
    },

    ADM_DEPT_ID: envVars.ADM_DEPT_ID,
    SUPER_ADMIN_NAME: envVars.SUPER_ADMIN_NAME,
    SUPER_ADMIN_PASSWORD: envVars.SUPER_ADMIN_PASSWORD,
    SUPER_ADMIN_EMAIL: envVars.SUPER_ADMIN_EMAIL,

    firebase: {
        projectId: envVars.FIREBASE_PROJECT_ID,
        clientEmail: envVars.FIREBASE_CLIENT_EMAIL,
        privateKey: multiline(envVars.FIREBASE_PRIVATE_KEY),
        databaseUrl: envVars.FIREBASE_DATABASE_URL,
        storageBucket: envVars.FIREBASE_STORAGE_BUCKET,
    },
    mail: {
        tenantId: envVars.AZURE_TENANT_ID,
        clientId: envVars.AZURE_CLIENT_ID,
        clientSecret: envVars.AZURE_CLIENT_SECRET,
        senderEmail: envVars.AZURE_SENDER_EMAIL,
    },
    square: {
        environment: envVars.SQUARE_ENVIRONMENT,
        accessToken: envVars.SQUARE_ACCESS_TOKEN,
        appId: envVars.SQUARE_APP_ID,
        locationId: envVars.SQUARE_LOCATION_ID,
        webhookSignatureKey: envVars.SQUARE_WEBHOOK_SIGNATURE_KEY,
        webhookUrl: envVars.SQUARE_WEBHOOK_URL,
    },
    docusign: {
        integrationKey: envVars.DOCUSIGN_INTEGRATION_KEY,
        userId: envVars.DOCUSIGN_USER_ID,
        accountId: envVars.DOCUSIGN_ACCOUNT_ID,
        privateKey: multiline(envVars.DOCUSIGN_PRIVATE_KEY),
        oAuthBasePath: envVars.DOCUSIGN_OAUTH_BASE_PATH,
        basePath: envVars.DOCUSIGN_BASE_PATH,
    },
    twilio: {
        accountSid: envVars.TWILIO_ACCOUNT_SID,
        authToken: envVars.TWILIO_AUTH_TOKEN,
        from: envVars.TWILIO_FROM,
    },
};
