const { formatAmount } = require("../../utils/money");
const { formatDisplayDate } = require("../../utils/time");
const { logoDataUri } = require("../../config/company");

// Spacing and font sizes by item count (see cfg below)
const getInvoiceLayoutConfig = (itemCount) => {
  if (itemCount <= 5) {
    return {
      bodyPadding: "20px",
      tableFontSize: "14px",
      tablePadding: "8px",
      tableMargin: "15px 0",
      totalMarginTop: "20px",
      signatureMarginTop: "60px",
      paymentMarginTop: "60px",
      termsMarginTop: "30px",
      termsFontSize: "10px",
      termsLineHeight: "1.4",
      footerMarginTop: "40px",
    };
  }
  if (itemCount <= 8) {
    return {
      bodyPadding: "16px",
      tableFontSize: "12px",
      tablePadding: "5px 6px",
      tableMargin: "10px 0",
      totalMarginTop: "12px",
      signatureMarginTop: "30px",
      paymentMarginTop: "25px",
      termsMarginTop: "18px",
      termsFontSize: "9px",
      termsLineHeight: "1.25",
      footerMarginTop: "20px",
    };
  }
  // 9+ items
  return {
    bodyPadding: "12px",
    tableFontSize: "10.5px",
    tablePadding: "3px 5px",
    tableMargin: "8px 0",
    totalMarginTop: "8px",
    signatureMarginTop: "16px",
    paymentMarginTop: "14px",
    termsMarginTop: "12px",
    termsFontSize: "8.5px",
    termsLineHeight: "1.15",
    footerMarginTop: "12px",
  };
};

