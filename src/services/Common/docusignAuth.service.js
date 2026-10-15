const docusign = require("docusign-esign");
const fs = require("fs");
const path = require("path");

const getDocusignClient = async () => {
  const dsApiClient = new docusign.ApiClient();

  // Auth server (demo)
  dsApiClient.setOAuthBasePath("account-d.docusign.com");

  // API server (demo)  ← THIS WAS MISSING
  dsApiClient.setBasePath("https://demo.docusign.net/restapi");

  const privateKeyPath = path.resolve(__dirname, "../../../private.key");
  const privateKey = fs.readFileSync(privateKeyPath, "utf8");

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