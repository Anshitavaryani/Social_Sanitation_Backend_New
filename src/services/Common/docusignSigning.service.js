const docusign = require("docusign-esign");
const { adminPanelUrl } = require("../../config/company");
const { getDocusignClient } = require("./docusignAuth.service");
const config = require("../../config/config");

const getSigningUrl = async ({
  envelopeId,
  signerEmail,
  signerName,
}) => {

  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const viewRequest = new docusign.RecipientViewRequest();

  viewRequest.returnUrl = adminPanelUrl("docusign-success");
  viewRequest.authenticationMethod = "none";
  viewRequest.email = signerEmail;
  viewRequest.userName = signerName;
  viewRequest.clientUserId = "admin_signer"; // 🔥 MUST MATCH

  const results = await envelopesApi.createRecipientView(
    config.docusign.accountId,
    envelopeId,
    { recipientViewRequest: viewRequest }
  );

  return results.url;
};

module.exports = { getSigningUrl };