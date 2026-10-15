/** @format */

const docusign = require("docusign-esign");
const fs = require("fs");
const { getDocusignClient } = require("./docusignAuth.service");

const createEnvelope = async ({ pdfPath, signerEmail, signerName }) => {
  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const pdfBytes = fs.readFileSync(pdfPath).toString("base64");

  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = "Please sign your Service Estimate";

  /* Disable reminders + expiration */
  envelopeDefinition.notification = new docusign.Notification();
  envelopeDefinition.notification.useAccountDefaults = "false";

  const reminders = new docusign.Reminders();
  reminders.reminderEnabled = "false";

  const expirations = new docusign.Expirations();
  expirations.expireEnabled = "false";

  envelopeDefinition.notification.reminders = reminders;
  envelopeDefinition.notification.expirations = expirations;

  /* DOCUMENT */
  const document = new docusign.Document();
  document.documentBase64 = pdfBytes;
  document.name = "Service Estimate";
  document.fileExtension = "pdf";
  document.documentId = "1";

  /* SIGNER */
  const signer = new docusign.Signer();
  signer.email = signerEmail;
  signer.name = signerName;
  signer.recipientId = "1";
  signer.routingOrder = "1";

  /* CLIENT SIGNATURE */
  const signHere = new docusign.SignHere();
  signHere.documentId = "1";
  signHere.recipientId = "1";

  signHere.anchorString = "**SIGN_HERE**";
  signHere.anchorUnits = "pixels";

  // Center on the client signature line
  signHere.anchorXOffset = "0";
  signHere.anchorYOffset = "-20";

  signHere.width = "160";
  signHere.height = "30";
  signHere.optional = "false";

  signer.tabs = new docusign.Tabs();
  signer.tabs.signHereTabs = [signHere];

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  envelopeDefinition.documents = [document];
  envelopeDefinition.recipients = recipients;
  envelopeDefinition.status = "sent";

  const results = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID,
    { envelopeDefinition }
  );

  return results.envelopeId;
};

const createContractEnvelope = async ({
  pdfPath,
  clientEmail,
  clientName,
}) => {
  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const pdfBytes = fs.readFileSync(pdfPath).toString("base64");

  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = "Please sign your Contract Agreement";

  /* ================= DOCUMENT ================= */

  const document = new docusign.Document();
  document.documentBase64 = pdfBytes;
  document.name = "Contract Agreement";
  document.fileExtension = "pdf";
  document.documentId = "1";

  /* ================= CLIENT SIGNER ================= */

  const clientSigner = new docusign.Signer();
  clientSigner.email = clientEmail;
  clientSigner.name = clientName;
  clientSigner.recipientId = "1";
  clientSigner.routingOrder = "1";

  /* ================= CLIENT SIGNATURE ================= */

  const clientSignHere = new docusign.SignHere();
  clientSignHere.documentId = "1";
  clientSignHere.recipientId = "1";
  clientSignHere.anchorString = "**CLIENT_SIGN**";
  clientSignHere.anchorYOffset = "15";

  /* ================= CLIENT TEXT FIELDS ================= */

  const startDateTab = new docusign.Text();
  startDateTab.documentId = "1";
  startDateTab.recipientId = "1";
  startDateTab.tabLabel = "start_date";
  startDateTab.anchorString = "/start_date/";
  startDateTab.anchorYOffset = "-5";

  const startTimeTab = new docusign.Text();
  startTimeTab.documentId = "1";
  startTimeTab.recipientId = "1";
  startTimeTab.tabLabel = "start_time";
  startTimeTab.anchorString = "/start_time/";
  startTimeTab.anchorYOffset = "-5";

  const serviceDaysTab = new docusign.Text();
  serviceDaysTab.documentId = "1";
  serviceDaysTab.recipientId = "1";
  serviceDaysTab.tabLabel = "service_days";
  serviceDaysTab.anchorString = "/service_days/";
  serviceDaysTab.anchorYOffset = "-5";

  /* ================= PAYMENT OPTIONS ================= */

  const eftCheckbox = new docusign.Checkbox();
  eftCheckbox.documentId = "1";
  eftCheckbox.recipientId = "1";
  eftCheckbox.tabLabel = "payment_eft";
  eftCheckbox.anchorString = "/payment_eft/";
  eftCheckbox.anchorXOffset = "-16";
  eftCheckbox.anchorYOffset = "2";

  const checkCheckbox = new docusign.Checkbox();
  checkCheckbox.documentId = "1";
  checkCheckbox.recipientId = "1";
  checkCheckbox.tabLabel = "payment_check";
  checkCheckbox.anchorString = "/payment_check/";
  checkCheckbox.anchorXOffset = "-16";
  checkCheckbox.anchorYOffset = "2";

  const cardCheckbox = new docusign.Checkbox();
  cardCheckbox.documentId = "1";
  cardCheckbox.recipientId = "1";
  cardCheckbox.tabLabel = "payment_card";
  cardCheckbox.anchorString = "/payment_card/";
  cardCheckbox.anchorXOffset = "-16";
  cardCheckbox.anchorYOffset = "2";

  /* ================= ATTACH TABS ================= */

  clientSigner.tabs = new docusign.Tabs();
  clientSigner.tabs.signHereTabs = [clientSignHere];
  clientSigner.tabs.textTabs = [
    startDateTab,
    startTimeTab,
    serviceDaysTab,
  ];
  clientSigner.tabs.checkboxTabs = [
    eftCheckbox,
    checkCheckbox,
    cardCheckbox,
  ];

  /* ================= FINAL ================= */

  const recipients = new docusign.Recipients();
  recipients.signers = [clientSigner];

  envelopeDefinition.documents = [document];
  envelopeDefinition.recipients = recipients;
  envelopeDefinition.status = "sent";

  const results = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID,
    { envelopeDefinition },
  );

  return results.envelopeId;
};

const createServiceRequestEnvelope = async ({
  pdfPath,
  clientEmail,
  clientName,
}) => {
  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const pdfBytes = fs.readFileSync(pdfPath).toString("base64");

  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.emailSubject = "Please sign your Service Request";

  /* ================= DOCUMENT ================= */
  const document = new docusign.Document();
  document.documentBase64 = pdfBytes;
  document.name = "Service Request";
  document.fileExtension = "pdf";
  document.documentId = "1";

  /* ================= CLIENT SIGNER ================= */
  const signer = new docusign.Signer();
  signer.email = clientEmail;
  signer.name = clientName;
  signer.recipientId = "1";
  signer.routingOrder = "1";

  /* 🚫 REMOVE THESE (IMPORTANT) */
  // signer.clientUserId ❌
  // signer.suppressEmails ❌

  /* ================= SIGNATURE TAB ================= */
  const signHere = new docusign.SignHere();
  signHere.documentId = "1";
  signHere.pageNumber = "1"; // ⚠️ adjust if needed
  signHere.xPosition = "430";
  signHere.yPosition = "490";

  signer.tabs = new docusign.Tabs();
  signer.tabs.signHereTabs = [signHere];

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  envelopeDefinition.documents = [document];
  envelopeDefinition.recipients = recipients;
  envelopeDefinition.status = "sent";

  const results = await envelopesApi.createEnvelope(
    process.env.DOCUSIGN_ACCOUNT_ID,
    { envelopeDefinition },
  );

  return results.envelopeId;
};

module.exports = {
  createEnvelope,
  createContractEnvelope,
  createServiceRequestEnvelope,
};
