const { Client } = require("@microsoft/microsoft-graph-client");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const fs = require("fs");
const path = require("path");

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
  },
});

async function getGraphClient() {
  const token = await msalClient.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  return Client.init({
    authProvider: (done) => done(null, token.accessToken),
    fetch,
  });
}

async function sendMailViaGraph({
  to,
  cc,
  subject,
  html,
  attachments = [],
}) {
  const graphClient = await getGraphClient();

  const graphAttachments = attachments.map((filePath) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: path.basename(filePath),
    contentBytes: fs.readFileSync(filePath).toString("base64"),
  }));

  const message = {
    subject,
    body: {
      contentType: "HTML",
      content: html,
    },

    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],

    attachments: graphAttachments,
  };

  if (cc) {
    const ccEmails = Array.isArray(cc) ? cc : [cc];

    message.ccRecipients = ccEmails
      .filter(Boolean)
      .map((email) => ({
        emailAddress: {
          address: email,
        },
      }));
  }

  await graphClient
    .api(`/users/${process.env.AZURE_SENDER_EMAIL}/sendMail`)
    .post({
      message,
      saveToSentItems: true,
    });
}


async function sendMailViaGraphWithSender({
	from,
	to,
	subject,
	html,
	attachments = [],
}) {
	const graphClient = await getGraphClient();

	const graphAttachments = attachments.map((filePath) => ({
		"@odata.type": "#microsoft.graph.fileAttachment",
		name: path.basename(filePath),
		contentBytes: fs.readFileSync(filePath).toString("base64"),
	}));

	await graphClient
		.api(`/users/${from}/sendMail`) // ✅ dynamic sender
		.post({
			message: {
				subject,
				body: {
					contentType: "HTML",
					content: html,
				},
				toRecipients: [{ emailAddress: { address: to } }],
				attachments: graphAttachments,
			},
			saveToSentItems: true,
		});
}

module.exports = { sendMailViaGraph,sendMailViaGraphWithSender };
