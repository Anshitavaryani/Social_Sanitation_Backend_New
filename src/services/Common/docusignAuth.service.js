const docusign = require("docusign-esign");
const config = require("../../config/config");

const getDocusignClient = async () => {
  const dsApiClient = new docusign.ApiClient();

  // Demo or live DocuSign, from DOCUSIGN_OAUTH_BASE_PATH / DOCUSIGN_BASE_PATH (default: demo)
  dsApiClient.setOAuthBasePath(config.docusign.oAuthBasePath);
  dsApiClient.setBasePath(config.docusign.basePath);

  const results = await dsApiClient.requestJWTUserToken(
    config.docusign.integrationKey,
    config.docusign.userId,
    "signature impersonation",
    config.docusign.privateKey,
    3600
  );

  const accessToken = results.body.access_token;
  dsApiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

  return dsApiClient;
};

module.exports = { getDocusignClient };