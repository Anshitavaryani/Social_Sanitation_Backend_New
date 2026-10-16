const { formatAmount } = require("../../utils/money");
const { formatDisplayDate, formatDisplayDateRange } = require("../../utils/time");
const { logoDataUri } = require("../../config/company");

// Spacing and font sizes by item count (see cfg below)
const getLayoutConfig = (itemCount) => {
  if (itemCount <= 5) {
    return {
      tableFontSize: "14px",
      tablePadding: "8px",
      totalMarginTop: "20px",
      signatureMarginTop: "50px",
      paymentMarginTop: "60px",
      termsMarginTop: "80px",
      termsFontSize: "10px",
      termsLineHeight: "1.4",
      footerMarginTop: "140px",
      bodyPadding: "40px",
    };
  }
  if (itemCount <= 8) {
    return {
      tableFontSize: "12px",
      tablePadding: "5px 6px",
      totalMarginTop: "12px",
      signatureMarginTop: "25px",
      paymentMarginTop: "25px",
      termsMarginTop: "25px",
      termsFontSize: "9px",
      termsLineHeight: "1.25",
      footerMarginTop: "35px",
      bodyPadding: "30px",
    };
  }
  // 9+ items
  return {
    tableFontSize: "10.5px",
    tablePadding: "3px 5px",
    totalMarginTop: "8px",
    signatureMarginTop: "15px",
    paymentMarginTop: "15px",
    termsMarginTop: "15px",
    termsFontSize: "8.5px",
    termsLineHeight: "1.15",
    footerMarginTop: "20px",
    bodyPadding: "22px",
  };
};

