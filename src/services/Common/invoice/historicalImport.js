// Invoice service: importing historical invoices from CSV and attaching their PDFs

const { status: httpStatus } = require("http-status");
const { UPLOAD_DIRS, docUrl } = require("../../../config/storage");
const { Sequelize } = require("sequelize");
const { DATE_FORMAT, isValidDate } = require("../../../utils/time");
const fs = require("fs");
const path = require("path");
const { Invoice, User, Profile } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { invoicePaymentStatusTypes, invoiceStatusTypes } = require("../../../config/types");
const { parse } = require("csv-parse/sync");

const REQUIRED_CSV_HEADERS = ["invoice_number", "client_name", "billing_date"];

const DATE_FIELDS = [
  "billing_date",
  "service_start",
  "service_end",
  "due_date",
  "signing_date",
];

const cleanText = (value) =>
  value === undefined || value === null
    ? ""
    : String(value).trim().replace(/\s+/g, " ");

const safeUnlink = async (filePath) => {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (_) {
    // File already gone or never written. Nothing to do.
  }
};

const importHistoricalInvoicesCSV = async (fileBuffer) => {
  if (!fileBuffer || !fileBuffer.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "CSV file is required");
  }

  let records;
  try {
    records = parse(fileBuffer.toString("utf-8"), {
      // Header names are matched case-insensitively and with spaces trimmed
      columns: (header) => header.map((h) => cleanText(h).toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (e) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid CSV: ${e.message}`);
  }

  if (!records.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "CSV file is empty");
  }

  const headers = Object.keys(records[0]);
  const missingHeaders = REQUIRED_CSV_HEADERS.filter(
    (h) => !headers.includes(h),
  );
  if (missingHeaders.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Missing required column(s): ${missingHeaders.join(", ")}`,
    );
  }

  const imported = [];
  const skipped = []; // invoice number already exists in the system
  const unmatched = []; // client not found, or matches more than one profile
  const errors = []; // bad data in the row
  const seenInFile = new Set();

  for (let index = 0; index < records.length; index++) {
    const row = records[index];
    const rowNumber = index + 2; // header is row 1

    const invoiceNumber = cleanText(row.invoice_number);
    const clientName = cleanText(row.client_name);
    const billingDate = cleanText(row.billing_date);

    if (!invoiceNumber) {
      errors.push({
        row: rowNumber,
        invoice_number: null,
        message: "invoice_number is required",
      });
      continue;
    }

    if (!clientName) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "client_name is required",
      });
      continue;
    }

    if (!billingDate) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "billing_date is required",
      });
      continue;
    }

    const badDateField = DATE_FIELDS.find((field) => {
      const value = cleanText(row[field]);
      return value && !isValidDate(value);
    });

    if (badDateField) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: `${badDateField} must be a real date in ${DATE_FORMAT} format`,
      });
      continue;
    }

    // Same invoice number twice inside one file
    if (seenInFile.has(invoiceNumber)) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: "invoice_number appears more than once in this file",
      });
      continue;
    }
    seenInFile.add(invoiceNumber);

    try {
      /* ---------- ALREADY IMPORTED? SKIP, DON'T DUPLICATE ---------- */

      const existing = await Invoice.findOne({
        where: { ref_no: invoiceNumber },
        attributes: ["id"],
      });

      if (existing) {
        skipped.push({
          row: rowNumber,
          invoice_number: invoiceNumber,
          client_name: clientName,
          reason: "Already exists, skipped",
        });
        continue;
      }

      /* ---------- MATCH CLIENT: active users only ---------- */

      // Start from User so is_active can be checked. Profile is joined through
      // the existing `user_profile` association, the same one used elsewhere.
      const matches = await User.findAll({
        attributes: ["id", "is_active"],
        include: [
          {
            model: Profile,
            as: "user_profile",
            attributes: ["name"],
            required: true,
            where: Sequelize.where(
              Sequelize.fn(
                "LOWER",
                Sequelize.fn("TRIM", Sequelize.col("user_profile.name")),
              ),
              clientName.toLowerCase(),
            ),
          },
        ],
      });

      // Distinct active users only. Several profile rows for one user count as one.
      const activeUserIds = [
        ...new Set(matches.filter((u) => u.is_active).map((u) => u.id)),
      ];

      if (activeUserIds.length !== 1) {
        let reason;

        if (activeUserIds.length > 1) {
          reason = "Name belongs to more than one active client account";
        } else if (matches.length > 0) {
          reason = "Client account is inactive";
        } else {
          reason = "Client not found";
        }

        unmatched.push({
          row: rowNumber,
          invoice_number: invoiceNumber,
          client_name: clientName,
          reason,
        });
        continue;
      }

      const userId = activeUserIds[0];

      /* ---------- CREATE INVOICE ---------- */

      const serviceStart = cleanText(row.service_start);
      const serviceEnd = cleanText(row.service_end);

      const invoice = await Invoice.create({
        user_id: userId,
        is_historical: true,
        client_name: null,
        ref_no: invoiceNumber,
        custom_ref_no: null,
        ref_type: null,
        event_name: null,
        service_dates:
          serviceStart && serviceEnd ? `${serviceStart} - ${serviceEnd}` : null,
        billing_date: billingDate,
        date: cleanText(row.signing_date) || null, // existing `date` field = signing date
        due_date: cleanText(row.due_date) || null,
        to_company_name: clientName,
        address_1: cleanText(row.address_1) || null,
        address_2: cleanText(row.address_2) || null,
        total_due: 0,
        payment_url: null,
        square_payment_link_id: null,
        signature: null,
        payment_status: invoicePaymentStatusTypes.NOT_PAID,
        last_sent_at: null,
        scheduled_send_at: null,
        status: invoiceStatusTypes.ACTIVE,
        pdf_url: null,
        is_active: true,
      });

      imported.push({
        row: rowNumber,
        invoice_id: invoice.id,
        invoice_number: invoice.ref_no,
        client_name: clientName,
        user_id: userId,
        billing_date: invoice.billing_date,
      });
    } catch (rowError) {
      errors.push({
        row: rowNumber,
        invoice_number: invoiceNumber,
        message: rowError.message,
      });
    }
  }

  return {
    success: true,
    message: `Imported ${imported.length} of ${records.length} invoice(s)`,
    data: {
      total_rows: records.length,
      imported_count: imported.length,
      skipped_count: skipped.length,
      unmatched_count: unmatched.length,
      error_count: errors.length,
      invoices: imported,
      skipped,
      unmatched,
      errors,
    },
  };
};

