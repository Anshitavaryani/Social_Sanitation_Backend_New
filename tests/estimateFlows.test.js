// Estimates, contracts and quotes sent to clients: the PDF, the DocuSign envelope or Square link,
// and the row saved, with document file names that stay inside the docs folder.
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { recordingDatabase, recordingModule } = require("./helpers/recordingDb");
const { loadFromRoot, mockModule } = require("./helpers/mocks");

const db = recordingDatabase();
recordingModule("src/config/logger.js", db.log, {});
recordingModule("src/services/Common/email.service.js", db.log, {});
recordingModule("src/services/Common/docusignEnvelope.service.js", db.log, { createEnvelope: "ENV-EST", createContractEnvelope: "ENV-CON", createServiceRequestEnvelope: "ENV-SR" });
recordingModule("src/services/Common/square.service.js", db.log, {
  generateContractPaymentLink: ({ amount }) => ({ paymentUrl: `https://square.test/contract/${amount}`, paymentLinkId: "LINK-C" }),
  generateSquarePaymentLink: ({ amount }) => ({ paymentUrl: `https://square.test/quote/${amount}`, paymentLinkId: "LINK-Q" }),
});
recordingModule("src/services/Common/estimatePdf.service.js", db.log, { generateEstimatePDF: (data, pdfPath) => pdfPath, generateContractPDF: (data, pdfPath) => pdfPath });
recordingModule("src/services/Common/pdf.service.js", db.log, { generateQuotePDF: ({ ref_no }) => `/srv/uploads/docs/quote-${ref_no}.pdf` });
const sms = [];
mockModule("src/config/sendSMS.js", async (message) => sms.push(message) && { sid: "SM1" });

const estimates = loadFromRoot("src/services/Admin/serviceEstimate.service.js");
const users = loadFromRoot("src/services/Admin/user.service.js");
const { UPLOAD_DIRS, safeFileName } = loadFromRoot("src/config/storage.js");

beforeEach(() => {
  db.reset();
  sms.length = 0;
  db.respond("User.findOne", (q) => ({ id: q.where.id, email: "client@example.com", user_profile: { name: "Jane Client" } }));
  db.respond("User.findByPk", (id) => ({ id, client_type: "commercial" }));
  db.respond("Profile.findOne", () => ({ name: "Jane Client", mobile: "+18135550100" }));
});

const call = (name) => db.log.find(([n]) => n === name);

test("generated document names keep to letters, digits, dot, dash and underscore", () => {
  assert.equal(safeFileName("Contract-Agreement-A/B Corp #1.pdf"), "Contract-Agreement-A-B-Corp--1.pdf");
  assert.equal(safeFileName("quote-../../etc/passwd.pdf"), "quote-..-..-etc-passwd.pdf");
  assert.equal(safeFileName("invoice-RHK12.pdf"), "invoice-RHK12.pdf");
});

test("an estimate PDF goes to DocuSign for the client's email and is saved pending signature", async () => {
  db.respond("ClientChecklist.findOne", () => ({ estimated_sqft: 5000 }));
  db.respond("BDMUser.findOne", () => ({ bdm_id: 4 }));
  db.respond("Admin.findOne", () => ({ name: "Rep Rae", email: "rae@example.com", mobile: null }));
  const result = await estimates.generateEstimatePDFService({ user_id: 7, client_company_name: "Acme & Sons", city: "Tampa", frequency: "Weekly" });
  const [, data, pdfPath] = call("estimatePdf.service.generateEstimatePDF");
  assert.equal(path.basename(pdfPath), "Social-Sanitation-Service-Estimate-acme---sons.pdf");
  assert.deepEqual([data.client_name, data.bdmName, data.bdmEmail, data.bdmPhone, data.frequency], ["Jane Client", "Rep Rae", "rae@example.com", "(813) 296-9695", "Weekly"]);
  assert.equal(data.extendedServices.length, 10);
  assert.deepEqual(call("docusignEnvelope.service.createEnvelope")[1].signerEmail, "client@example.com");
  const saved = db.calls("ServiceEstimate.create")[0][1];
  assert.deepEqual([saved.status, saved.docusign_envelope_id, saved.client_email, saved.file_url], ["pending_signature", "ENV-EST", "client@example.com", "https://node.socialsanitation.com/api/v1/docs/Social-Sanitation-Service-Estimate-acme---sons.pdf"]);
  assert.equal(result.success, true);
});