// The service quote
const quoteHtml = (data) => {
  const {
    ref_no,
    ref_type,
    service_dates,
    due_date,
    to_company_name,
    address_1,
    address_2,
    items,
    signature,
    date,
    square_payment_url,
  } = data;

  const formattedServiceDates = formatDisplayDateRange(service_dates);
  const formattedDueDate = formatDisplayDate(due_date);

  /* ================= TOTAL ================= */

  const calculatedTotal = items.reduce((sum, item) => {
    const unit_price = Number(item.unit_price || item.unitPrice || 0);

    const quantity = Number(item.quantity || 1);

    let multiplier = 1;

    if (item.calculation_type === "hour") {
      const hour = Number(item.hour || 0);
      multiplier = hour > 0 ? hour : 1;
    } else if (item.calculation_type === "sqft") {
      const sqft = Number(item.sqft || 0);
      multiplier = sqft > 0 ? sqft : 1;
    }

    return sum + quantity * unit_price * multiplier;
  }, 0);

  const hasSqft = items.some((item) => item.calculation_type === "sqft");
  const hasHour = items.some((item) => item.calculation_type === "hour");
  const showMeasurementColumn = hasSqft || hasHour;

  let measurementHeader = "Sqft / Hour";
  if (hasSqft && !hasHour) {
    measurementHeader = "Sqft";
  } else if (hasHour && !hasSqft) {
    measurementHeader = "Hour";
  }

  /*
   * cfg drives ALL spacing/sizing tiers based on item count.
   * 1-5 items  = original design, untouched
   * 6-8 items  = mildly compact
   * 9+ items   = compact, but margins shrink too so it still fits one page
   */
  const cfg = getLayoutConfig(items.length);

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Service Quote</title>

<style>

  body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: ${cfg.bodyPadding};
    color: #000;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #444;
    padding-bottom: 10px;
  }

  .logo {
    width: 120px;
  }

  .title {
    background-color: #495057;
    color: #fff;
    padding: 15px 25px;
    font-size: 22px;
    font-weight: bold;
    text-align: right;
  }

  .meta-info,
  .addresses {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }

  .meta-info div,
  .addresses div {
    width: 48%;
    font-size: 14px;
  }

  .meta-info p,
  .addresses p {
    margin: 4px 0;
  }

  /* ================= ITEMS TABLE ================= */

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 30px 0;
  }

  th,
  td {
    border: 1px solid #000;
    padding: ${cfg.tablePadding};
    text-align: left;
    font-size: ${cfg.tableFontSize};
    line-height: 1.2;
  }

  th {
    background-color: #f0f0f0;
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
    min-width: 250px;
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

  <div class="header">
    <img
      class="logo"
      src="${logoDataUri()}"
      alt="Company Logo"
    >

    <div class="title">
      SERVICE QUOTE
    </div>
  </div>


  <div class="meta-info">
    <div>

      <p>
        <strong>Reference Type:</strong>
        ${ref_type}
      </p>

      <p>
        <strong>Ref #:</strong>
        ${ref_no}
      </p>

      <p>
        <strong>Service Dates:</strong>
        ${formattedServiceDates}
      </p>

      <p>
        <strong>Due Date:</strong>
        ${formattedDueDate}
      </p>

    </div>
  </div>


  <div class="addresses">

    <div>
      <p><strong>FROM</strong></p>
      <p>Social Sanitation Commercial Cleaning Solutions</p>
      <p>5201 N 44TH St</p>
      <p>Tampa, FL 33610</p>
    </div>

    <div>
      <p><strong>TO</strong></p>
      <p>${to_company_name}</p>
      <p>${address_1}</p>
      <p>${address_2}</p>
    </div>

  </div>


  <!-- ================= ITEMS TABLE ================= -->

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
          const unit_price = Number(item.unit_price || item.unitPrice || 0);

          const quantity = Number(item.quantity || 1);

          let measurement = "N/A";
          let multiplier = 1;

          if (item.calculation_type === "hour") {
            const hour = Number(item.hour || 0);

            if (hour > 0) {
              measurement = hour;
              multiplier = hour;
            }
          } else if (item.calculation_type === "sqft") {
            const sqft = Number(item.sqft || 0);

            if (sqft > 0) {
              measurement = sqft;
              multiplier = sqft;
            }
          }

          const amount = quantity * unit_price * multiplier;

          return `
            <tr>

              <td>
                ${item.description || ""}
              </td>

              <td>
                ${item.frequency || ""}
              </td>

              <td>
                ${quantity}
              </td>

                           ${
                             showMeasurementColumn
                               ? `<td>${measurement}</td>`
                               : ""
                           }

              <td>
                $${formatAmount(amount)}
              </td>

            </tr>
          `;
        })
        .join("")}

    </tbody>

  </table>


  <p class="total">
    Total: $${formatAmount(calculatedTotal)}
  </p>


  <!-- ================= SIGNATURE ================= -->

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

    <div
      class="date"
      style="
        width: 48%;
        text-align: left;
      "
    >

      <p
        style="
          margin: 0;
          font-size: 12px;
          font-weight: bold;
        "
      >
        ${
          date
            ? formatDisplayDate(date)
            : "Month-Day-Year"
        }
      </p>

      <div
        style="
          border-top: 1px solid #000;
          width: 220px;
          margin: 5px 0 0 0;
        "
      ></div>

      <p
        style="
          margin: 0;
          font-size: 12px;
          font-weight: bold;
          text-align: center;
          width: 220px;
        "
      >
        Date
      </p>

    </div>


    <!-- Signature -->

    <div
      class="signature"
      style="
        width: 48%;
        text-align: left;
      "
    >

      ${
        signature
          ? `
            <img
              src="${signature}"
              alt="Signature"
              crossorigin="anonymous"
              style="
                width: 120px;
                height: auto;
                margin-bottom: 5px;
              "
            />
          `
          : `
            <div style="height: 60px;"></div>
          `
      }

      <div
        style="
          border-top: 1px solid #000;
          width: 280px;
          margin-top: 5px;
        "
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


  <!-- ================= PAYMENT LINK ================= -->

  <div
    class="payment-link"
    style="
      text-align: center;
      font-size: 12px;
    "
  >

    <p style="margin: 0">

      <strong>Square Payment Link:</strong>

      <span
        style="
          display: inline-block;
          min-width: 250px;
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
        "
      >

        ${
          square_payment_url
            ? `
              <a
                href="${square_payment_url}"
                target="_blank"
                style="
                  word-break: break-all;
                  color: #0066cc;
                  text-decoration: underline;
                  font-size: 11px;
                "
              >
                ${square_payment_url}
              </a>
            `
            : `
              <span style="color: #999;">
                (No payment link available)
              </span>
            `
        }

      </span>

    </p>

  </div>


  <!-- ================= TERMS ================= -->

  <div class="terms">

    <p>
      All quotes and estimates are valid within thirty days from signed date.
      Prices are set for a thirty-day period, once the document is signed and
      dated by a Social Sanitation legal representative. Thirty days after
      customer's signature, this document and price becomes void, unless
      signed in contractual agreement. All services offered are appointment-based
      services. "Reoccurring Service Customers" must have a time and date
      specified in a service request for additional services. Any holiday
      scheduling must be done thirty days prior to the scheduled service date.
      If billed monthly, all charges are final. If any questions, changes,
      or adjustments are needed, contact your representative.
    </p>

  </div>


  <!-- ================= FOOTER ================= -->

  <div class="footer">

    SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS
    &nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;
    REF#: ${ref_no}

  </div>

</body>
</html>
`;
};

module.exports = quoteHtml;
