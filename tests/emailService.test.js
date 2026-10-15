// Welcome email support address and removal of the unused email helpers.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, loadFromRoot } = require("./helpers/mocks");

const sentMail = [];
mockModule("src/config/microsoftGraph.helper.js", {
  sendMailViaGraph: async (mail) => {
    sentMail.push(mail);
    return true;
  },
  sendMailViaGraphWithSender: async (mail) => {
    sentMail.push(mail);
    return true;
  },
});

const emailService = loadFromRoot("src/services/Common/email.service.js");

test("welcome email defaults to the general support address", async () => {
  sentMail.length = 0;
  await emailService.sendUserCredentials("new@example.com", "Secret#1");
  assert.equal(sentMail[0].to, "new@example.com");
  assert.match(sentMail[0].html, /mailto:socialsanitation@gmail\.com/);
  assert.match(sentMail[0].html, /Secret#1/);
});

test("welcome email uses the support address passed by the caller", async () => {
  sentMail.length = 0;
  await emailService.sendUserCredentials("client@example.com", "Secret#2", "clean.quote@socialsanitation.com");
  assert.match(sentMail[0].html, /mailto:clean\.quote@socialsanitation\.com/);
  assert.doesNotMatch(sentMail[0].html, /socialsanitation@gmail\.com/);
});

test("unused email helpers are no longer exported", () => {
  for (const name of [
    "sendEmailToUser",
    "sendRejectedBookingEmail",
    "sendUserDeletionEmail",
    "sendEmailWithAttachment",
    "sendContractReviewEmail",
    "sendPaymentSuccessEmail",
  ]) {
    assert.equal(emailService[name], undefined, name);
  }
});
