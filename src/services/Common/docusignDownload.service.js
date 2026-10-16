const docusign = require("docusign-esign");
const { getDocusignClient } = require("./docusignAuth.service");
const config = require("../../config/config");

const downloadSignedPDF = async (envelopeId) => {

  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const document = await envelopesApi.getDocument(
    config.docusign.accountId,
    envelopeId,
    "combined"
  );

  return document;
};

// The envelope's status as DocuSign records it ("completed" once everyone has signed). The
// webhook is not signed, so the app asks DocuSign before treating an envelope as signed.
const getEnvelopeStatus = async (envelopeId) => {
  const dsApiClient = await getDocusignClient();
  const envelope = await new docusign.EnvelopesApi(dsApiClient).getEnvelope(config.docusign.accountId, envelopeId, {});
  return envelope?.status;
};

module.exports = { downloadSignedPDF, getEnvelopeStatus };