// The invoice
const invoiceHtml = (data) => {
  const {
    invoice_ref_no,
    event_name,
    service_start,
    service_end,
    invoice_date,
    billing_date,
    due_date,
    to_company_name,
    address_1,
    address_2,
    items,
    signature,
    payment_link,
  } = data;

  /* ===== FORMAT DATES ===== */

  const formattedServiceStart = formatDisplayDate(service_start);

  const formattedServiceEnd = formatDisplayDate(service_end);

  const formattedBillingDate = formatDisplayDate(billing_date);

  const formattedDueDate = formatDisplayDate(due_date);

  const hasSqft = items.some((item) => item.calculation_type === "sqft");
  const hasHour = items.some((item) => item.calculation_type === "hour");
  const showMeasurementColumn = hasSqft || hasHour;

  let measurementHeader = "Sqft / Hour";
  if (hasSqft && !hasHour) {
    measurementHeader = "Sqft";
  } else if (hasHour && !hasSqft) {
    measurementHeader = "Hour";
  }

  const calculatedTotal = items.reduce((sum, item) => {
    const unit_price = Number(item.unit_price || 0);
    const quantity = Number(item.quantity || 1);

    let multiplier = 1;

    if (item.calculation_type === "hour") {
      const hour = Number(item.hour || 0);
      multiplier = hour || 1;
    } else if (item.calculation_type === "sqft") {
      const sqft = Number(item.sqft || 0);
      multiplier = sqft || 1;
    }

    return sum + quantity * unit_price * multiplier;
  }, 0);

  /*
   * cfg drives ALL spacing/sizing tiers based on item count so the
   * invoice always fits a single A4 page, same design either way.
   * 1-5 items  = original design, untouched
   * 6-8 items  = mildly compact
   * 9+ items   = compact + tighter margins to still fit one page
   */
  const cfg = getInvoiceLayoutConfig(items.length);

  return `
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>Invoice</title>

		<style>
			body {
				font-family: Arial, sans-serif;
				margin: 0;
				padding: ${cfg.bodyPadding};
				color: #000;
			}

			/* ===== HEADER: logo ~30% left, dark box ~70% right ===== */
			.header-row {
				display: flex;
				align-items: stretch;
			}

			.logo-col {
				width: 30%;
				display: flex;
				align-items: flex-start;
			}

			.logo {
				width: 150px;
			}

			.invoice-box {
				width: 70%;
				background-color: #4A5058;
				color: #fff;
				padding: 14px 20px;
			}

			.invoice-box .invoice-title {
				font-size: 24px;
				font-weight: bold;
				text-align: right;
				margin-bottom: 10px;
			}

			.invoice-box .meta-row {
				display: flex;
				justify-content: space-between;
				align-items: flex-start;
				padding-top: 8px;
				border-top: 1px solid rgba(255,255,255,0.35);
				font-size: 10px;
			}

			.invoice-box .meta-row .meta-item {
				display: flex;
				flex-direction: column;
				gap: 2px;
			}

			.invoice-box .meta-row .meta-item .label {
				color: #c7cbd0;
				text-transform: uppercase;
				letter-spacing: 0.3px;
				white-space: nowrap;
			}

			.invoice-box .meta-row .meta-item .value {
				font-weight: bold;
				white-space: nowrap;
			}

			/* ===== FROM / TO / TOTAL DUE bordered row ===== */
			.info-grid {
				display: grid;
				grid-template-columns: 1fr 1fr 1.4fr;
				border-top: 1px solid #000;
				border-bottom: 1px solid #000;
			}

			.info-grid > div {
				padding: 10px 18px;
			}

			.info-grid > div:not(:last-child) {
				border-right: 1px solid #000;
			}

			.info-grid .info-label {
				font-size: 10px;
				color: #555;
				text-transform: uppercase;
				letter-spacing: 0.3px;
				margin-bottom: 4px;
				font-weight: bold;
			}

			.info-grid p {
				margin: 2px 0;
				font-size: 13px;
			}

			.info-grid .total-due-cell {
				display: flex;
				flex-direction: column;
				justify-content: center;
			}

			.info-grid .total-due-value {
				font-size: 24px;
				font-weight: bold;
			}

			table {
				width: 100%;
				border-collapse: collapse;
				margin: ${cfg.tableMargin};
			}

			th,
			td {
				border: none;
				padding: ${cfg.tablePadding};
				text-align: left;
				font-size: ${cfg.tableFontSize};
				line-height: 1.2;
			}

			th {
				background-color: #f0f0f0;
				text-transform: uppercase;
				font-size: 11px;
				letter-spacing: 0.3px;
			}

			tbody tr:nth-child(even) {
				background-color: #fafafa;
			}

			.total {
				text-align: right;
				font-size: 16px;
				font-weight: bold;
				margin-top: ${cfg.totalMarginTop};
			}

			.signature-section {
				display: flex;
				justify-content: space-between;
				margin-top: ${cfg.signatureMarginTop};
				font-size: 14px;
			}

			.signature-section .date,
			.signature-section .signature {
				width: 48%;
			}

			.signature-section .signature img {
				margin-top: 5px;
				width: 120px;
				height: auto;
			}

			.signature-section .signature p {
				margin-top: 10px;
				line-height: 1.2;
				white-space: pre-line;
			}

			.payment-link {
				margin-top: ${cfg.paymentMarginTop};
				text-align: center;
				font-size: 12px;
			}

			.payment-link p {
				margin: 0;
			}

			.payment-link span {
				display: inline-block;
				border-bottom: 1px solid #000;
				padding-bottom: 2px;
			}

			.terms {
				margin-top: ${cfg.termsMarginTop};
				font-size: ${cfg.termsFontSize};
				line-height: ${cfg.termsLineHeight};
				text-align: justify;
				padding: 0 30px;
			}

			.footer {
				margin-top: ${cfg.footerMarginTop};
				font-size: 10px;
				text-align: center;
				border-top: 1px solid #000;
				padding-top: 5px;
			}
		</style>
	</head>

	<body>
		<div class="header-row">
			<div class="logo-col">
				<img
					class="logo"
					src="${logoDataUri()}"
				/>
			</div>

			<div class="invoice-box">
				<div class="invoice-title">INVOICE</div>

				<div class="meta-row">
					<span class="meta-item">
						<span class="label">Invoice Ref No:</span>
						<span class="value">${invoice_ref_no}</span>
					</span>
					<span class="meta-item">
						<span class="label">Billing Date:</span>
						<span class="value">${formattedBillingDate}</span>
					</span>
					<span class="meta-item">
						<span class="label">Date of Service:</span>
						<span class="value">${formattedServiceStart} - ${formattedServiceEnd}</span>
					</span>
					<span class="meta-item">
						<span class="label">Due Date:</span>
						<span class="value">${formattedDueDate}</span>
					</span>
				</div>
			</div>
		</div>

		<div class="info-grid">
			<div>
				<p class="info-label">From</p>
				<p>Social Sanitation Commercial Cleaning Solutions</p>
				<p>5201 N 44TH St</p>
				<p>Tampa, FL 33610</p>
			</div>

			<div>
				<p class="info-label">To</p>
				<p>${to_company_name}</p>
				<p>${address_1}</p>
				<p>${address_2}</p>
			</div>

			<div class="total-due-cell">
				<p class="info-label">Total Due</p>
				<p class="total-due-value">$${formatAmount(calculatedTotal)}</p>
			</div>
		</div>


  ${
    event_name
      ? `
        <div
          style="
            margin-top: 12px;
            margin-bottom: 6px;
            font-size: 13px;
            font-weight: bold;
          "
        >
          Event Name: ${event_name}
        </div>
      `
      : ""
  }

		<table>
			<thead>
				<tr>
					<th>Description</th>
					<th>Frequency</th>
					<th>Quantity</th>
         ${showMeasurementColumn ? `<th>${measurementHeader}</th>` : ""}
					<th>Amount ($)</th>
				</tr>
			</thead>

			<tbody>
				${items
          .map((item) => {
            const unit_price = Number(item.unit_price || 0);
            const quantity = Number(item.quantity || 1);

            let measurement = "N/A";
            let multiplier = 1;

            if (item.calculation_type === "hour") {
              measurement = Number(item.hour || 0);
              multiplier = measurement;
            } else if (item.calculation_type === "sqft") {
              measurement = Number(item.sqft || 0);
              multiplier = measurement;
            }

            const amount = quantity * unit_price * multiplier;

            return `
<tr>
  <td>${item.description}</td>
  <td>${item.frequency || "-"}</td>
  <td>${quantity}</td>
   ${showMeasurementColumn ? `<td>${measurement}</td>` : ""}
 <td>$${formatAmount(amount)}</td>
</tr>
`;
          })
          .join("")}
			</tbody>
		</table>

		<div
			class="signature-section"
			style="
				display: flex;
				justify-content: space-between;
				align-items: flex-end;
				font-size: 14px;
				width: 100%;
			"
		>
			<!-- Date -->
			<div class="date" style="width: 48%; text-align: center">
				<p style="margin: 0; font-size: 12px; font-weight: bold; text-align: center">
					${
            invoice_date ? formatDisplayDate(invoice_date) : "Month-Day-Year"
          }
				</p>
				<div
					style="border-top: 1px solid #000; width: 220px; margin: 5px auto 0 auto"
				></div>
				<p
					style="
						margin: 0;
						font-size: 12px;
						font-weight: bold;
						text-align: center;
						width: 220px;
						margin-left: auto;
						margin-right: auto;
					"
				>
					Date
				</p>
			</div>

			<!-- Signature -->
			<div class="signature" style="width: 48%; text-align: left">
				${
          signature
            ? `<img
					src="${signature}"
					alt="Signature"
					crossorigin="anonymous"
					style="width: 120px; height: auto; margin-bottom: 5px"
				/>`
            : `<div style="height: 60px"></div>`
        }
				<div
					style="border-top: 1px solid #000; width: 280px; margin-top: 5px"
				></div>
				<p
					style="
						margin: 2px 0 0 0;
						font-size: 12px;
						font-weight: bold;
						color: #000;
					"
				>
					Social Sanitation Legal Representative Signature
				</p>
			</div>
		</div>

		<div
			class="payment-link"
			style="text-align: center; font-size: 12px"
		>
			<p style="margin: 0">
				<strong>Square Payment Link:</strong>
				<span>
					${
            payment_link
              ? `<a
						href="${payment_link}"
						target="_blank"
						style="
							word-break: break-all;
							color: #0066cc;
							text-decoration: underline;
							font-size: 11px;
						"
					>
						${payment_link}
					</a>`
              : `<span style="color: #999">(No payment link available)</span>`
          }
				</span>
			</p>
		</div>

		<div class="terms">
			<p>
				Invoices are sent on the last business day of each month and are to be
				paid within 5 business days of due date. All late payments are subject
				to late fees of $30, every 5-business day period after the service
				month. If needed, the pay options above can change but it is necessary
				to change payment arrangements 5 business days before the end of the
				current service month if check or ACH. Payments made via credit or debit
				card can be made at any time. All late fees will be added to the invoice
				of the following service month, to fully satisfy the invoice for the
				previous service month.
			</p>
		</div>

		<div class="footer">
			SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS &nbsp;&nbsp;&nbsp; |
			&nbsp;&nbsp;&nbsp; INVOICE REF#: ${invoice_ref_no}
		</div>
	</body>
</html>
`;
};

module.exports = invoiceHtml;
