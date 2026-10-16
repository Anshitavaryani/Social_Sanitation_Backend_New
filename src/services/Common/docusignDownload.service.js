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

module.exports = { downloadSignedPDF };