const uploadHistoricalInvoicePDF = async (invoice_id, file) => {
  try {
    if (!file) {
      throw new ApiError(httpStatus.BAD_REQUEST, "PDF file is required");
    }

    const isPdf =
      file.mimetype === "application/pdf" &&
      (file.originalname || "").toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      await safeUnlink(file.path);
      throw new ApiError(httpStatus.BAD_REQUEST, "Only PDF files are allowed");
    }

    const invoice = await Invoice.findByPk(invoice_id);

    if (!invoice) {
      await safeUnlink(file.path);
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    if (!invoice.is_historical) {
      await safeUnlink(file.path);
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "PDF upload is only available for CSV-imported invoices",
      );
    }

    const newFileName = file.filename || path.basename(file.path);
    const publicUrl = docUrl(newFileName);

    // Replacing a PDF: remove the previous upload so old files don't pile up
    if (invoice.pdf_url && invoice.pdf_url !== publicUrl) {
      const oldFileName = path.basename(invoice.pdf_url);
      if (oldFileName.startsWith("docs-")) {
        await safeUnlink(path.join(UPLOAD_DIRS.docs, oldFileName));
      }
    }

    await invoice.update({ pdf_url: publicUrl });

    return {
      success: true,
      message: "Historical invoice PDF uploaded successfully",
      data: {
        invoice_id: invoice.id,
        pdf_url: publicUrl,
      },
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

module.exports = { importHistoricalInvoicesCSV, uploadHistoricalInvoicePDF };
