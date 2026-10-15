const docusign = require("docusign-esign");
const { getDocusignClient } = require("./docusignAuth.service");

const getSigningUrl = async ({
  envelopeId,
  signerEmail,
  signerName,
}) => {

  const dsApiClient = await getDocusignClient();
  const envelopesApi = new docusign.EnvelopesApi(dsApiClient);

  const viewRequest = new docusign.RecipientViewRequest();

  viewRequest.returnUrl = "https://admin.socialsanitation.com/docusign-success";
  viewRequest.authenticationMethod = "none";
  viewRequest.email = signerEmail;
  viewRequest.userName = signerName;
  viewRequest.clientUserId = "admin_signer"; // 🔥 MUST MATCH

  const results = await envelopesApi.createRecipientView(
    process.env.DOCUSIGN_ACCOUNT_ID,
    envelopeId,
    { recipientViewRequest: viewRequest }
  );

  return results.url;
};

module.exports = { getSigningUrl };