const docusign = require("docusign-esign");
const { getDocusignClient } = require("./docusignAuth.service");

const downloadSignedPDF = async (envelopeId) => {

  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const document = await envelopesApi.getDocument(
    process.env.DOCUSIGN_ACCOUNT_ID,
    envelopeId,
    "combined"
  );

  return document;
};

module.exports = { downloadSignedPDF };