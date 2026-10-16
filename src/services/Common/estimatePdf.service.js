const { renderPdf } = require("../../config/pdfBrowser");
const estimateHtml = require("../../templates/pdf/estimate");
const contractHtml = require("../../templates/pdf/contract");
const scopeOfWorkHtml = require("../../templates/pdf/scopeOfWork");

// The service estimate, the contract and the scope of work as PDFs. The pages are in
// src/templates/pdf.

// A4 at 96 dpi
const A4_PX = { width: "794px", height: "1123px", printBackground: true };

// Saved to pdfPath; resolves with it
const generateEstimatePDF = async (data, pdfPath) => {
  await renderPdf(estimateHtml(data), {
    waitUntil: "networkidle0",
    fonts: true,
    images: true,
    pdf: { path: pdfPath, ...A4_PX, preferCSSPageSize: true },
  });
  return pdfPath;
};

// Saved to pdfPath; resolves with it
const generateContractPDF = async (data, pdfPath) => {
  await renderPdf(contractHtml(data), { waitUntil: "networkidle0", fonts: true, images: true, pdf: { path: pdfPath, ...A4_PX } });
  return pdfPath;
};

// Resolves with the PDF bytes; the caller saves them
const generateScopeOfWorkPdfBuffer = async (data) =>
  renderPdf(scopeOfWorkHtml(data), {
    waitUntil: "networkidle0",
    fonts: true,
    pdf: { printBackground: true, format: "A4", margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" } },
  });

module.exports = {
  generateEstimatePDF,
  generateContractPDF,
  generateScopeOfWorkPdfBuffer,
};
