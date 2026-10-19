const express = require("express");
const router = express.Router();

const { invoiceController } = require("../../../controllers");
const multer = require("multer");
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");
const { validate } = require("../../../middlewares/validate.middleware");
const adminValidation = require("../../../validations/admin.validation");

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
  "/import-historical-csv", requireAdmin,
  handleCsvUpload,
  invoiceController.importHistoricalInvoicesCSV,
);

router.post("/createInvoice", requireAdmin, validate(adminValidation.createInvoice), invoiceController.createInvoice);

router.get("/getAllInvoices", requireAdmin, invoiceController.getAllInvoices);
router.get("/user/:user_id", requireAuth, invoiceController.getInvoicesByUserId);
router.get("/getNextInvoiceRef", requireAdmin, invoiceController.getNextInvoiceRef);
router.post(
  "/getMonthlyAllInvoicesSummary", requireAdmin,
  invoiceController.getMonthlyAllInvoicesSummary,
);
router.delete("/deleteInvoice/:id", requireAdmin, invoiceController.deleteInvoice);

router.get("/upcoming", requireAdmin, invoiceController.getUpcomingInvoices);

router.get("/:id", requireAuth, invoiceController.getInvoiceById);

router.put("/:id", requireAdmin, validate(adminValidation.updateInvoice), invoiceController.updateInvoice);

router.patch(
  "/mark-paid-check/:invoice_id", requireAdmin,
  invoiceController.markInvoicePaidByCheck,
);
router.patch(
  "/markInvoicePaidByACH/:invoice_id", requireAdmin,
  invoiceController.markInvoicePaidByACH,
);
router.post("/getBusinessAnalytics", requireAdmin, invoiceController.getBusinessAnalytics);

router.patch(
  "/:invoice_id/reorder-items", requireAdmin,
  invoiceController.reorderInvoiceItems,
);

router.post(
  "/:invoice_id/upload-pdf", requireAdmin,
  invoiceController.uploadHistoricalInvoicePDF,
);

router.post(
  "/:invoice_id/send-balance", requireAdmin,
  invoiceController.sendInvoiceBalance,
);

module.exports = router;
