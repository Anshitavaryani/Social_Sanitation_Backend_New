// Company and staff details used in emails, PDFs and links, each written once
// (tests/companyStorage.test.js keeps them out of other files). The brand name in written text
// stays where it is.
const config = require("./config");
const { assetUrl, assetDataUri } = require("./storage");

const COMPANY = Object.freeze({
  PHONE: "(813) 296-9695",
  WEBSITE: "socialsanitation.com",
  // the company inbox: support address in emails, and where admin notifications go
  EMAIL: "socialsanitation@gmail.com",
  // support addresses in the welcome email, by account type
  CLIENT_SUPPORT_EMAIL: "clean.quote@socialsanitation.com",
  EMPLOYEE_SUPPORT_EMAIL: "reports@socialsanitation.com",
});

const APP_STORE_LINKS = Object.freeze({
  IOS: "https://apps.apple.com/in/app/social-sanitation-user/id6743349377",
  ANDROID: "https://play.google.com/store/apps/details?id=com.socialsanitation.user",
});

// Staff named in documents (decision D6: kept here until there is a setting for it)
const STAFF = Object.freeze({
  // signs estimates for the company, and is the estimate contact when a client has no BDM
  ESTIMATE_CONTACT: Object.freeze({ NAME: "Marco Williams", EMAIL: "m.williams@socialsanitation.com" }),
  // invoices to a client assigned to one of these admins (users.assigned_to) are sent from their address
  INVOICE_SENDER_BY_ADMIN_ID: Object.freeze({ 2: "m.williams@socialsanitation.com", 5: "y.claudio@socialsanitation.com" }),
});

// Address an invoice email is sent from: the client's assigned admin, or the default sender
const invoiceSenderEmail = (assignedAdminId) => STAFF.INVOICE_SENDER_BY_ADMIN_ID[assignedAdminId] || config.mail.senderEmail;

// A page of the admin panel (ADMIN_BASE_URL): adminPanelUrl("checkout")
const adminPanelUrl = (page = "") => `${config.adminBaseUrl}/${page}`;

// The company logo (public/assets/logo.jpg): a link for emails, inline for PDFs
const LOGO_FILE = "logo.jpg";
const LOGO_URL = assetUrl(LOGO_FILE);
const logoDataUri = () => assetDataUri(LOGO_FILE);

module.exports = {
  COMPANY,
  APP_STORE_LINKS,
  STAFF,
  invoiceSenderEmail,
  adminPanelUrl,
  LOGO_URL,
  logoDataUri,
};
