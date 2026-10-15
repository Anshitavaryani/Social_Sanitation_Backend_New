// Renders the PDF templates with puppeteer-core 25. Needs a Chrome binary:
//   npx @puppeteer/browsers install chrome@155.0.8059.79
//   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm test
// Skipped when PUPPETEER_EXECUTABLE_PATH is not set to an existing file.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadFromRoot } = require("./helpers/mocks");

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH;
const skip = !chrome || !fs.existsSync(chrome) ? "PUPPETEER_EXECUTABLE_PATH not set to a Chrome binary" : false;

const assertPdf = (filePath) => {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(bytes.length > 10000, `PDF looks empty (${bytes.length} bytes)`);
  fs.rmSync(filePath, { force: true });
};

const tmpPdf = (name) => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ss-pdf-")), name);

const items = [
  { description: "Janitorial", quantity: 2, unit_price: 150.5, multiplier: 1 },
  { description: "Windows", quantity: 1, unit_price: 80, multiplier: 1 },
];

test("invoice PDF renders", { skip, timeout: 120000 }, async () => {
  const { generateInvoicePDF } = loadFromRoot("src/config/puppeteer.js");
  const pdfPath = await generateInvoicePDF({
    invoice_ref_no: `TEST-${process.pid}`,
    event_name: "Office cleaning",
    service_start: "2026-10-01",
    service_end: "2026-10-31",
    invoice_date: "2026-10-15",
    billing_date: "2026-10-15",
    due_date: "2026-11-14",
    to_company_name: "Test Co",
    address_1: "1 Main St",
    address_2: "Tampa FL",
    items,
    signature: "",
    payment_link: "https://example.com/pay",
  });
  assert.ok(pdfPath.includes(path.join("public", "uploads", "docs")));
  assertPdf(pdfPath);
});

test("quote PDF renders", { skip, timeout: 120000 }, async () => {
  const { generateQuotePDF } = loadFromRoot("src/config/puppeteer.js");
  const result = await generateQuotePDF({
    ref_no: `TESTQ-${process.pid}`,
    service_dates: "2026-10-20",
    due_date: "2026-10-30",
    to_company_name: "Test Co",
    address_1: "1 Main St",
    address_2: "Tampa FL",
    items,
    signature: "",
    date: "2026-10-15",
    square_payment_url: "https://example.com/pay",
  });
  assertPdf(typeof result === "string" ? result : result.pdfPath || result.path);
});

test("service request PDF renders to the caller's path", { skip, timeout: 120000 }, async () => {
  const { generateServiceRequestPDF } = loadFromRoot("src/config/puppeteer.js");
  const pdfPath = tmpPdf("service-request.pdf");
  await generateServiceRequestPDF({
    ref_no: "SR-1",
    service_days: "MON, WED",
    due_date: "2026-10-30",
    to_company_name: "Test Co",
    address_1: "1 Main St",
    address_2: "Tampa FL",
    items,
    signature: "",
    date: "2026-10-15",
    pdfPath,
  });
  assertPdf(pdfPath);
});

test("service estimate PDF renders without the removed contact fields", { skip, timeout: 120000 }, async () => {
  const { generateEstimatePDF } = loadFromRoot("src/config/serviceEstimate.js");
  const pdfPath = tmpPdf("estimate.pdf");
  await generateEstimatePDF(
    {
      client_company_name: "Test Co",
      client_name: "Jane Client",
      address_line_1: "1 Main St",
      city: "Tampa",
      state: "FL",
      zip: "33602",
      signature: "",
      signed_date: "2026-10-15",
      scopeSections: [],
      bdmName: "Rep",
      bdmEmail: "rep@example.com",
      bdmPhone: "555-0100",
    },
    pdfPath,
  );
  assertPdf(pdfPath);
});
