const docusign = require("docusign-esign");
const { getDocusignClient } = require("./docusignAuth.service");
const config = require("../../config/config");

// Resuming a signature: DocuSign emails the envelope to its signers again. Every envelope here is
// signed from that email (none is set up for signing inside the app, which needs a clientUserId per
// signer), so the old embedded signing link always failed.
const resendSigningEmail = async (envelopeId) => {
  const dsApiClient = await getDocusignClient();
  await new docusign.EnvelopesApi(dsApiClient).update(config.docusign.accountId, envelopeId, {
    resendEnvelope: "true",
    envelope: {},
  });
};

module.exports = { resendSigningEmail };
