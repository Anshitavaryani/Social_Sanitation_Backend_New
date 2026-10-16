const fs = require("fs");
const path = require("path");
const { UPLOAD_DIRS } = require("../../config/storage");
const { renderPdf } = require("../../config/pdfBrowser");
const quoteHtml = require("../../templates/pdf/quote");
const invoiceHtml = require("../../templates/pdf/invoice");
const serviceRequestHtml = require("../../templates/pdf/serviceRequest");
const hiringFormHtml = require("../../templates/pdf/hiringForm");
const hiringFormSpanishHtml = require("../../templates/pdf/hiringFormSpanish");

// Quotes, invoices, service requests and hiring forms as PDFs. The pages are in src/templates/pdf;
// each document keeps its own page size and the waits it had before printing.

// Generated PDFs are saved in the docs upload folder
const ensureDocsDir = () => fs.mkdirSync(UPLOAD_DIRS.docs, { recursive: true });
const docsPdfPath = (fileName) => {
  ensureDocsDir();
  return path.join(UPLOAD_DIRS.docs, fileName);
};

const A4 = { format: "A4", printBackground: true };

// Saved as docs/quote-<ref_no>.pdf; resolves with its path
const generateQuotePDF = async (data) => {
  const html = quoteHtml(data);
  const pdfPath = docsPdfPath(`quote-${data.ref_no}.pdf`);
  await renderPdf(html, { fonts: true, images: true, pdf: { path: pdfPath, ...A4 } });
  return pdfPath;
};

// Saved as docs/invoice-<invoice_ref_no>.pdf; resolves with its path
const generateInvoicePDF = async (data) => {
  const html = invoiceHtml(data);
  const pdfPath = docsPdfPath(`invoice-${data.invoice_ref_no}.pdf`);
  await renderPdf(html, {
    fonts: true,
    images: true,
    pdf: { path: pdfPath, ...A4, margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" } },
  });
  return pdfPath;
};

// Saved to data.pdfPath
const generateServiceRequestPDF = async (data) => {
  const html = serviceRequestHtml(data);
  ensureDocsDir();
  await renderPdf(html, {
    waitUntil: "networkidle0",
    fonts: true,
    images: true,
    pdf: { path: data.pdfPath, width: "794px", height: "1123px", printBackground: true },
  });
};

// Saved as docs/hiring-form-<submission id>-<time>.pdf; resolves with its path
const hiringFormPdf = async (html, submissionId) => {
  const pdfPath = docsPdfPath(`hiring-form-${submissionId}-${Date.now()}.pdf`);
  await renderPdf(html, {
    waitUntil: "networkidle0",
    pdf: { path: pdfPath, ...A4, margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" } },
  });
  return pdfPath;
};

const generatePDF = async (formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url, submissionId) =>
  hiringFormPdf(hiringFormHtml({ formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url }), submissionId);

const generateSpanishPDF = async (formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url, submissionId) =>
  hiringFormPdf(hiringFormSpanishHtml({ formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url }), submissionId);

module.exports = {
  generateQuotePDF,
  generatePDF,
  generateSpanishPDF,
  generateInvoicePDF,
  generateServiceRequestPDF,
};
