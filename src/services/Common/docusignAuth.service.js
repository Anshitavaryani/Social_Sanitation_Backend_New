const docusign = require("docusign-esign");

const getDocusignClient = async () => {
  const dsApiClient = new docusign.ApiClient();

  // Auth server (demo)
  dsApiClient.setOAuthBasePath("account-d.docusign.com");

  // API server (demo)  ← THIS WAS MISSING
  dsApiClient.setBasePath("https://demo.docusign.net/restapi");

  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  const results = await dsApiClient.requestJWTUserToken(
    process.env.DOCUSIGN_INTEGRATION_KEY,
    process.env.DOCUSIGN_USER_ID,
    "signature impersonation",   // ← also fix this
    privateKey,
    3600
  );

  const accessToken = results.body.access_token;
  dsApiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

  return dsApiClient;
};

module.exports = { getDocusignClient };