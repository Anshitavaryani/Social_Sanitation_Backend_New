// Company details and file storage have one source each: src/config/company.js (contacts, staff,
// logo, admin-panel links) and src/config/storage.js (upload folders, file links). Links are built
// from API_BASE_URL and ADMIN_BASE_URL, and PDFs carry their images instead of downloading them.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ROOT, mockModule, mockPackage, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const { models } = mockDatabase();

const smsSent = [];
mockPackage("twilio", () => ({ messages: { create: async (message) => smsSent.push(message) && message } }));

// PDF templates run as in production; the browser only records the HTML it is handed
const renderedHtml = [];
const page = {
  setContent: async (html) => renderedHtml.push(html),
  pdf: async () => Buffer.from("%PDF-"),
  evaluate: async () => undefined,
  evaluateHandle: async () => ({ dispose: async () => {} }),
};
mockPackage("puppeteer-core", { launch: async () => ({ newPage: async () => page, close: async () => {} }) });
const downloads = [];
mockPackage("axios", {
  get: async (url) => {
    downloads.push(url);
    throw new Error("no network in tests");
  },
});

const storage = loadFromRoot("src/config/storage.js");
const company = loadFromRoot("src/config/company.js");
const config = loadFromRoot("src/config/config.js");
const estimatePdf = loadFromRoot("src/config/serviceEstimate.js");
const pdf = loadFromRoot("src/config/puppeteer.js"); // the real templates, before the stand-in below

// The services below run as in production up to DocuSign, the PDF and the emails, which are recorded
const signingRequests = [];
mockModule("src/services/Common/docusignSigning.service.js", {
  getSigningUrl: async (request) => signingRequests.push(request) && "https://sign.example/view",
});
mockModule("src/config/puppeteer.js", { generatePDF: async (form, s, d, c, id) => `/tmp/hiring-${id}.pdf`, generateSpanishPDF: async () => "/tmp/x.pdf" });
const emailsSent = [];
mockModule("src/services/Common/email.service.js", new Proxy({}, { get: (t, name) => async (...args) => emailsSent.push([name, ...args]) }));

const quietly = async (fn) => {
  const { log, info, warn, error } = console;
  console.log = console.info = console.warn = console.error = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info, warn, error });
  }
};

test("file links, the logo and admin-panel links come from API_BASE_URL and ADMIN_BASE_URL (defaults: today's addresses)", () => {
  assert.equal(storage.docUrl("estimate.pdf"), "https://node.socialsanitation.com/api/v1/docs/estimate.pdf");
  assert.equal(company.LOGO_URL, "https://node.socialsanitation.com/api/v1/assets/logo.jpg");
  assert.equal(company.adminPanelUrl("checkout"), "https://admin.socialsanitation.com/checkout");
  assert.equal(company.adminPanelUrl(), "https://admin.socialsanitation.com/");
  assert.equal(storage.IMAGE_FILE_URI, "/images");
  assert.equal(storage.UPLOAD_DIRS.docs, path.join(ROOT, "public", "uploads", "docs"));
});

test("the Twilio status callback goes to the public API address (it named port 3000, which is not public)", async () => {
  const sendSMS = loadFromRoot("src/config/sendSMS.js");
  await sendSMS({ to: "+18135550100", message: "Hi" });
  assert.equal(smsSent[0].statusCallback, "https://node.socialsanitation.com/api/v1/admin/user/twilio/sms-status");
});

test("invoices go out from the assigned admin's address, otherwise the default sender", () => {
  assert.equal(company.invoiceSenderEmail(2), "m.williams@socialsanitation.com");
  assert.equal(company.invoiceSenderEmail(5), "y.claudio@socialsanitation.com");
  assert.equal(company.invoiceSenderEmail(9), config.mail.senderEmail);
  assert.equal(company.invoiceSenderEmail(null), config.mail.senderEmail);
});

test("resuming a contract asks DocuSign for the contract's own signer (it asked for a developer's personal Gmail)", async () => {
  const service = loadFromRoot("src/services/Admin/serviceEstimate.service.js");
  models.ContractAgreement.findOne = async () => ({ id: 4, docusign_envelope_id: "ENV-1", client_email: "client@example.com", client_name: "Client Co" });
  const result = await service.resumeContractAgreement(4);
  assert.equal(result.data.signingUrl, "https://sign.example/view");
  assert.deepEqual(signingRequests, [{ envelopeId: "ENV-1", signerEmail: "client@example.com", signerName: "Client Co" }]);
});