test("estimates need a known client and client type", async () => {
  db.respond("User.findOne", () => null);
  await assert.rejects(estimates.generateEstimatePDFService({ user_id: 7, client_company_name: "Acme" }), (err) => err.statusCode === 404);
  db.respond("User.findOne", (q) => ({ id: q.where.id, email: "client@example.com", user_profile: { name: "Jane" } }));
  db.respond("User.findByPk", (id) => ({ id, client_type: "industrial" }));
  await assert.rejects(estimates.generateEstimatePDFService({ user_id: 7, client_company_name: "Acme" }), (err) => err.statusCode === 400 && err.message === "Invalid client type");
});

test("a contract gets a Square link for the monthly price, a PDF inside the docs folder and an envelope", async () => {
  await estimates.generateContractAgreementService({ user_id: 7, client_company_name: "../../A/B Corp", total_monthly_price: "1200.50", client_legal_name: "AB LLC", contract_date: "2026-10-16" });
  assert.deepEqual(call("square.service.generateContractPaymentLink")[1], { amount: "1200.50", clientName: "AB LLC", customerEmail: "client@example.com", user_id: 7 });
  const pdfPath = call("estimatePdf.service.generateContractPDF")[2];
  assert.equal(path.dirname(pdfPath), UPLOAD_DIRS.docs, "a client name can't move the file out of docs");
  assert.equal(path.basename(pdfPath), "Contract-Agreement-..-..-A-B-Corp.pdf");
  const saved = db.calls("ContractAgreement.create")[0][1];
  assert.deepEqual([saved.status, saved.client_name, saved.payment_url, saved.docusign_envelope_id], ["pending_signature", "Jane Client", "https://square.test/contract/1200.50", "ENV-CON"]);
});

test("a quote adds up its items for the Square link, saves them, and emails and texts the PDF link", async () => {
  // the next number follows the highest of any active quote, whatever its prefix
  db.respond("ServiceQuote.findAll", () => [{ ref_no: "Q7" }, { ref_no: "RHK12" }, { ref_no: null }]);
  await users.submitServiceQuote({
    user_id: 7,
    ref_type: "Q",
    items: [
      { description: "Janitorial", quantity: 2, unit_price: 100, calculation_type: "hour", hour: 3 },
      { description: "Floors", quantity: 1, unit_price: "0.5", calculation_type: "sqft", sqft: "1000" },
    ],
    cc_email: " Boss@Example.com ",
  });
  assert.equal(call("square.service.generateSquarePaymentLink")[1].amount, 1100);
  const quote = db.calls("ServiceQuote.create")[0][1];
  assert.deepEqual([quote.ref_no, quote.total_due, quote.status, quote.payment_status, quote.square_payment_url], ["Q13", 1100, "SAVED", "NOT_PAID", "https://square.test/quote/1100"]);
  assert.deepEqual(db.calls("QuoteItem.bulkCreate")[0][1].map((i) => [i.description, i.amount]), [["Janitorial", 600], ["Floors", 500]]);
  assert.equal(call("User#update")[2].cc_email, "boss@example.com");
  assert.equal(sms[0].to, "+18135550100");
  assert.match(sms[0].message, /docs\/quote-Q13\.pdf/);

  db.reset();
  db.respond("User.findOne", (q) => ({ id: q.where.id, email: "client@example.com" }));
  db.respond("ServiceQuote.findOne", () => ({ id: 3 })); // that reference number is taken
  await assert.rejects(users.submitServiceQuote({ user_id: 7, ref_no: "Q1", items: [] }), (err) => err.statusCode === 400 && err.message === "Reference number already exists.");
  db.respond("ServiceQuote.findOne", () => null);
  await assert.rejects(users.submitServiceQuote({ user_id: 7, ref_no: "Q1", items: [] }), (err) => err.statusCode === 400 && err.message === "Total must be > 0");
});
