// The DocuSign webhook is not signed, so it asks DocuSign for the envelope's status before marking a
// service request, estimate or contract as signed (anyone could post "envelope-completed").
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { mockModule, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models } = mockDatabase();

let envelopeStatus;
const downloads = [];
mockModule("src/services/Common/docusignDownload.service.js", {
  getEnvelopeStatus: async () => {
    if (envelopeStatus instanceof Error) throw envelopeStatus;
    return envelopeStatus;
  },
  downloadSignedPDF: async (id) => downloads.push(id) && Buffer.from("%PDF-signed"),
});
mockModule("src/services/Common/email.service.js", new Proxy({}, { get: () => async () => true }));

const ServiceRequest = loadFromRoot("src/models/serviceRequest.model.js");
const controller = loadFromRoot("src/controllers/Admin/serviceEstimate.controller.js");
const { UPLOAD_DIRS } = loadFromRoot("src/config/storage.js");
const { contractStatusTypes } = loadFromRoot("src/config/types.js");

const updates = [];
ServiceRequest.findOne = async () => null;
models.ServiceEstimate.findOne = async () => null;
models.ContractAgreement.findOne = async () => ({
  file_name: `contract-test-${process.pid}.pdf`,
  update: async (values) => updates.push(values),
});

const post = async (body) => {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(text) {
      this.body = text;
      return this;
    },
  };
  await controller.handleDocusignWebhook({ body }, res);
  return res.body;
};
const completedEvent = { event: "envelope-completed", data: { envelopeId: "ENV-9" } };

test("an envelope-completed event for an envelope DocuSign has not completed changes nothing", async () => {
  updates.length = 0;
  downloads.length = 0;
  envelopeStatus = "sent";
  assert.equal(await post(completedEvent), "Ignored");
  envelopeStatus = new Error("DocuSign unreachable");
  assert.equal(await post(completedEvent), "Lookup failed");
  assert.deepEqual([updates.length, downloads.length], [0, 0]);
});

test("an envelope DocuSign reports completed is saved as signed", async () => {
  updates.length = 0;
  envelopeStatus = "completed";
  try {
    assert.equal(await post(completedEvent), "Webhook processed");
    assert.deepEqual(downloads, ["ENV-9"]);
    assert.equal(updates[0].status, contractStatusTypes.SIGNED);
  } finally {
    fs.rmSync(path.join(UPLOAD_DIRS.docs, `signed-contract-test-${process.pid}.pdf`), { force: true });
  }
});