test("hiring form images are stored with file_uri /images (it was /uploads, a link that did not resolve)", async () => {
  const formService = loadFromRoot("src/services/Common/form.service.js");
  const attachments = [];
  let savedPdfUrl;
  models.FormSubmission.create = async () => ({ id: 3, update: async ({ pdf_url }) => (savedPdfUrl = pdf_url) });
  models.FormAttachment.create = async (row) => attachments.push(row) && row;
  await quietly(() =>
    formService.submitForm(
      { formData: { personalInfo: { email: "applicant@example.com" } } },
      { images: [{ filename: "images-1-ab12cd34.png", size: 10 }] },
    ),
  );
  assert.deepEqual(
    attachments.map((a) => [a.file_name, a.file_uri]),
    [["images-1-ab12cd34.png", "/images"]],
  );
  assert.equal(savedPdfUrl, "https://node.socialsanitation.com/api/v1/docs/hiring-3.pdf");
});

test("PDFs carry the logo and the estimate photos inline, so rendering needs no network", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-assets-"));
  try {
    renderedHtml.length = 0;
    await quietly(async () => {
      await estimatePdf.generateEstimatePDF(
        { client_company_name: "Test Co", client_name: "Jane", signature: "", signed_date: "2026-10-15", scopeSections: [] },
        path.join(dir, "estimate.pdf"),
      );
      await pdf.generateQuotePDF({ to_company_name: "Test Co", items: [], signature: "", ref_no: "Q-1", date: "2026-10-15" });
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(downloads.length, 0, "nothing downloaded");
  const sources = renderedHtml.flatMap((html) => [...html.matchAll(/<img[^>]*\bsrc="([^"]*)"/g)].map((m) => m[1])).filter(Boolean);
  assert.ok(sources.length >= 10);
  assert.deepEqual(sources.filter((src) => !src.startsWith("data:image/")), [], "every image is inline");
  const logo = `data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, "public/assets/logo.jpg")).toString("base64")}`;
  assert.equal(sources.filter((src) => src === logo).length, 8, "estimate: cover and 6 page headers; quote: 1");
});

// ----- one source each: no company detail, upload path or file link written anywhere else

const COMPANY_DETAIL = /socialsanitation\.com|socialsanitation@|296-9695|apps\.apple\.com|play\.google\.com/;
const UPLOAD_PATH = /(^|[/\\])(uploads|public)([/\\]|$)/;
const ALLOWED = {
  company: ["src/config/company.js", "src/config/storage.js", "src/config/env.schema.js"],
  storage: ["src/config/storage.js"],
};

// String pieces of a file: literals and template text, with what surrounds them
const stringsIn = (file) => {
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
  const found = [];
  const visit = (node, parent) => {
    if (!node || typeof node.type !== "string") return;
    const isRequireArg = parent?.type === "CallExpression" && parent.callee.name === "require";
    if (node.type === "Literal" && typeof node.value === "string") found.push({ line: node.loc.start.line, text: node.value, isRequireArg });
    if (node.type === "TemplateElement") found.push({ line: node.loc.start.line, text: node.value.cooked ?? node.value.raw });
    if (node.type === "Property" && (node.key.name ?? node.key.value) === "file_uri" && ["Literal", "TemplateLiteral"].includes(node.value.type)) {
      found.push({ line: node.loc.start.line, text: "", fileUri: true });
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, node));
      else if (child && typeof child.type === "string") visit(child, node);
    }
  };
  visit(ast, null);
  return found;
};

const sourceFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["node_modules", "uploads", "dumps", "assets"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "public")), path.join(ROOT, "app.js"), path.join(ROOT, "index.js")];
};

test("contacts, links and upload paths are written only in company.js and storage.js", () => {
  const offenders = [];
  for (const file of sourceFiles()) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    for (const piece of stringsIn(file)) {
      if (COMPANY_DETAIL.test(piece.text) && !ALLOWED.company.includes(relative)) offenders.push(`${relative}:${piece.line} ${piece.text.trim().slice(0, 70)}`);
      if (!piece.isRequireArg && UPLOAD_PATH.test(piece.text) && !ALLOWED.storage.includes(relative)) offenders.push(`${relative}:${piece.line} path ${piece.text.trim().slice(0, 70)}`);
      if (piece.fileUri && !ALLOWED.storage.includes(relative)) offenders.push(`${relative}:${piece.line} file_uri literal`);
    }
  }
  assert.deepEqual(offenders, [], "use src/config/company.js and src/config/storage.js");
});
