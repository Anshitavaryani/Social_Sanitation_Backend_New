const express = require("express");
const router = express.Router();
const upload = require("../../../config/multer");

const { invoiceController } = require("../../../controllers");
const multer = require("multer");

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isCsv =
      file.originalname.toLowerCase().endsWith(".csv") &&
      [
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/octet-stream",
      ].includes(file.mimetype);
    cb(isCsv ? null : new Error("Only .csv files are allowed"), isCsv);
  },
}).single("docs");

const handleCsvUpload = (req, res, next) => {
  csvUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: `Upload failed: ${err.message}`,
      });
    }
    next();
  });
};

router.post(
  "/import-historical-csv",
  handleCsvUpload,
  invoiceController.importHistoricalInvoicesCSV,
);

router.post("/createInvoice", invoiceController.createInvoice);

router.get("/getAllInvoices", invoiceController.getAllInvoices);
router.get("/user/:user_id", invoiceController.getInvoicesByUserId);
router.get("/getNextInvoiceRef", invoiceController.getNextInvoiceRef);
router.post(
  "/getMonthlyAllInvoicesSummary",
  invoiceController.getMonthlyAllInvoicesSummary,
);
router.delete("/deleteInvoice/:id", invoiceController.deleteInvoice);

router.get("/upcoming", invoiceController.getUpcomingInvoices);

router.get("/:id", invoiceController.getInvoiceById);

router.put("/:id", invoiceController.updateInvoice);

router.patch(
  "/mark-paid-check/:invoice_id",
  invoiceController.markInvoicePaidByCheck,
);
router.patch(
  "/markInvoicePaidByACH/:invoice_id",
  invoiceController.markInvoicePaidByACH,
);
router.post("/getBusinessAnalytics", invoiceController.getBusinessAnalytics);

router.patch(
  "/:invoice_id/reorder-items",
  invoiceController.reorderInvoiceItems,
);

router.post(
  "/:invoice_id/upload-pdf",
  invoiceController.uploadHistoricalInvoicePDF,
);

router.post(
  "/:invoice_id/send-balance",
  invoiceController.sendInvoiceBalance,
);

module.exports = router;
