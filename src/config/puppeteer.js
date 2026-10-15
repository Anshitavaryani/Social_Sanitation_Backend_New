/** @format */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const moment = require("moment");

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

const generateQuotePDF = async (data) => {
  const {
    ref_no,
    ref_type,
    service_dates,
    due_date,
    to_company_name,
    address_1,
    address_2,
    items,
    total_due,
    signature,
    date,
    square_payment_url,
  } = data;

  const formatDate = (date) => {
    if (!date) return "";

    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();

    return `${mm}/${dd}/${yyyy}`;
  };

  const formatAmount = (value) => {
    if (value === null || value === undefined || value === "") {
      return "0";
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
      return "0";
    }

    return number.toFixed(6).replace(/\.?0+$/, "");
  };

  const formattedServiceDates = formatDate(service_dates);
  const formattedDueDate = formatDate(due_date);
  const formattedSignatureDate = formatDate(date);

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

  const htmlContent = `
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
      src="https://socialsanitation.com/wp-content/uploads/2022/12/New-Logo.jpg"
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
            ? new Date(date).toLocaleDateString("en-US", {
                month: "long",
                day: "2-digit",
                year: "numeric",
              })
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

  const pdfDir = path.resolve(__dirname, "../../public/uploads/docs");

  const pdfPath = path.join(pdfDir, `quote-${ref_no}.pdf`);

  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, {
      recursive: true,
    });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setContent(htmlContent);

  await page.evaluateHandle("document.fonts.ready");

  // Wait for logo/signature
  await page.evaluate(async () => {
    const images = Array.from(document.images);

    await Promise.all(
      images.map((img) => {
        if (img.complete) return;

        return new Promise((resolve) => {
          img.addEventListener("load", resolve);

          img.addEventListener("error", resolve);
        });
      }),
    );
  });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
  });

  await browser.close();

  return pdfPath;
};

const generatePDF = async (
  formData,
  signatureBase64Url,
  driverLicenseNumber,
  signatureCompanyBase64Url,
  submissionId,
) => {
  const veteranStatus = formData?.militaryService?.veteran;
  const militaryRecords = Array.isArray(formData?.militaryService?.records)
    ? formData.militaryService.records
    : [];
  const references = formData?.references || "[]";

  const htmlContent = `
  <!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization and Acknowledgment</title>
  <style>
    body {
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11px;
      line-height: 1.6;
      color: #000;
      margin: 40px;
    }


    h2 {
      text-align: center;
      font-size: 14px;
      font-weight: bold;
      text-decoration: underline;
      margin-bottom: 15px;
    }

    h4 {
      font-size: 10px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    h5 {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 15px;
    }

    p {
      text-align: justify;
      margin-bottom: 10px;
      font-size: 12px;
    }

    .para_section_2 {
      text-align: justify;
      margin-bottom: 10px;
      font-size: 8px;
    }

    .signature {
      margin-bottom: 10px;
      margin-top: 10px;
    }

    .signature-section .signature img {
      width: 100px;
      height: auto;
      margin-bottom: 10px;
    }

    .signature-section {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
    }

    .signature-box {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .signature-label {
      font-weight: bold;
    }

    .signature-line {
      padding: 5px 0;
    }

    .authorization-row {
      display: flex;
      gap: 40px;
      line-height: 1.2;
      margin-bottom: 10px;
      page-break-inside: avoid;
    }

    .authorization-item {
      display: flex;
      gap: 6px;
      align-items: center;
    }

    .authorization-label {
      font-weight: bold;
      white-space: nowrap;
    }

    .authorization-value {
      white-space: nowrap;
    }

    .section_2_driving_state {
      display: flex;
      gap: 25px;

      flex-direction: row;
    }

    .state_city {
      display: flex;
      justify-content: space-between;
      flex-direction: row;
      margin-top: 50px;
    }

    .employment-section {
      margin-top: 30px;
    }

    .employment-section h2 {
      font-size: 20px;
      margin-bottom: 10px;
      text-transform: uppercase;
    }

    .employment-section h3 {
      font-size: 16px;
      margin-bottom: 20px;
    }

    .info-row {
      margin-bottom: 8px;
      font-size: 12px;
    }

    .three_row_data {
      display: flex;
      flex-direction: row;
      gap: 30px;
    }

    .personal-info-box {
      border: 2px solid #000;
      text-align: center;
      place-self: center;
      padding: 10px;
      width: 100%;
      background-color: #f9f9f9;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
      margin-bottom: 10px;
      margin-top: 10px;
    }

    .headings {
      text-align: center;
      text-decoration: underline;

    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
    }

    table,
    th,
    td {
      border: 1px solid #999;
    }

    th,
    td {
      padding: 10px;
      text-align: left;
    }

    button {
      padding: 8px 16px;
      cursor: pointer;
    }




    .page-break {
      page-break-after: always;
    }
  </style>
</head>

<body>

  <!-- first form 1st part -->
  <div>
    <div class="section">
      <h2>
        DISCLOSURE AND AUTHORIZATION TO OBTAIN CONSUMER REPORTS AND/OR
        INVESTIGATIVE CONSUMER REPORTS
      </h2>

      <p>
        This is a disclosure and authorization for Social Sanitation (the
        "Company") and its employees, agents, and representatives to obtain one
        or more consumer reports and/or investigative consumer reports about you
        in connection with your partnership with the Company. A consumer report
        and/or investigative consumer report may be obtained at any time during
        the application process or during your partnership with the Company.
      </p>
      <p>
        A consumer report is a written, oral or other communication of any
        information by a consumer reporting agency potentially bearing on your
        credit worthiness, credit standing, credit capacity, character, general
        reputation, personal characteristics or mode of living which is used or
        expected to be used or collected in whole or in part for the purpose of
        serving as a factor in making an employment-related decision about you.
        Such information may include, for example, criminal history reports
        and/or driving records and all other pertinent records to the extent
        permitted by law.
      </p>

      <p>
        An investigative consumer report is a written, oral, or other
        communication of any information by a consumer reporting agency obtained
        through personal interviews with sources such as neighbors, friends and
        associates bearing on your character, general reputation, personal
        characteristics, or mode of living which is used or expected to be used
        or collected in whole or in part for the purpose of serving as a factor
        in making an employment-related decision about you. Upon written request
        by you, the Company will provide you with a complete and accurate
        disclosure of the nature and scope of the investigation requested. A
        summary of your rights under the Fair Credit Reporting Act is enclosed.
      </p>

      <h2>
        AUTHORIZATION TO OBTAIN CONSUMER REPORTS AND/OR INVESTIGATIVE CONSUMER
        REPORTS
      </h2>
      <p>
        Under the Fair Credit Reporting Act, before the Company may obtain a
        consumer report and/or investigative consumer report about you for
        employment or partnership purposes, we must have your written
        authorization. By signing below, you hereby authorize the Company and
        its employees, agents and representatives to obtain consumer reports
        and/or investigative consumer reports during the application process
        and/or during your employment or partnership with the Company.
      </p>
    </div>
    <div class="signature-section">
      <span class="authorization-label">Signature:</span>
      <div class="signature">
        ${
          signatureBase64Url
            ? `
        <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
        `
            : `
        <p style="font-style: italic; color: #999">No signature provided</p>
        `
        }
      </div>
    </div>
    <div class="authorization-row">
      <div class="authorization-item">
        <span class="authorization-label">Date:</span>
        <span class="authorization-value">${
          formData?.authorization?.date
        }</span>
      </div>
      <div class="authorization-item">
        <span class="authorization-label">Printed Name:</span>
        <span class="authorization-value">${
          formData?.authorization?.printedName
        }</span>
      </div>
    </div>
    <p class="page-break">
      Enclosures: A Summary of Your Rights Under the Fair Credit Reporting Act
    </p>
    <h2>DISCLOSURE TO INDEPENDENT CONTRACTOR REGARDING PROCUREMENT OF A CONSUMER REPORT</h2>
    <p>
      In connection with your application as an Independent Contractor, we may
      procure a Background Investigative Report and/or Background Report on you
      as part of the process of considering your candidacy as an Independent
      Contractor. In the event that information from the report is utilized in
      whole or in part in making an adverse decision with regard to our
      potential partnership, before making the adverse decision, we will provide
      you with a copy of the consumer report and a description in writing of
      your rights under the federal Fair Credit Reporting Act.
    </p>
    <p>
      The Fair Credit Reporting Act gives you specific rights in dealing with
      consumer reporting agencies. You will be given a summary of these rights
      together with this document.
    </p>
    <p>
      By your signature below, you hereby authorize us to obtain a consumer
      report and/or an investigative report about you in order to consider you
      as an Independent Contractor. The information requested below is being
      used strictly for pre-contract background screening purposes in order to
      obtain accurate results. The consumer report may include, but not be
      limited to, criminal history, verifications of employment and education,
      and driving records. A credit report detailing personal financial history
      will only be obtained for permissible purposes in consideration of jobs
      meeting specific criteria.
    </p>
    <div class="section">
      <div class="signature-box">
        <div class="signature-label">Applicant Name:</div>
        <div class="signature-line">
          ${[
            formData?.personalInfo?.firstName,
            formData?.personalInfo?.lastName,
          ]
            .filter(Boolean)
            .join(" ")}
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-label">Applicant's Address:</div>
        <div class="signature-line">
          ${formData?.personalInfo?.streetAddress}
        </div>
      </div>
   <div class="signature-box">
  <div class="signature-label">City/State/Country/Zip:</div>
  <div class="signature-line">
    ${formData?.personalInfo?.city || ""},
    ${formData?.personalInfo?.state || ""},
    ${formData?.personalInfo?.country || ""},
    ${formData?.personalInfo?.zipCode || ""}
  </div>
</div>
      <div class="signature-section">
        <span class="authorization-label">Signature:</span>
        <div class="signature">
          ${
            signatureBase64Url
              ? `
          <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
          `
              : `
          <p style="font-style: italic; color: #999">No signature provided</p>
          `
          }
        </div>
      </div>
    </div>
    <div class="section_2_driving_state">
      <div class="signature-box">
        <div class="signature-label">Social Security Number:</div>
        <div class="signature-line">${formData?.personalInfo?.ssn}</div>
      </div>
      <div class="signature-box">
        <div class="signature-label">Date of Birth:</div>
        <div class="signature-line">
  ${
    formData?.personalInfo?.dateOfBirth
      ? new Date(formData.personalInfo.dateOfBirth).toLocaleDateString(
          "en-US",
          {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          },
        )
      : ""
  }
</div>
      </div>
    </div>

    <p class="para_section_2">
      The EEOC states for the purpose of pre-employment inquiries, under the Age
      Discrimination in Employment Act of 1967, Section 1625.5, "A request on
      the part of an employer for information such as 'Date of Birth' or 'State
      Age' on an employment application form is not, in itself, a violation of
      the Act."
    </p>
    <div class="section_2_driving_state">
      <div class="signature-box">
        <div class="signature-label">Driver's License Number:</div>
        <div class="signature-line">${driverLicenseNumber}</div>
      </div>
      <div class="signature-box">
        <div class="signature-label">State:</div>
        <div class="signature-line">${formData?.personalInfo?.state}</div>
      </div>
    </div>
    <p class="para_section_2">To All Applicants:</p>
    <p class="para_section_2">
      The information requested above is used to assist in the completion of a
      background investigation. The information will be maintained in a limited
      access file, detached from your application. The information will be used
      for the sole purpose of identification when conducting a background
      investigation.
    </p>
    <p>
      <strong>
        I have received a copy of my Summary of Rights Under the Fair Credit
        Reporting Act.
      </strong>
    </p>
    <div class="signature-section">
      <span class="authorization-label">Signature:</span>
      <div class="signature">
        ${
          signatureBase64Url
            ? `
        <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
        `
            : `
        <p style="font-style: italic; color: #999">No signature provided</p>
        `
        }
      </div>
    </div>
  </div>

  <div class="page-break"></div>
  <!-- first form 2nd part -->
  <div>
    <!-- Personal Information -->
    <div class="employment-section">
      <h2>EMPLOYMENT / JOB APPLICATION</h2>


      <h3 class="personal-info-box">PERSONAL INFORMATION</h3>

      <div class="three_row_data">
        <div class="info-row">
          <strong>First Name:</strong> ${
            formData?.personalInfo?.firstName || ""
          }
        </div>
        <div class="info-row">
          <strong>Middle Name:</strong> ${
            formData?.personalInfo?.middleName || ""
          }
        </div>
        <div class="info-row">
          <strong>Last Name:</strong> ${formData?.personalInfo?.lastName || ""}
        </div>
      </div>
      <div class="three_row_data">
        <div class="info-row">
          <strong>Street Address:</strong> ${
            formData?.personalInfo?.streetAddress || ""
          }
        </div>
        <div class="info-row">
          <strong>Suite:</strong> ${formData?.personalInfo?.aptSuite || ""}
        </div>
      </div>
      <div class="three_row_data">
        <div class="info-row">
          <strong>City:</strong> ${formData?.personalInfo?.city || ""}
        </div>
        <div class="info-row">
          <strong>State:</strong>
          ${formData?.personalInfo?.state || ""}
        </div>
          <div class="info-row">
    <strong>Country:</strong> ${formData?.personalInfo?.country || ""}
  </div>
        <div class="info-row">
          <strong>Zip Code:</strong> ${formData?.personalInfo?.zipCode || ""}
        </div>
      </div>

     <div class="info-row">
  <strong>Date of Birth:</strong> ${
    formData?.personalInfo?.dateOfBirth
      ? new Date(formData.personalInfo.dateOfBirth).toLocaleDateString(
          "en-US",
          {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          },
        )
      : ""
  }
</div>

<div class="info-row">
  <strong>Date Available:</strong> ${
    formData?.personalInfo?.dateAvailable
      ? new Date(formData.personalInfo.dateAvailable).toLocaleDateString(
          "en-US",
          {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          },
        )
      : ""
  }
</div>


      <div class="three_row_data">
        <div class="info-row">
          <strong>E-Mail:</strong> ${formData?.personalInfo?.email || ""}
        </div>
        <div class="info-row">
          <strong>Phone:</strong>
          ${formData?.personalInfo?.phone || ""}
        </div>
      </div>

      <div class="info-row">
        <strong>Social Security Number:</strong>
        ${formData?.personalInfo?.ssn || ""}
      </div>

      <div class="info-row">
        <strong>Position Applied For:</strong> ${
          formData?.personalInfo?.email || ""
        }
      </div>
      <div class="info-row">
        <strong>Desired Pay:</strong>
        ${formData?.personalInfo?.desiredPay || ""}
      </div>
      <div class="info-row">
        <strong>Employment Desired:</strong>
        ${formData?.personalInfo?.employmentType || ""}
      </div>

      <div class="signature-section">
        <span class="authorization-label">Signature:</span>
        <div class="signature">
          ${
            signatureBase64Url
              ? `
          <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
          `
              : `
          <p style="font-style: italic; color: #999">No signature provided</p>
          `
          }
        </div>
      </div>

    </div>


    <!-- EMPLOYMENT ELIGIBILITY -->
    <div class="employment-section">

      <h3 class="personal-info-box">EMPLOYMENT ELIGIBILITY</h3>

      <div class="info-row">
        <strong>ARE YOU LEGALLY ELIGIBLE TO WORK IN THE U.S?:</strong>
        ${formData?.employmentEligibility?.legallyEligible || ""}
      </div>

      <div class="info-row">
        <strong>HAVE YOU EVER WORKED FOR THIS EMPLOYER?:</strong>
        ${formData?.employmentEligibility?.workedBefore || ""}
      </div>

      ${
        formData?.employmentEligibility?.workedBefore === "Yes"
          ? `<div class="info-row">
        <strong>IF YES, WRITE THE START AND END DATES:</strong>
        ${formData?.employmentEligibility?.employmentDates || ""}
      </div>`
          : ""
      }

      <div class="info-row">
        <strong>HAVE YOU EVER BEEN CONVICTED OF A FELONY?:</strong>
        ${formData?.employmentEligibility?.convictedFelony || ""}
      </div>

      ${
        formData?.employmentEligibility?.convictedFelony === "Yes"
          ? `<div class="info-row">
        <strong>IF YES, PLEASE EXPLAIN:</strong>
        ${formData?.employmentEligibility?.felonyExplanation || ""}
      </div>`
          : ""
      }

    </div>



    <!-- EDUCATION -->
    <div class="employment-section">

      <h3 class="personal-info-box">EDUCATION</h3>

      <div>
        <h5 class="headings">High School</h3>

          <div class="info-row">
            <strong>School Name:</strong>
            ${formData?.education?.highSchoolName || ""}
          </div>

          <div class="three_row_data">
            <div class="info-row">
              <strong>City:</strong> ${
                formData?.education?.highSchoolCity || ""
              }
            </div>
            <div class="info-row">
              <strong>State:</strong> ${
                formData?.education?.highSchoolState || ""
              }
            </div>

              <div class="info-row">
    <strong>Country:</strong> ${formData?.education?.highSchoolCountry || ""}
  </div>

          </div>

          <div class="info-row">
            <strong>From - To:</strong>
            ${formData?.education?.highSchoolDuration || ""}
          </div>

          <div class="info-row">
            <strong>Graduate?:</strong>
            ${formData?.education?.highSchoolGraduate || ""}
          </div>

          <div class="info-row">
            <strong>Diploma:</strong>
            ${formData?.education?.highSchoolDiploma || ""}
          </div>
      </div>

      <div>
        <h5 class="headings">College</h3>

          <div class="info-row">
            <strong>College Name:</strong>
            ${formData?.education?.collegeName || ""}
          </div>

          <div class="three_row_data">
            <div class="info-row">
              <strong>City:</strong> ${formData?.education?.collegeCity || ""}
            </div>
            <div class="info-row">
              <strong>State:</strong> ${formData?.education?.collegeState || ""}
            </div>
              <div class="info-row">
    <strong>Country:</strong> ${formData?.education?.collegeCountry || ""}
  </div>

          </div>

          <div class="info-row">
            <strong>From - To:</strong>
            ${formData?.education?.collegeDuration || ""}
          </div>

          <div class="info-row">
            <strong>Graduate?:</strong>
            ${formData?.education?.collegeGraduate || ""}
          </div>

          <div class="info-row">
            <strong>Degree:</strong>
            ${formData?.education?.collegeDegree || ""}
          </div>
      </div>

      <div>
        <h5 class="headings">Other Education</h3>

          <div class="info-row">
            <strong>Institution Name:</strong>
            ${formData?.education?.otherEducation || ""}
          </div>

          <div class="three_row_data">
            <div class="info-row">
              <strong>City:</strong> ${formData?.education?.otherCity || ""}
            </div>
            <div class="info-row">
              <strong>State:</strong> ${formData?.education?.otherState || ""}
            </div>

             <div class="info-row">
    <strong>Country:</strong> ${formData?.education?.otherCountry || ""}
  </div>

          </div>

          <div class="info-row">
            <strong>From - To:</strong>
            ${formData?.education?.otherDuration || ""}
          </div>

          <div class="info-row">
            <strong>Degree/Certification:</strong>
            ${formData?.education?.otherDegree || ""}
          </div>

      </div>

    </div>

    <!-- PREVIOUS EMPLOYMENT -->

    <div class="employment-section">

      <h3 class="personal-info-box">PREVIOUS EMPLOYMENT</h3>

      <div>
        <div class="info-row">
          <strong>Have you had a previous job?:</strong>
          ${formData?.previousEmployment?.hasJob || ""}
        </div>

        ${
          formData?.previousEmployment?.hasJob === "yes" &&
          Array.isArray(formData?.previousEmployment?.employers)
            ? formData.previousEmployment.employers
                .map(
                  (employer, index) => `
        <h5 class="headings">Employer ${index + 1}</h5>

        <div class="info-row">
          <strong>Company / Individual:</strong>
          ${employer.companyName || ""}
        </div>

        <div class="three_row_data">
          <div class="info-row">
            <strong>E-Mail:</strong> ${employer.email || ""}
          </div>
          <div class="info-row">
            <strong>Phone:</strong> ${employer.phone || ""}
          </div>
          <div class="info-row">
            <strong>Address:</strong> ${employer.address || ""}
          </div>
        </div>

        <div class="three_row_data">
          <div class="info-row">
            <strong>City:</strong> ${employer.city || ""}
          </div>

          <div class="info-row">
            <strong>State:</strong> ${employer.state || ""}
          </div>
           <div class="info-row">
    <strong>Country:</strong> ${employer.country || ""}
  </div>
          <div class="info-row">
            <strong>Zip Code:</strong> ${employer.zip || ""}
          </div>
        </div>

        <div class="info-row">
          <strong>Job Title:</strong> ${employer.jobTitle || ""}
        </div>

        <div class="info-row">
          <strong>From - To:</strong>
          ${
            Array.isArray(employer.duration)
              ? `${new Date(
                  employer.duration[0],
                ).toLocaleDateString()} - ${new Date(
                  employer.duration[1],
                ).toLocaleDateString()}`
              : ""
          }
        </div>

        <div class="info-row">
          <strong>Responsibilities:</strong> ${employer.responsibilities || ""}
        </div>

        <div class="info-row">
          <strong>Reason for Leaving:</strong> ${
            employer.reasonForLeaving || ""
          }
        </div>
        `,
                )
                .join("")
            : ""
        }
      </div>




    </div>


    <!-- REFERENCES -->

    <div class="employment-section">
      <h3 class="personal-info-box">REFERENCES</h3>

      ${
        references.length > 0
          ? references
              .map((reference, index) => {
                const refNumber = index + 1;
                return `
      <div>
        <h5 class="headings">Reference ${refNumber}</h5>

        <div class="three_row_data">
          <div class="info-row">
            <strong>First Name:</strong> ${reference.firstName || ""}
          </div>
          <div class="info-row">
            <strong>Last Name:</strong> ${reference.lastName || ""}
          </div>
        </div>

        <div class="info-row">
          <strong>Relationship:</strong> ${reference.relationship || ""}
        </div>

        <div class="three_row_data">
          <div class="info-row">
            <strong>Company:</strong> ${reference.company || ""}
          </div>
          <div class="info-row">
            <strong>Title:</strong> ${reference.title || ""}
          </div>
        </div>

        <div class="three_row_data">
          <div class="info-row">
            <strong>Email:</strong> ${reference.email || ""}
          </div>
          <div class="info-row">
            <strong>Phone:</strong> ${reference.phone || ""}
          </div>
        </div>
      </div>
      `;
              })
              .join("")
          : "<p>No references provided</p>"
      }
    </div>




    <!-- military  -->
    <div class="employment-section">
      <h3 class="personal-info-box">MILITARY SERVICE</h3>

      <div>
        <div class="info-row">
          <strong>ARE YOU A VETERAN?:</strong>
          ${veteranStatus || ""}
        </div>

        ${
          veteranStatus?.toLowerCase() === "yes"
            ? militaryRecords
                .map((record) => {
                  return `
        <div>
          <div class="info-row">
            <strong>Branch of Service:</strong> ${record.branch || ""}
          </div>

          <div class="info-row">
            <strong>Service Period (From - To):</strong>
            ${record.servicePeriod?.[0]?.slice(0, 10) || ""} -
            ${record.servicePeriod?.[1]?.slice(0, 10) || ""}
          </div>

          <div class="info-row">
            <strong>Rank at Discharge:</strong> ${record.rank || ""}
          </div>

          <div class="info-row">
            <strong>Type of Discharge:</strong> ${record.dischargeType || ""}
          </div>

          <div class="info-row">
            <strong>If Other Than Honorable, Explain:</strong>
            ${record.dischargeExplanation || ""}
          </div>
        </div>`;
                })
                .join("")
            : ""
        }
      </div>



    </div>


    <!-- backgroundCheck  -->

    <div class="employment-section">
      <h3 class="personal-info-box">BACKGROUND CHECK CONSENT</h3>

      <div class="info-row">
        <strong>IF ASKED, ARE YOU WILLING TO CONSENT TO A BACKGROUND CHECK?:</strong>
        ${formData?.backgroundCheck?.consent || ""}
      </div>

    </div>

    <!-- disclaimer  -->

    <div class="employment-section">
      <h3 class="personal-info-box">DISCLAIMER</h3>

      <p>Applicant understands that this is an Equal Opportunity Employer and committed to excellence through diversity.
        In order to ensure this application is acceptable, please print or type with the application being fully
        completed
        in order for it to be considered.

        Please complete each section EVEN IF you decide to attach a resume.

        I, the Applicant, certify that my answers are true and honest to the best of my knowledge. If this application
        leads to my eventualemployment, I understand that any false or misleading information in my application or
        interview may result in my employment being terminated.</p>


      <div class="signature-section">
        <span class="authorization-label">Signature:</span>
        <div class="signature">
          ${
            signatureBase64Url
              ? `
          <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
          `
              : `
          <p style="font-style: italic; color: #999">No signature provided</p>
          `
          }
        </div>
      </div>
      <div class="authorization-row">
        <div class="authorization-item">
          <span class="authorization-label">Date:</span>
          <span class="authorization-value">${
            formData?.authorization?.date
          }</span>
        </div>
        <div class="authorization-item">
          <span class="authorization-label">Printed Name:</span>
          <span class="authorization-value">${
            formData?.authorization?.printedName
          }</span>
        </div>
      </div>



    </div>
  </div>

  <div class="page-break"></div>

  <!-- florida agreement -->
  <div>
    <h2> FLORIDA NON-COMPETE AGREEMENT </h2>

    <p>1.<strong>Purpose</strong><br />
      This agreement, when countersigned below, shall constitute an agreement regarding certain confidential and
      proprietary information and trade secrets (“Confidential Information”) relating to the business of Social
      Sanitation Commercial Cleaning Solutions LLC hereinafter referred to as the “Company” and
      <strong> ${formData?.floridaAgreement?.companyNameTitle || ""}</strong>
      hereinafter referred to as the “Recipient” (collectively referred to as the “Parties”), as of the date executed by
      the Company (the “Effective Date”).

      Recipient shall strictly maintain the confidentiality of the Proprietary Information. Proprietary information may
      be shared between the Parties for use in scoping, estimating, and completing projects as well as for the everyday
      business practices for the Company and its clients/customers.
    </p>

    <p>2. <strong>Non-Compete/Disclosure</strong><br />
      During the tenure of the Recipient with the Company and the Time Period stated in Section 3 the Recipient shall
      not:<br />
      (Check All that Apply)<br />

      <li> <strong>Business Practices-</strong> Provide the same or similar industry products, services, or engage in
        any other way
        representation of any other business of a similar nature to the business of the Company without written consent.
        It is understood that the Recipient will be representing the Company exclusively during their tenure unless
        written notice has been provided from either of the Parties.</li>
      <li> <strong>Clients/Customers -</strong> Directly or indirectly engage in any similar business practice of the
        Company while being in contact with the Company’s current or former clients. Nor shall the Recipient solicit any
        client of the Company for the benefit of a third party that is engaged in a similar business to that of the
        Company.
      </li>
      <li> <strong> General Competitor(s) - </strong>Engage in business activity, whether paid or non- paid, with a
        competitor of the Company that provides a similar product or service.</li>
      <li> <strong>Specific Competitor(s) - </strong>Engage in business activity, whether paid or non- paid, with the
        following business(es) or individual(s): <strong>${
          formData?.floridaAgreement?.specific_competitor || ""
        }</strong></li>

      <li>
        <strong>Employees</strong> - Hire, work alongside, or partner with any current employees, sales staff, or former
        employees or sales
        staff of Company.
      </li>
    </p>

    <p>3. <strong>Time Period</strong><br />
      Recipient warrants and guarantees for the <stong>${
        formData?.floridaAgreement?.time_period || ""
      }</stong> period
      following the
      Effective Date of this agreement.
    </p>

    <p>4. <strong>Purchase Option</strong><br />
      The Company does not allow the Recipient to be released of liability from this agreement for any monetary amount
      or reason whatsoever.</p>

    <p>5. <strong>Jurisdiction</strong><br />
      The jurisdiction of this agreement shall cover the areas of
      <strong>${formData?.floridaAgreement?.select_jurisdiction || ""}</strong>
    </p>

    <p>6. <strong>Confidential Information</strong><br />
      As used herein “Confidential Information” shall mean any and all technical and non-technical information provided
      by the Company, including but not limited to: data or other proprietary information relating to products,
      inventions, plans, methods, processes, know-how, developmental or experimental work, computer programs, databases,
      authorship, customer lists (including the names, buying habits or practices of any clients), the names of vendors
      or suppliers, marketing methods, reports, analyses, business plans, financial information, statistical
      information, or any other subject matter pertaining to any business of the Company or any it’s respective clients,
      consultants, or licensees that is disclosed to the Recipient under the terms of this Agreement.</p>

    <p>7. <strong>Permitted Disclosure</strong><br />
      Confidential Information does not include information which:
    <ol type="I">
      <li>Has become generally known to the public through no wrongful act by the Recipient;</li>
      <li>Has been rightfully received by Recipient from a third party without restriction on disclosure and without
        breach of an obligation of confidentiality running either directly or indirectly to the Recipient;</li>
      <li>Has been approved for release to the general public by written authorization of the Company;</li>
      <li>Has been disclosed pursuant to the requirement of a governmental agency or a court of law without similar
        restrictions or other protections against public disclosure; or</li>
      <li>Has been independently developed by the Recipient without use, directly or indirectly, of the Company’s
        Confidential Information.</li>
    </ol>
    </p>

    <p>8. <strong>Confidentiality</strong><br />
      Recipient acknowledges that it will have access to the Company’s Confidential Information and agrees that it shall
      not directly or indirectly divulge, disclose or communicate any of the Confidential Information to any third
      party, except as may be required in the course of any formal business association or dealings with the Company and
      in any event, only with the prior written approval of the Company. The Recipient acknowledges that no license of
      the Confidential Information, by implication or otherwise, is granted to the Recipient by reason of this
      Agreement. Additionally, the Recipient acknowledges that it may only use the Confidential Information in
      connection with its business dealings with the Company and for no other purpose without the prior written consent
      of the Company. The Recipient further agrees that all Confidential Information, including without limitation any
      documents, files, reports, notebooks, samples, lists, correspondence, software, or other written or graphic
      records provided by the Company or produced using the Company’s Confidential Information, will be held strictly
      confidential and returned upon request to the Company. The term of this Agreement will be ongoing as long as the
      Parties are working together in any formal capacity. The conditions of this Agreement shall survive the
      termination of this Agreement.</p>

    <p>9. <strong>Consultants and Employees Bound</strong><br />
      Recipient agrees to disclose the Confidential Information to any agents, affiliates, directors, officers or any
      other employees (collectively, the “Employees”) solely on a need-to-know basis and represents that such Employees
      have signed appropriate non-disclosure agreements or taken appropriate measures imposing on such Employees a duty
      to third parties (1) to hold any third party proprietary information received by such Employees in the strictest
      confidence, (2) not to disclose such third party Confidential Information to any other third party, and (3) not to
      use such Confidential Information for the benefit of anyone other than to whom it belongs, without the prior
      express written authorization of the Company.
    </p>

    <p>10. <strong>Return of Materials</strong><br />
      Upon termination or expiration of the Agreement, or upon written request of the Company, the Recipient shall
      promptly return to the Company all documents and other tangible materials representing the Company’s Confidential
      Information and all copies thereof. The Company shall notify immediately the Recipient upon discovery of any loss
      or unauthorized disclosure of the Confidential Information.
    </p>

    <p>11. <strong>Remedies</strong><br />
      Should the Recipient breach any of the provisions of this Agreement by unauthorized use, or by disclosure of the
      Confidential Information to any unauthorized third party to the Company’s detriment or damage, the Recipient
      agrees to reimburse the Company for any loss or expense incurred by the Company as a result of such use or
      unauthorized disclosure or attempted disclosure, including without limitation court costs and reasonable
      attorney’s fees incurred by the Company in enforcing the provisions hereof. Recipient further agrees that any
      unauthorized use of or disclosure of the Confidential Information will result in irreparable damage to the Company
      and that the Company shall be entitled to an award by any court of competent jurisdiction of a temporary
      restraining order and/or preliminary injunction against such unauthorized use or disclosure by the Recipient
      without the need to post a bond. Such remedies, however, shall not be deemed to be the exclusive remedies for any
      breach of this Agreement but shall be in addition to all other remedies available at law or equity.
    </p>

    <p>12.<strong>Choice of Law</strong><br />
      This Agreement shall be governed by and construed in accordance with the laws of the State of Florida without
      reference to its conflicts of laws principles. Any disputes arising from or related to the subject matter of this
      Agreement shall be heard in a court of appropriate jurisdiction of the Company’s principal office and the parties
      hereby consent to the personal jurisdiction and venue of these courts. If any provisions of this Agreement or its
      applications is held to be invalid, illegal or unenforceable in any respect, the validity, legality or
      enforceability of any other provisions and applications herein shall not in any way be affected or impaired.
    </p>

    <p>13.<strong>Entire Agreement</strong><br />
      This Agreement represents the entire agreement of the parties and may only be modified by signature by both
      parties hereto.

      In Witness Whereof, the parties hereto have agreed and signed this Non-Compete/Non-Disclosure Agreement on the
      <strong>${new Date(
        formData?.floridaAgreement?.agreement_date,
      ).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}</strong>

    </p>


    <div class="three_row_data">
      <div>
        <h4>The Company</h4>
        <div class="signature-section">
          <span class="authorization-label">Signature:</span>
          <div class="signature">
            ${
              signatureCompanyBase64Url
                ? `
            <img src="${signatureCompanyBase64Url}" alt="Signature" crossorigin="anonymous" />
            `
                : `
            <p style="font-style: italic; color: #999">No signature provided</p>
            `
            }
          </div>
        </div>
        <p><strong>Social Sanitation Commercial Cleaning Solutions LLC</strong></p>
      </div>
      <div>
        <h4>The Recipient
        </h4>
        <div class="signature-section">
          <span class="authorization-label">Signature:</span>
          <div class="signature">
            ${
              signatureBase64Url
                ? `
            <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
            `
                : `
            <p style="font-style: italic; color: #999">No signature provided</p>
            `
            }
          </div>
        </div>
        <div class="authorization-row">
          <div class="authorization-item">
            <span class="authorization-label">Name:</span>
            <span class="authorization-value">${
              formData?.floridaAgreement?.recipientName
            }</span>
          </div>
        </div>
      </div>
    </div>

  </div>

  <div class="page-break"></div>

  <!-- direct deposit -->
  <div>
    <div>
      <h2> EMPLOYEE DIRECT DEPOSIT AUTHORIZATION</h2>
      <p>I,[employee] <strong>${
        formData?.directDeposit?.employee_name || ""
      }</strong>, : hereby</p>
      <li>authorize my employer, Social Sanitation Commercial Cleaning Solutions LLC and its agents, including financial
        institutions, to initiate electronic credit entries, and if necessary, debit entries and adjustments for any
        credit entries in error to my checking and/or savings accounts listed below. This authorization will remain in
        effect until I have informed my employer in writing that I wish to cancel it and my employer has had reasonable
        time to effect such cancellation. I understand I should contact my bank to verify receipt of funds</li>

      <li>revise direct deposit bank account(s) as indicated below</li>

      <li>cancel direct deposit of my paycheck completely. This cancellation is to take effect immediately and remain in
        full force and effect until the Company has received written notification from me of authorization to deposit my
        paycheck automatically. I acknowledge that I will now receive paychecks for which I am responsible for
        depositing and/or cashing</li><br />


      <div class="signature-section">
        <span class="authorization-label">Signature:</span>
        <div class="signature">
          ${
            signatureBase64Url
              ? `
          <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
          `
              : `
          <p style="font-style: italic; color: #999">No signature provided</p>
          `
          }
        </div>
      </div>
      <div class="authorization-row">
        <div class="authorization-item">
          <span class="authorization-label">Date:</span>
          <span class="authorization-value">${
            formData?.authorization?.date
          }</span>
        </div>

      </div>

      <div class="table_deposit">
        <table id="directDepositTable" border="1" cellspacing="0" cellpadding="5"
          style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th>Bank Name</th>
              <th>Account Type</th>
              <th>Routing Number</th>
              <th>Account Number</th>
              <th>Amount</th>
              <th>Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${formData?.directDeposit?.banks
              ?.map(
                (item) => `
            <tr>
              <td>${item.bankInfo || ""}</td>
              <td>${item.accountType || ""}</td>
              <td>${item.routingNumber || ""}</td>
              <td>${item.accountNumber || ""}</td>
              <td>${item.amount || ""}</td>
              <td>${item.percentage || ""}</td>

            </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>

      </div>

    </div>

  </div>


</body>

</html>

	`;

  const pdfDir = path.resolve(
    "/var/www/socialsanitation/backend/public/uploads/docs",
  );
  const pdfFileName = `hiring-form-${submissionId}-${Date.now()}.pdf`;

  const pdfPath = path.join(pdfDir, pdfFileName);

  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
  });

  await browser.close();

  return pdfPath;
};

const generateSpanishPDF = async (
  formData,
  signatureBase64Url,
  driverLicenseNumber,
  signatureCompanyBase64Url,
  submissionId,
) => {
  const veteranStatus = formData?.militaryService?.veteran;
  const militaryRecords = Array.isArray(formData?.militaryService?.records)
    ? formData.militaryService.records
    : [];
  const references = formData?.references || "[]";

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Authorization and Acknowledgment</title>
    <style>
        body {
            font-family: Georgia, "Times New Roman", Times, serif;
            font-size: 11px;
            line-height: 1.6;
            color: #000;
            margin: 40px;
        }


        h2 {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            text-decoration: underline;
            margin-bottom: 15px;
        }

        h4 {
            font-size: 10px;
            font-weight: bold;
            margin-bottom: 15px;
        }

        h5 {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 15px;
        }

        p {
            text-align: justify;
            margin-bottom: 10px;
            font-size: 12px;
        }

        .para_section_2 {
            text-align: justify;
            margin-bottom: 10px;
            font-size: 8px;
        }

        .signature {
            margin-bottom: 10px;
            margin-top: 10px;
        }

        .signature-section .signature img {
            width: 100px;
            height: auto;
            margin-bottom: 10px;
        }

        .signature-section {
            display: flex;
            justify-content: space-between;
            flex-direction: column;
        }

        .signature-box {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .signature-label {
            font-weight: bold;
        }

        .signature-line {
            padding: 5px 0;
        }

        .authorization-row {
            display: flex;
            gap: 40px;
            line-height: 1.2;
            margin-bottom: 10px;
            page-break-inside: avoid;
        }

        .authorization-item {
            display: flex;
            gap: 6px;
            align-items: center;
        }

        .authorization-label {
            font-weight: bold;
            white-space: nowrap;
        }

        .authorization-value {
            white-space: nowrap;
        }

        .section_2_driving_state {
            display: flex;
            gap: 25px;

            flex-direction: row;
        }

        .state_city {
            display: flex;
            justify-content: space-between;
            flex-direction: row;
            margin-top: 50px;
        }

        .employment-section {
            margin-top: 30px;
        }

        .employment-section h2 {
            font-size: 20px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .employment-section h3 {
            font-size: 16px;
            margin-bottom: 20px;
        }

        .info-row {
            margin-bottom: 8px;
            font-size: 12px;
        }

        .three_row_data {
            display: flex;
            flex-direction: row;
            gap: 30px;
        }

        .personal-info-box {
            border: 2px solid #000;
            text-align: center;
            place-self: center;
            padding: 10px;
            width: 100%;
            background-color: #f9f9f9;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            margin-bottom: 10px;
            margin-top: 10px;
        }

        .headings {
            text-align: center;
            text-decoration: underline;

        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
        }

        table,
        th,
        td {
            border: 1px solid #999;
        }

        th,
        td {
            padding: 10px;
            text-align: left;
        }

        button {
            padding: 8px 16px;
            cursor: pointer;
        }




        .page-break {
            page-break-after: always;
        }
    </style>
</head>

<body>

    <!-- first form 1st part -->
    <div>
        <div class="section">
            <h2>
                DIVULGACIÓN Y AUTORIZACIÓN PARA OBTENER INFORMES DEL CONSUMIDOR Y/O INFORMES DE INVESTIGACIÓN DEL
                CONSUMIDOR
            </h2>

            <p>
                Esta es una divulgación y autorización para que Social Sanitation (la "Empresa") y sus empleados,
                agentes y representantes obtengan uno o más informes de consumo y/o informes de investigación sobre
                usted en relación con su colaboración con la Empresa. Puede obtener un informe de consumo y/o un informe
                de investigación sobre usted en cualquier momento durante el proceso de solicitud o durante su
                colaboración con la Empresa.
            </p>

            <p>
                Un informe del consumidor es una comunicación escrita, oral o de otro tipo, realizada por una agencia de
                informes del consumidor, que podría afectar su solvencia, capacidad crediticia, reputación,
                características personales o estilo de vida, y que se utiliza o se espera utilizar o recopilar, total o
                parcialmente, para influir en la toma de decisiones laborales sobre usted. Dicha información puede
                incluir, por ejemplo, antecedentes penales, historial de conducción y cualquier otro registro
                pertinente, en la medida en que lo permita la ley. Un informe de investigación del consumidor es una
                comunicación escrita, oral o de otro tipo que realiza una agencia de informes del consumidor, con
                información obtenida mediante entrevistas personales con vecinos, amigos y socios, que refleje su
                carácter, reputación general, características personales o estilo de vida. Esta información se utiliza,
                o se espera que se utilice o recopile, total o parcialmente, para influir en la toma de decisiones
                laborales sobre usted. Si lo solicita por escrito, la Compañía le proporcionará una información completa
                y precisa sobre la naturaleza y el alcance de la investigación solicitada. Se adjunta un resumen de sus
                derechos bajo la Ley de Informes de Crédito Justos.
            </p>

            <h2>
                AUTORIZACIÓN PARA OBTENER INFORMES DEL CONSUMIDOR Y/O INFORMES DE INVESTIGACIÓN DEL CONSUMIDOR
            </h2>
            <p>
                Según la Ley de Informes Crediticios Justos (Fair Credit Reporting Act), para que la Compañía pueda
                obtener un informe del consumidor o un informe de investigación sobre usted para fines de empleo o
                asociación, necesitamos su autorización por escrito. Al firmar a continuación, usted autoriza a la
                Compañía y a sus empleados, agentes y representantes a obtener informes del consumidor o informes de
                investigación sobre usted durante el proceso de solicitud o durante su empleo o asociación con la
                Compañía.
            </p>
        </div>
        <div class="signature-section">
            <span class="authorization-label">Signature:</span>
            <div class="signature">
                ${
                  signatureBase64Url
                    ? `
                <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                `
                    : `
                <p style="font-style: italic; color: #999">sin firma</p>
                `
                }
            </div>
        </div>
        <div class="authorization-row">
            <div class="authorization-item">
                <span class="authorization-label">Fecha:</span>
                <span class="authorization-value">${
                  formData?.authorization?.date
                }</span>
            </div>
            <div class="authorization-item">
                <span class="authorization-label">Nombre en letra impresa:</span>
                <span class="authorization-value">${
                  formData?.authorization?.printedName
                }</span>
            </div>
        </div>
        <p class="page-break">
            Anexos: Resumen de sus derechos bajo la Ley de Informes de Crédito Justos
        </p>
        <h2>INFORMACIÓN AL CONTRATISTA INDEPENDIENTE SOBRE LA ADQUISICIÓN DE UN INFORME DEL CONSUMIDOR</h2>
        <p>
            En relación con su solicitud como Contratista Independiente, podríamos obtener un Informe de Investigación
            de Antecedentes y/o un Informe de Antecedentes sobre usted como parte del proceso de evaluación de su
            candidatura. En caso de que la información del informe se utilice total o parcialmente para tomar una
            decisión adversa con respecto a nuestra posible colaboración, antes de tomar dicha decisión, le
            proporcionaremos una copia del informe del consumidor y una descripción por escrito de sus derechos bajo la
            Ley Federal de Informes de Crédito Justos.


        </p>
        <p>
            La Ley de Informes Crediticios Justos le otorga derechos específicos al tratar con las agencias de informes
            crediticios. Recibirá un resumen de estos derechos junto con este documento.
        </p>
        <p>
            Al firmar a continuación, nos autoriza a obtener un informe crediticio o un informe de investigación sobre
            usted para considerarlo como contratista independiente. La información solicitada se utiliza exclusivamente
            para la verificación de antecedentes precontractual con el fin de obtener resultados precisos. El informe
            crediticio puede incluir, entre otros, antecedentes penales, verificación de empleo y educación, y registro
            de conducir. Solo se obtendrá un informe crediticio con su historial financiero personal para fines
            permitidos y para considerar empleos que cumplan con criterios específicos.
        </p>
        <div class="section">
            <div class="signature-box">
                <div class="signature-label">Nombre del solicitante (nombre legal completo):</div>
                <div class="signature-line">
                    ${[
                      formData?.personalInfo?.firstName,
                      formData?.personalInfo?.lastName,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                </div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Dirección del solicitante:</div>
                <div class="signature-line">
                    ${formData?.personalInfo?.streetAddress}
                </div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Ciudad/Estado/País/Código postal:</div>
<div class="signature-line">
    ${formData?.personalInfo?.city || ""},
    ${formData?.personalInfo?.state || ""},
    ${formData?.personalInfo?.country || ""},
    ${formData?.personalInfo?.zipCode || ""}
</div>
            </div>
            <div class="signature-section">
                <span class="authorization-label">Firma:</span>
                <div class="signature">
                    ${
                      signatureBase64Url
                        ? `
                    <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                    `
                        : `
                    <p style="font-style: italic; color: #999">sin firma</p>
                    `
                    }
                </div>
            </div>
        </div>
        <div class="section_2_driving_state">
            <div class="signature-box">
                <div class="signature-label">Número de Seguro Social:</div>
                <div class="signature-line">${formData?.personalInfo?.ssn}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Fecha de nacimiento:</div>
               <div class="signature-line">
  ${
    formData?.personalInfo?.dateOfBirth
      ? new Date(formData.personalInfo.dateOfBirth).toLocaleDateString(
          "en-US",
          {
            month: "2-digit",
            day: "2-digit",
            year: "numeric",
          },
        )
      : ""
  }
</div>
            </div>
        </div>

        <p class="para_section_2">
            La EEOC establece que, a los efectos de las investigaciones previas al empleo, en virtud de la Ley contra la
            Discriminación por Edad en el Empleo de 1967, Sección 1625.5, "Una solicitud por parte de un empleador de
            información como 'Fecha de nacimiento' o 'Edad indicada' en un formulario de solicitud de empleo no es, en
            sí misma, una violación de la Ley".
        </p>
        <div class="section_2_driving_state">
            <div class="signature-box">
                <div class="signature-label">Número de licencia de conducir:</div>
                <div class="signature-line">${driverLicenseNumber}</div>
            </div>
            <div class="signature-box">
                <div class="signature-label">Estado:</div>
                <div class="signature-line">${
                  formData?.personalInfo?.state
                }</div>
            </div>
        </div>
        <p class="para_section_2">A todos los solicitantes:</p>
        <p class="para_section_2">
            La información solicitada anteriormente se utiliza para ayudar en la realización de una investigación de
            antecedentes. Esta información se mantendrá en un archivo de acceso limitado, separado de su solicitud. La
            información será utilizada únicamente con el propósito de identificación al realizar la investigación de
            antecedentes.
        </p>
        <p>
            <strong>
                He recibido una copia de mi Resumen de Derechos conforme a la Ley de Informe Justo de Crédito (Fair
                Credit Reporting Act).
            </strong>
        </p>
        <div class="signature-section">
            <span class="authorization-label">Firma:</span>
            <div class="signature">
                ${
                  signatureBase64Url
                    ? `
                <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                `
                    : `
                <p style="font-style: italic; color: #999">sin firma</p>
                `
                }
            </div>
        </div>
    </div>

    <div class="page-break"></div>
    <!-- first form 2nd part -->
    <div>
        <!-- Personal Information -->
        <div class="employment-section">
            <h2>EMPLEO / SOLICITUD DE EMPLEO</h2>


            <h3 class="personal-info-box">INFORMACIÓN PERSONAL</h3>

            <div class="three_row_data">
                <div class="info-row">
                    <strong>Nombre :</strong> ${
                      formData?.personalInfo?.firstName || ""
                    }
                </div>
                <div class="info-row">
                    <strong>Segundo Nombre:</strong> ${
                      formData?.personalInfo?.middleName || ""
                    }
                </div>
                <div class="info-row">
                    <strong>Apellido:</strong> ${
                      formData?.personalInfo?.lastName || ""
                    }
                </div>
            </div>
            <div class="three_row_data">
                <div class="info-row">
                    <strong>Dirección:</strong> ${
                      formData?.personalInfo?.streetAddress || ""
                    }
                </div>
                <div class="info-row">
                    <strong>Apartamento/Suite:</strong> ${
                      formData?.personalInfo?.aptSuite || ""
                    }
                </div>
            </div>
            <div class="three_row_data">
                <div class="info-row">
                    <strong>Ciudad:</strong> ${
                      formData?.personalInfo?.city || ""
                    }
                </div>
                <div class="info-row">
                    <strong>Estado:</strong>
                    ${formData?.personalInfo?.state || ""}
                </div>
                  <div class="info-row">
        <strong>País:</strong>
        ${formData?.personalInfo?.country || ""}
    </div>
                <div class="info-row">
                    <strong>Código Postal:</strong> ${
                      formData?.personalInfo?.zipCode || ""
                    }
                </div>
            </div>

            <div class="info-row">
               <strong>Fecha de nacimiento:</strong> ${
                 formData?.personalInfo?.dateOfBirth
                   ? new Date(
                       formData.personalInfo.dateOfBirth,
                     ).toLocaleDateString("en-US", {
                       month: "2-digit",
                       day: "2-digit",
                       year: "numeric",
                     })
                   : ""
               }
            </div>
            <div class="info-row">
               <strong>Fecha de disponible:</strong>
${
  formData?.personalInfo?.dateAvailable
    ? new Date(formData.personalInfo.dateAvailable).toLocaleDateString(
        "en-US",
        {
          month: "2-digit",
          day: "2-digit",
          year: "numeric",
        },
      )
    : ""
}
            </div>


            <div class="three_row_data">
                <div class="info-row">
                    <strong>Correo electrónico:</strong> ${
                      formData?.personalInfo?.email || ""
                    }
                </div>
                <div class="info-row">
                    <strong>Teléfono:</strong>
                    ${formData?.personalInfo?.phone || ""}
                </div>
            </div>

            <div class="info-row">
                <strong>Número de Seguro Social:</strong>
                ${formData?.personalInfo?.ssn || ""}
            </div>

            <div class="info-row">
                <strong>Puesto solicitado:</strong> ${
                  formData?.personalInfo?.email || ""
                }
            </div>
            <div class="info-row">
                <strong>Sueldo deseado:</strong>
                ${formData?.personalInfo?.desiredPay || ""}
            </div>
            <div class="info-row">
                <strong>Empleo Deseado:</strong>
                ${formData?.personalInfo?.employmentType || ""}
            </div>

            <div class="signature-section">
                <span class="authorization-label">Firma:</span>
                <div class="signature">
                    ${
                      signatureBase64Url
                        ? `
                    <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                    `
                        : `
                    <p style="font-style: italic; color: #999">sin firma</p>
                    `
                    }
                </div>
            </div>

        </div>


        <!-- EMPLOYMENT ELIGIBILITY -->
        <div class="employment-section">

            <h3 class="personal-info-box">ELEGIBILIDAD LABORAL</h3>

            <div class="info-row">
                <strong>¿TIENE AUTORIZACIÓN LEGAL PARA TRABAJAR EN EE. UU.?:</strong>
                ${formData?.employmentEligibility?.legallyEligible || ""}
            </div>

            <div class="info-row">
                <strong>¿HA TRABAJADO ANTERIORMENTE PARA ESTE EMPLEADOR?:</strong>
                ${formData?.employmentEligibility?.workedBefore || ""}
            </div>

            ${
              formData?.employmentEligibility?.workedBefore === "Yes"
                ? `<div class="info-row">
                <strong>¿HA SIDO CONDENADO POR UN DELITO GRAVE (FELONÍA)?:</strong>
                ${formData?.employmentEligibility?.employmentDates || ""}
            </div>`
                : ""
            }

            <div class="info-row">
                <strong>¿HA SIDO CONDENADO POR UN DELITO GRAVE (FELONÍA)?:</strong>
                ${formData?.employmentEligibility?.convictedFelony || ""}
            </div>

            ${
              formData?.employmentEligibility?.convictedFelony === "Yes"
                ? `<div class="info-row">
                <strong>SI LA RESPUESTA ES SÍ, POR FAVOR EXPLIQUE::</strong>
                ${formData?.employmentEligibility?.felonyExplanation || ""}
            </div>`
                : ""
            }

        </div>



        <!-- EDUCATION -->
        <div class="employment-section">

            <h3 class="personal-info-box">EDUCACIÓN</h3>

            <div>
                <h5 class="headings">Escuela Secundaria</h5>

                <div class="info-row">
                    <strong>Nombre de la escuela:</strong>
                    ${formData?.education?.highSchoolName || ""}
                </div>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Ciudad:</strong> ${
                          formData?.education?.highSchoolCity || ""
                        }
                    </div>
                    <div class="info-row">
                        <strong>Estado:</strong> ${
                          formData?.education?.highSchoolState || ""
                        }
                    </div>
                     <div class="info-row">
        <strong>País:</strong> ${formData?.education?.highSchoolCountry || ""}
    </div>

                </div>

                <div class="info-row">
                    <strong>Desde - Hasta:</strong>
                    ${formData?.education?.highSchoolDuration || ""}
                </div>

                <div class="info-row">
                    <strong>¿Graduado?:</strong>
                    ${formData?.education?.highSchoolGraduate || ""}
                </div>

                <div class="info-row">
                    <strong>Diploma:</strong>
                    ${formData?.education?.highSchoolDiploma || ""}
                </div>
            </div>

            <div>
                <h5 class="headings">Colegio</h3>

                    <div class="info-row">
                        <strong>Nombre del Colegio:</strong>
                        ${formData?.education?.collegeName || ""}
                    </div>

                    <div class="three_row_data">
                        <div class="info-row">
                            <strong>Ciudad:</strong> ${
                              formData?.education?.collegeCity || ""
                            }
                        </div>
                        <div class="info-row">
                            <strong>Estado:</strong> ${
                              formData?.education?.collegeState || ""
                            }
                        </div>
                           <div class="info-row">
        <strong>País:</strong> ${formData?.education?.collegeCountry || ""}
    </div>

                    </div>

                    <div class="info-row">
                        <strong>Desde - Hasta:</strong>
                        ${formData?.education?.collegeDuration || ""}
                    </div>

                    <div class="info-row">
                        <strong>¿Graduado?:</strong>
                        ${formData?.education?.collegeGraduate || ""}
                    </div>

                    <div class="info-row">
                        <strong>La Licenciatura:</strong>
                        ${formData?.education?.collegeDegree || ""}
                    </div>
            </div>

            <div>
                <h5 class="headings">Otra Educación</h3>

                    <div class="info-row">
                        <strong>Nombre de la institución:</strong>
                        ${formData?.education?.otherEducation || ""}
                    </div>

                    <div class="three_row_data">
                        <div class="info-row">
                            <strong>Ciudad:</strong> ${
                              formData?.education?.otherCity || ""
                            }
                        </div>
                        <div class="info-row">
                            <strong>Estado:</strong> ${
                              formData?.education?.otherState || ""
                            }
                        </div>
                         <div class="info-row">
        <strong>País:</strong> ${formData?.education?.otherCountry || ""}
    </div>

                    </div>

                    <div class="info-row">
                        <strong>Desde - Hasta:</strong>
                        ${formData?.education?.otherDuration || ""}
                    </div>

                    <div class="info-row">
                        <strong>Licenciatura/Certificación:</strong>
                        ${formData?.education?.otherDegree || ""}
                    </div>

            </div>

        </div>

        <!-- PREVIOUS EMPLOYMENT -->

        <div class="employment-section">

            <h3 class="personal-info-box">EMPLEO ANTERIOR</h3>

            <div>
                <div class="info-row">
                    <strong>¿Ha tenido algún trabajo anterior?:</strong>
                    ${formData?.previousEmployment?.hasJob || ""}
                </div>

                ${
                  formData?.previousEmployment?.hasJob === "yes" &&
                  Array.isArray(formData?.previousEmployment?.employers)
                    ? formData.previousEmployment.employers
                        .map(
                          (employer, index) => `
                <h5 class="headings">Empleador ${index + 1}</h5>

                <div class="info-row">
                    <strong>Empresa / Particular:</strong>
                    ${employer.companyName || ""}
                </div>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Correo electrónico:</strong> ${
                          employer.email || ""
                        }
                    </div>
                    <div class="info-row">
                        <strong>Teléfono:</strong> ${employer.phone || ""}
                    </div>
                    <div class="info-row">
                        <strong>Dirección:</strong> ${employer.address || ""}
                    </div>
                </div>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Ciudad:</strong> ${employer.city || ""}
                    </div>
                    <div class="info-row">
                        <strong>Estado:</strong> ${employer.state || ""}
                    </div>
                      <div class="info-row">
        <strong>País:</strong> ${employer.country || ""}
    </div>
                    <div class="info-row">
                        <strong>Código Postal:</strong> ${employer.zip || ""}
                    </div>
                </div>

                <div class="info-row">
                    <strong>Título del puesto:</strong> ${
                      employer.jobTitle || ""
                    }
                </div>

                <div class="info-row">
                    <strong>Período de empleo:</strong>
                    ${
                      Array.isArray(employer.duration)
                        ? `${new Date(
                            employer.duration[0],
                          ).toLocaleDateString()} - ${new Date(
                            employer.duration[1],
                          ).toLocaleDateString()}`
                        : ""
                    }
                </div>

                <div class="info-row">
                    <strong>Responsabilidades:</strong> ${
                      employer.responsibilities || ""
                    }
                </div>

                <div class="info-row">
                    <strong>Motivo de salida:</strong> ${
                      employer.reasonForLeaving || ""
                    }
                </div>
                `,
                        )
                        .join("")
                    : ""
                }
            </div>




        </div>


        <!-- REFERENCES -->

        <div class="employment-section">
            <h3 class="personal-info-box">REFERENCIAS</h3>

            ${
              references.length > 0
                ? references
                    .map((reference, index) => {
                      const refNumber = index + 1;
                      return `
            <div>
                <h5 class="headings">Referencia ${refNumber}</h5>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Nombre:</strong> ${reference.firstName || ""}
                    </div>
                    <div class="info-row">
                        <strong>Apellido:</strong> ${reference.lastName || ""}
                    </div>
                </div>

                <div class="info-row">
                    <strong>Relación:</strong> ${reference.relationship || ""}
                </div>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Empresa:</strong> ${reference.company || ""}
                    </div>
                    <div class="info-row">
                        <strong>Cargo:</strong> ${reference.title || ""}
                    </div>
                </div>

                <div class="three_row_data">
                    <div class="info-row">
                        <strong>Correo electrónico:</strong> ${
                          reference.email || ""
                        }
                    </div>
                    <div class="info-row">
                        <strong>Teléfono:</strong> ${reference.phone || ""}
                    </div>
                </div>
            </div>
            `;
                    })
                    .join("")
                : "<p>No se proporcionan referencias</p>"
            }
        </div>




        <!-- military  -->
        <div class="employment-section">
            <h3 class="personal-info-box">SERVICIO MILITAR</h3>

            <div>
                <div class="info-row">
                    <strong>¿ES USTED VETERANO?:</strong>
                    ${veteranStatus || ""}
                </div>

                ${
                  veteranStatus?.toLowerCase() === "yes"
                    ? militaryRecords
                        .map((record) => {
                          return `
                <div>
                    <div class="info-row">
                        <strong>Rama del servicio:</strong> ${
                          record.branch || ""
                        }
                    </div>

                    <div class="info-row">
                        <strong>Período de servicio (Desde - Hasta):</strong>
                        ${record.servicePeriod?.[0]?.slice(0, 10) || ""} -
                        ${record.servicePeriod?.[1]?.slice(0, 10) || ""}
                    </div>

                    <div class="info-row">
                        <strong>Rango al ser dado de baja:</strong> ${
                          record.rank || ""
                        }
                    </div>

                    <div class="info-row">
                        <strong>Tipo de baja:</strong> ${
                          record.dischargeType || ""
                        }
                    </div>

                    <div class="info-row">
                        <strong>Si no fue honorable, explique:</strong>
                        ${record.dischargeExplanation || ""}
                    </div>
                </div>`;
                        })
                        .join("")
                    : ""
                }
            </div>



        </div>


        <!-- backgroundCheck  -->

        <div class="employment-section">
            <h3 class="personal-info-box">CONSENTIMIENTO DE VERIFICACIÓN DE ANTECEDENTES</h3>

            <div class="info-row">
                <strong>Si se lo preguntan, ¿está dispuesto a aceptar una verificación de antecedentes?:</strong>
                ${formData?.backgroundCheck?.consent || ""}
            </div>

        </div>

        <!-- disclaimer  -->

        <div class="employment-section">
            <h3 class="personal-info-box">DESCARGO DE RESPONSABILIDAD</h3>

            <p>El solicitante comprende que este es un empleador que ofrece igualdad de oportunidades y está
                comprometido con la excelencia a través de la diversidad. Para garantizar la aceptación de esta
                solicitud, por favor, complete la solicitud en su totalidad para que sea considerada.

                Por favor, complete cada sección, INCLUSO si decide adjuntar un currículum vitae.

                Yo, el solicitante, certifico que mis respuestas son verdaderas y honestas según mi leal saber y
                entender. Si esta solicitud me lleva a un empleo, entiendo que cualquier información falsa o engañosa en
                mi solicitud o entrevista podría resultar en mi despido.</p>


            <div class="signature-section">
                <span class="authorization-label">Firma:</span>
                <div class="signature">
                    ${
                      signatureBase64Url
                        ? `
                    <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                    `
                        : `
                    <p style="font-style: italic; color: #999">sin firma</p>
                    `
                    }
                </div>
            </div>
            <div class="authorization-row">
                <div class="authorization-item">
                    <span class="authorization-label">Fecha:</span>
                    <span class="authorization-value">${
                      formData?.authorization?.date
                    }</span>
                </div>
                <div class="authorization-item">
                    <span class="authorization-label">Nombre impreso:</span>
                    <span class="authorization-value">${
                      formData?.authorization?.printedName
                    }</span>
                </div>
            </div>



        </div>
    </div>

    <div class="page-break"></div>

    <!-- florida agreement -->
    <div>
        <h2> ACUERDO DE NO COMPETENCIA DE FLORIDA </h2>

        <p>1. <strong>Objetivo</strong><br />
            Este acuerdo, al ser refrendado a continuación, constituirá un acuerdo con respecto a cierta
            información confidencial y de propiedad exclusiva y secretos comerciales ("Información
            Confidencial") relacionados con el negocio de Social Sanitation Commercial Cleaning Solutions LLC
            en adelante denominada la "Compañía" y
            <strong> ${
              formData?.floridaAgreement?.companyNameTitle || ""
            }</strong>
            en adelante denominado el
            “Destinatario” (colectivamente denominados las “Partes”), a partir de la fecha de ejecución por la
            Compañía (la “Fecha de entrada en vigor”).

            El Receptor deberá mantener estrictamente la confidencialidad de la Información Privilegiada. Esta
            información podrá ser compartida entre las Partes para su uso en la definición del alcance, la
            estimación y la ejecución de proyectos, así como para las prácticas comerciales habituales de la
            Compañía y sus clientes.
        </p>

        <p>2. <strong>No Competencia/Divulgación</strong><br />
            Durante la permanencia del Destinatario en la Compañía y el Plazo establecido en la Sección 3, el
            Destinatario no podrá: (Marque todas las opciones que correspondan)
            <br />
            (Marque todas las opciones que correspondan)<br />

            <li> <strong>Prácticas Comerciales:-</strong> Ofrecer productos o servicios idénticos o similares a los de
                la industria, o representar de cualquier otra forma a cualquier otra empresa de naturaleza similar a la
                de la Compañía sin consentimiento por escrito. Se entiende que el Receptor representará exclusivamente a
                la Compañía durante su mandato, salvo notificación por escrito de cualquiera de las Partes.</li>
            <li> <strong>Clientes/Consumidores -</strong> Participar, directa o indirectamente, en cualquier actividad
                comercial similar de la Compañía al estar en contacto con sus clientes actuales o anteriores. El
                Destinatario tampoco podrá captar clientes de la Compañía para beneficio de un tercero que se dedique a
                una actividad comercial similar a la de la Compañía.
            </li>
            <li> <strong>Competidor(es) General(es) - </strong>Participar en una actividad comercial, ya sea pagada o
                no, con un competidor de la empresa que proporcione un producto o servicio similar</li>
            <li> <strong>Competidores Específicos - </strong>realicen actividades comerciales, pagadas o no, con las
                siguientes empresas o individuos: <strong>${
                  formData?.floridaAgreement?.specific_competitor || ""
                }</strong></li>

            <li>
                <strong>Empleados</strong> - contratar, trabajar junto o asociarse con cualquier empleado actual,
                personal de ventas o exempleados o personal de ventas de la empresa.
            </li>
        </p>

        <p>3. <strong>Período de Tiempo</strong><br />
            El receptor ordena y garantiza por el <stong>${
              formData?.floridaAgreement?.time_period || ""
            }</stong> período posterior a la fecha de entrada en vigor de este acuerdo.
        </p>

        <p>4. <strong>Opción de Compra</strong><br />
            La Compañía no permite que el Destinatario quede liberado de responsabilidad de este acuerdo por ningún
            monto monetario o motivo de ningún tipo.</p>

        <p>5. <strong>Jurisdicción</strong><br />
            La jurisdicción del presente acuerdo cubrirá las áreas de
            <strong>${
              formData?.floridaAgreement?.select_jurisdiction || ""
            }</strong>
        </p>

        <p>6. <strong>Información confidencia</strong><br />
            Tal como se utiliza en el presente documento, "Información Confidencial" significará toda información
            técnica y no técnica proporcionada por la Compañía, incluyendo, entre otros: datos u otra información de
            propiedad exclusiva relacionada con productos, invenciones, planes, métodos, procesos, conocimientos
            técnicos, trabajos de desarrollo o experimentales, programas informáticos, bases de datos, autoría, listas
            de clientes (incluidos los nombres, hábitos de compra o prácticas de cualquier cliente), los nombres de
            vendedores o proveedores, métodos de marketing, informes, análisis, planes de negocios, información
            financiera, información estadística o cualquier otro tema relacionado con cualquier negocio de la Compañía o
            cualquiera de sus respectivos clientes, consultores o licenciatarios que se divulgue al Destinatario según
            los términos de este Acuerdo</p>

        <p>7. <strong>Divulgación permitida</strong><br />
            La información confidencial no incluye información que:
        <ol type="I">
            <li>Haya llegado a ser de conocimiento público general sin mediar acto ilícito del Destinatario;</li>
            <li>Haya sido recibida legítimamente por el Destinatario de un tercero sin restricción de divulgación y sin
                violación de una obligación de confidencialidad que recaiga directa o indirectamente sobre el
                Destinatario;</li>
            <li>Ha sido aprobado para su divulgación al público en general mediante autorización escrita de la Compañía;
            </li>
            <li>Se ha divulgado de conformidad con el requisito de una agencia gubernamental o un
                tribunal de justicia sin restricciones similares u otras protecciones contra la
                divulgación pública; o</li>
            <li>Ha sido desarrollado independientemente por el Destinatario sin utilizar, directa o
                indirectamente, la Información Confidencial de la Compañía.</li>
        </ol>
        </p>

        <p>8. <strong>Confidentiality</strong><br />
            El Receptor reconoce que tendrá acceso a la Información Confidencial de la Compañía y se
            compromete a no divulgar, revelar ni comunicar, directa ni indirectamente, dicha
            Información a terceros, salvo que se requiera en el curso de cualquier relación comercial
            formal o trato con la Compañía y, en cualquier caso, únicamente con la aprobación previa
            por escrito de la Compañía. El Receptor reconoce que no se le otorga ninguna licencia sobre
            la Información Confidencial, implícita o de otro modo, en virtud del presente Acuerdo.
            Asimismo, el Receptor reconoce que solo podrá utilizar la Información Confidencial en
            relación con sus relaciones comerciales con la Compañía y para ningún otro fin sin el
            consentimiento previo por escrito de esta. El Receptor también acepta que toda la
            Información Confidencial, incluyendo, entre otros, cualquier documento, archivo, informe,
            cuaderno, muestra, lista, correspondencia, software u otros registros escritos o gráficos
            proporcionados por la Compañía o producidos con la Información Confidencial de la
            Compañía, se mantendrá estrictamente confidencial y se devolverá a solicitud de la
            Compañía. El presente Acuerdo se mantendrá vigente mientras las Partes colaboren
            formalmente. Las condiciones del presente Acuerdo se mantendrán vigentes tras su
            terminación.</p>

        <p>9. <strong>Consultores y empleados vinculados</strong><br />
            Recipient agrees to disclose the Con�idential Information to any agents, af�iliates, directors,
            of�icers or any other employees (collectively, the “Employees”) solely on a need-to-know
            basis and represents that such Employees have signed appropriate non-disclosure
            agreements or taken appropriate measures imposing on such Employees a duty to third
            parties (1) to hold any third party proprietary information received by such Employees in
            the strictest con�idence, (2) not to disclose such third party Con�idential Information to any
            other third party, and (3) not to use such Con�idential Information for the bene�it of anyone
            other than to whom it belongs, without the prior express written authorization of the
            Company.
        </p>

        <p>10. <strong>Devolución de Materiales</strong><br />
            Tras la rescisión o vencimiento del Acuerdo, o a solicitud escrita de la Compañía, el Receptor deberá
            devolver sin demora a la Compañía todos los documentos y demás materiales tangibles que representen la
            Información Confidencial de la Compañía, así como todas las copias de los mismos. La Compañía notificará
            inmediatamente al Receptor si detecta cualquier pérdida o divulgación no autorizada de la Información
            Confidencial.
        </p>

        <p>11. <strong>Remedios</strong><br />
            Si el Receptor incumple alguna de las disposiciones de este Acuerdo mediante uso no autorizado o divulgación
            de la Información Confidencial a un tercero no autorizado en detrimento o daño de la Compañía, el Receptor
            se compromete a reembolsar a la Compañía cualquier pérdida o gasto en que incurra como resultado de dicho
            uso, divulgación no autorizada o intento de divulgación, incluyendo, entre otros, las costas judiciales y
            los honorarios razonables de abogados en que incurra la Compañía para hacer cumplir las disposiciones del
            presente. El Receptor acepta además que cualquier uso o divulgación no autorizados de la Información
            Confidencial resultará en un daño irreparable para la Compañía y que esta tendrá derecho a que cualquier
            tribunal de jurisdicción competente dicte una orden de restricción temporal o un mandato judicial preliminar
            contra dicho uso o divulgación no autorizados por parte del Receptor sin necesidad de depositar una fianza.
            Sin embargo, dichos recursos no se considerarán los únicos recursos por cualquier incumplimiento de este
            Acuerdo, sino que se sumarán a todos los demás recursos disponibles por ley o equidad.
        </p>

        <p>12.<strong>Elección de la ley</strong><br />
            Este Acuerdo se regirá e interpretará de conformidad con las leyes del Estado de Florida, sin tener en
            cuenta sus principios de conflicto de leyes. Cualquier disputa que surja o esté relacionada con el objeto de
            este Acuerdo se resolverá en un tribunal de la jurisdicción correspondiente a la sede principal de la
            Compañía, y las partes se someten por la presente a la jurisdicción personal y competencia de dichos
            tribunales. Si alguna disposición de este Acuerdo o sus aplicaciones se considera inválida, ilegal o
            inaplicable en cualquier aspecto, la validez, legalidad o aplicabilidad de cualquier otra disposición o
            aplicación del presente Acuerdo no se verá afectada ni perjudicada en modo alguno.
        </p>

        <p>13.<strong>Acuerdo completo</strong><br />
            Este Acuerdo representa la totalidad del acuerdo entre las partes y solo podrá ser modificado mediante la
            firma de ambas partes.

            En fe de lo cual, las partes han acordado y firmado este Acuerdo de No Competencia/No Divulgación
            <strong>${new Date(
              formData?.floridaAgreement?.agreement_date,
            ).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}</strong>

        </p>


        <div class="three_row_data">
            <div>
                <h4>La Empresa</h4>
                <div class="signature-section">
                    <span class="authorization-label">Firma:</span>
                    <div class="signature">
                        ${
                          signatureCompanyBase64Url
                            ? `
                        <img src="${signatureCompanyBase64Url}" alt="Signature" crossorigin="anonymous" />
                        `
                            : `
                        <p style="font-style: italic; color: #999">sin firma</p>
                        `
                        }
                    </div>
                </div>
                <p><strong>Social Sanitation Commercial Cleaning Solutions LLC</strong></p>
            </div>
            <div>
                <h4>El Destinatario</h4>
                <div class="signature-section">
                    <span class="authorization-label">Firma:</span>
                    <div class="signature">
                        ${
                          signatureBase64Url
                            ? `
                        <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                        `
                            : `
                        <p style="font-style: italic; color: #999">sin firma</p>
                        `
                        }
                    </div>
                </div>
                <div class="authorization-row">
                    <div class="authorization-item">
                        <span class="authorization-label">Nombre:</span>
                        <span class="authorization-value">${
                          formData?.floridaAgreement?.recipientName
                        }</span>
                    </div>
                </div>
            </div>
        </div>

    </div>

    <div class="page-break"></div>

    <!-- direct deposit -->
    <div>
        <div>
            <h2> AUTORIZACIÓN DE DEPÓSITO DIRECTO DEL EMPLEADO</h2>
            <p>Yo, [empleado <strong>${
              formData?.directDeposit?.employee_name || ""
            }</strong>,por la presente:</p>
            <li>autorizo a mi empleador, Social Sanitation Commercial Cleaning Solutions LLC y a sus agentes, incluidas
                las instituciones financieras, a iniciar abonos electrónicos y, de ser necesario, débitos y ajustes por
                cualquier abono erróneo en mis cuentas de cheques o de ahorros que se indican a continuación. Esta
                autorización permanecerá vigente hasta que informe por escrito a mi empleador sobre mi deseo de
                cancelarla y este haya tenido tiempo razonable para hacerlo. Entiendo que debo contactar a mi banco para
                verificar el recibo de los fondos.</li>

            <li>revisar la(s) cuenta(s) bancaria(s) de depósito directo como se indica a continuación.</li>

            <li>cancelar por completo el depósito directo de mi nómina. Esta cancelación entrará en vigor de inmediato y
                permanecerá vigente hasta que la Compañía reciba mi notificación por escrito autorizando el depósito
                automático de mi nómina. Reconozco que a partir de ahora recibiré los cheques de nómina que debo
                depositar o cobrar.</li><br />


            <div class="signature-section">
                <span class="authorization-label">Firma:</span>
                <div class="signature">
                    ${
                      signatureBase64Url
                        ? `
                    <img src="${signatureBase64Url}" alt="Signature" crossorigin="anonymous" />
                    `
                        : `
                    <p style="font-style: italic; color: #999">sin firma</p>
                    `
                    }
                </div>
            </div>
            <div class="authorization-row">
                <div class="authorization-item">
                    <span class="authorization-label">Fecha:</span>
                    <span class="authorization-value">${
                      formData?.authorization?.date
                    }</span>
                </div>

            </div>

            <div class="table_deposit">
                <table id="directDepositTable" border="1" cellspacing="0" cellpadding="5"
                    style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr>
                            <th>Nombre del banco</th>
                            <th>Tipo de cuenta</th>
                            <th>Número de ruta</th>
                            <th>Número de cuenta</th>
                            <th>Cantidad</th>
                            <th>Porcentaje</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${formData?.directDeposit?.banks
                          ?.map(
                            (item) => `
                        <tr>
                            <td>${item.bankInfo || ""}</td>
                            <td>${item.accountType || ""}</td>
                            <td>${item.routingNumber || ""}</td>
                            <td>${item.accountNumber || ""}</td>
                            <td>${item.amount || ""}</td>
                            <td>${item.percentage || ""}</td>

                        </tr>
                        `,
                          )
                          .join("")}
                    </tbody>
                </table>

            </div>

        </div>

    </div>


</body>

</html>`;

  const pdfDir = path.resolve(
    "/var/www/socialsanitation/backend/public/uploads/docs",
  );

  const pdfFileName = `hiring-form-${submissionId}-${Date.now()}.pdf`;

  const pdfPath = path.join(pdfDir, pdfFileName);
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "20mm", right: "20mm" },
  });

  await browser.close();

  return pdfPath;
};

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

// const generateInvoicePDF = async (data) => {
//   const {
//     invoice_ref_no,
//     service_start,
//     service_end,
//     invoice_date,
//     billing_date,
//     due_date,
//     to_company_name,
//     address_1,
//     address_2,
//     items,
//     total_due,
//     signature,
//     payment_link,
//   } = data;

//   /* ===== FORMAT DATES ===== */

//   const formattedServiceStart = service_start
//     ? moment(service_start, "YYYY-MM-DD").format("MM-DD-YYYY")
//     : "";

//   const formattedServiceEnd = service_end
//     ? moment(service_end, "YYYY-MM-DD").format("MM-DD-YYYY")
//     : "";

//   const formattedInvoiceDate = invoice_date
//     ? moment(invoice_date, "YYYY-MM-DD").format("MM-DD-YYYY")
//     : "";

//   const formattedBillingDate = billing_date
//     ? moment(billing_date, "YYYY-MM-DD").format("MM-DD-YYYY")
//     : "";

//   const formattedDueDate = due_date
//     ? moment(due_date, "YYYY-MM-DD").format("MM-DD-YYYY")
//     : "";

//   const formatAmount = (value) => {
//     const num = Number(value || 0);

//     if (!Number.isFinite(num)) {
//       return "0";
//     }

//     return num.toFixed(6).replace(/\.?0+$/, "");
//   };

//   const measurementHeader = "Sqft / Hour";

//   const calculatedTotal = items.reduce((sum, item) => {
//     const unit_price = Number(item.unit_price || 0);
//     const quantity = Number(item.quantity || 1);

//     let multiplier = 1;

//     if (item.calculation_type === "hour") {
//       const hour = Number(item.hour || 0);
//       multiplier = hour || 1;
//     } else if (item.calculation_type === "sqft") {
//       const sqft = Number(item.sqft || 0);
//       multiplier = sqft || 1;
//     }

//     return sum + quantity * unit_price * multiplier;
//   }, 0);

//   /*
//    * cfg drives ALL spacing/sizing tiers based on item count so the
//    * invoice always fits a single A4 page, same design either way.
//    * 1-5 items  = original design, untouched
//    * 6-8 items  = mildly compact
//    * 9+ items   = compact + tighter margins to still fit one page
//    */
//   const cfg = getInvoiceLayoutConfig(items.length);

//   const htmlContent = `
// <!doctype html>
// <html>
// 	<head>
// 		<meta charset="utf-8" />
// 		<title>Invoice</title>

// 		<style>
// 			body {
// 				font-family: Arial, sans-serif;
// 				margin: 0;
// 				padding: ${cfg.bodyPadding};
// 				color: #000;
// 			}

// 			.header {
// 				display: flex;
// 				justify-content: space-between;
// 				align-items: center;
// 				border-bottom: 2px solid #444;
// 				padding-bottom: 10px;
// 			}

// 			.logo {
// 				width: 120px;
// 			}

// 			.title {
// 				background-color: #495057;
// 				color: #fff;
// 				padding: 15px 25px;
// 				font-size: 22px;
// 				font-weight: bold;
// 				text-align: right;
// 			}

// 			.meta-info {
//   display: block;
// }

// .addresses {
//   display: flex;
//   justify-content: space-between;
// }

// 			.meta-info div,
// 			.addresses div {
// 				width: 48%;
// 				font-size: 14px;
// 			}

// 			.meta-info p,
// 			.addresses p {
// 				margin: 4px 0;
// 			}

// 			table {
// 				width: 100%;
// 				border-collapse: collapse;
// 				margin: ${cfg.tableMargin};
// 			}

// 			th,
// 			td {
// 				border: 1px solid #000;
// 				padding: ${cfg.tablePadding};
// 				text-align: left;
// 				font-size: ${cfg.tableFontSize};
// 				line-height: 1.2;
// 			}

// 			th {
// 				background-color: #f0f0f0;
// 			}

// 			.total {
// 				text-align: right;
// 				font-size: 16px;
// 				font-weight: bold;
// 				margin-top: ${cfg.totalMarginTop};
// 			}

// 			.signature-section {
// 				display: flex;
// 				justify-content: space-between;
// 				margin-top: ${cfg.signatureMarginTop};
// 				font-size: 14px;
// 			}

// 			.signature-section .date,
// 			.signature-section .signature {
// 				width: 48%;
// 			}

// 			.signature-section .signature img {
// 				margin-top: 5px;
// 				width: 120px;
// 				height: auto;
// 			}

// 			.signature-section .signature p {
// 				margin-top: 10px;
// 				line-height: 1.2;
// 				white-space: pre-line;
// 			}

// 			.payment-link {
// 				margin-top: ${cfg.paymentMarginTop};
// 				text-align: center;
// 				font-size: 12px;
// 			}

// 			.payment-link p {
// 				margin: 0;
// 			}

// 			.payment-link span {
// 				display: inline-block;
// 				/* min-width: 250px; */
// 				border-bottom: 1px solid #000;
// 				padding-bottom: 2px;
// 			}

// 			.terms {
// 				margin-top: ${cfg.termsMarginTop};
// 				font-size: ${cfg.termsFontSize};
// 				line-height: ${cfg.termsLineHeight};
// 				text-align: justify;
// 				padding: 0 30px;
// 			}

// 			.footer {
// 				margin-top: ${cfg.footerMarginTop};
// 				font-size: 10px;
// 				text-align: center;
// 				border-top: 1px solid #000;
// 				padding-top: 5px;
// 			}
// 		</style>
// 	</head>

// 	<body>
// 		<div class="header">
// 			<img
// 				class="logo"
// 				src="https://socialsanitation.com/wp-content/uploads/2022/12/New-Logo.jpg"
// 			/>
// 			<div class="title">INVOICE</div>
// 		</div>

// 		<div style="margin-top: 10px; font-size: 13px">
// 			<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">
// 				<div>
// 					<div style="color: #555">INVOICE REF</div>
// 					<div><strong>${invoice_ref_no}</strong></div>
// 				</div>

// 				<div>
// 					<div style="color: #555">BILLING DATE</div>
// 					<div><strong>${formattedBillingDate}</strong></div>
// 				</div>

// 				<div>
// 					<div style="color: #555">SERVICE DATE</div>
// 					<div style="line-height: 1.4">
// 						<strong>${formattedServiceStart}</strong><br />
// 						<strong>${formattedServiceEnd}</strong>
// 					</div>
// 				</div>

// 				<div>
// 					<div style="color: #555">DUE DATE</div>
// 					<div><strong>${formattedDueDate}</strong></div>
// 				</div>
// 			</div>
// 		</div>

// 		<div class="addresses">
// 			<div>
// 				<p><strong>FROM</strong></p>
// 				<p>Social Sanitation Commercial Cleaning Solutions</p>
// 				<p>5201 N 44TH St</p>
// 				<p>Tampa, FL 33610</p>
// 			</div>

// 			<div>
// 				<p><strong>TO</strong></p>
// 				<p>${to_company_name}</p>
// 				<p>${address_1}</p>
// 				<p>${address_2}</p>
// 			</div>
// 		</div>

// 		<table>
// 			<thead>
// 				<tr>
// 					<th>Description</th>
// 					<th>Frequency</th>
// 					<th>Quantity</th>
//           <th>${measurementHeader}</th>
// 					<th>Amount ($)</th>
// 				</tr>
// 			</thead>

// 			<tbody>
// 				${items
//           .map((item) => {
//             const unit_price = Number(item.unit_price || 0);
//             const quantity = Number(item.quantity || 1);

//             let measurement = "N/A";
//             let multiplier = 1;

//             if (item.calculation_type === "hour") {
//               measurement = Number(item.hour || 0);
//               multiplier = measurement;
//             } else if (item.calculation_type === "sqft") {
//               measurement = Number(item.sqft || 0);
//               multiplier = measurement;
//             }

//             const amount = quantity * unit_price * multiplier;

//             return `
// <tr>
//   <td>${item.description}</td>
//   <td>${item.frequency || "-"}</td>
//   <td>${quantity}</td>
//   <td>${measurement}</td>
//  <td>$${formatAmount(amount)}</td>
// </tr>
// `;
//           })
//           .join("")}
// 			</tbody>
// 		</table>

// 	<p class="total">Total: $${formatAmount(calculatedTotal)}</p>

// 		<div
// 			class="signature-section"
// 			style="
// 				display: flex;
// 				justify-content: space-between;
// 				align-items: flex-end;
// 				font-size: 14px;
// 				width: 100%;
// 			"
// 		>
// 			<!-- Date -->
// 			<div class="date" style="width: 48%; text-align: left">
// 				<p style="margin: 0; font-size: 12px; font-weight: bold">
// 					${
//             invoice_date
//               ? moment(invoice_date, "YYYY-MM-DD").format("MMMM DD, YYYY")
//               : "Month-Day-Year"
//           }
// 				</p>
// 				<div
// 					style="border-top: 1px solid #000; width: 220px; margin: 5px 0 0 0"
// 				></div>
// 				<p
// 					style="
// 						margin: 0;
// 						font-size: 12px;
// 						font-weight: bold;
// 						text-align: center;
// 						width: 220px;
// 					"
// 				>
// 					Date
// 				</p>
// 			</div>

// 			<!-- Signature -->
// 			<div class="signature" style="width: 48%; text-align: left">
// 				${
//           signature
//             ? `<img
// 					src="${signature}"
// 					alt="Signature"
// 					crossorigin="anonymous"
// 					style="width: 120px; height: auto; margin-bottom: 5px"
// 				/>`
//             : `<div style="height: 60px"></div>`
//         }
// 				<div
// 					style="border-top: 1px solid #000; width: 280px; margin-top: 5px"
// 				></div>
// 				<p
// 					style="
// 						margin: 2px 0 0 0;
// 						font-size: 12px;
// 						font-weight: bold;
// 						color: #000;
// 					"
// 				>
// 					Social Sanitation Legal Representative Signature
// 				</p>
// 			</div>
// 		</div>

// 		<div
// 			class="payment-link"
// 			style="text-align: center; font-size: 12px"
// 		>
// 			<p style="margin: 0">
// 				<strong>Square Payment Link:</strong>
// 				<span>
// 					${
//             payment_link
//               ? `<a
// 						href="${payment_link}"
// 						target="_blank"
// 						style="
// 							word-break: break-all;
// 							color: #0066cc;
// 							text-decoration: underline;
// 							font-size: 11px;
// 						"
// 					>
// 						${payment_link} </a
// 					>`
//               : `<span style="color: #999">(No payment link available)</span>`
//           }
// 				</span>
// 			</p>
// 		</div>

// 		<div class="terms">
// 			<p>
// 				Invoices are sent on the last business day of each month and are to be
// 				paid within 5 business days of due date. All late payments are subject
// 				to late fees of $30, every 5-business day period after the service
// 				month. If needed, the pay options above can change but it is necessary
// 				to change payment arrangements 5 business days before the end of the
// 				current service month if check or ACH. Payments made via credit or debit
// 				card can be made at any time. All late fees will be added to the invoice
// 				of the following service month, to fully satisfy the invoice for the
// 				previous service month.
// 			</p>
// 		</div>

// 		<div class="footer">
// 			SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS &nbsp;&nbsp;&nbsp; |
// 			&nbsp;&nbsp;&nbsp; INVOICE REF#: ${invoice_ref_no}
// 		</div>
// 	</body>
// </html>
// `;

//   const pdfDir = path.resolve(__dirname, "../../public/uploads/docs");
//   const pdfPath = path.join(pdfDir, `invoice-${invoice_ref_no}.pdf`);

//   if (!fs.existsSync(pdfDir)) {
//     fs.mkdirSync(pdfDir, { recursive: true });
//   }

//   const browser = await puppeteer.launch({
//     headless: true,
//     executablePath:
//       "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   });

//   const page = await browser.newPage();

//   await page.setContent(htmlContent);

//   await page.evaluateHandle("document.fonts.ready");

//   await page.evaluate(async () => {
//     const images = Array.from(document.images);
//     await Promise.all(
//       images.map((img) => {
//         if (img.complete) return;
//         return new Promise((resolve) => {
//           img.addEventListener("load", resolve);
//           img.addEventListener("error", resolve);
//         });
//       }),
//     );
//   });

//   await page.pdf({
//     path: pdfPath,
//     format: "A4",
//     printBackground: true,
//     margin: {
//       top: "20px",
//       bottom: "20px",
//       left: "20px",
//       right: "20px",
//     },
//   });

//   await browser.close();

//   return pdfPath;
// };

const generateInvoicePDF = async (data) => {
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
    total_due,
    signature,
    payment_link,
    
  } = data;

  /* ===== FORMAT DATES ===== */

  const formattedServiceStart = service_start
    ? moment(service_start, "YYYY-MM-DD").format("MM/DD/YYYY")
    : "";

  const formattedServiceEnd = service_end
    ? moment(service_end, "YYYY-MM-DD").format("MM/DD/YYYY")
    : "";

  const formattedInvoiceDate = invoice_date
    ? moment(invoice_date, "YYYY-MM-DD").format("MM/DD/YYYY")
    : "";

  const formattedBillingDate = billing_date
    ? moment(billing_date, "YYYY-MM-DD").format("MM/DD/YYYY")
    : "";

  const formattedDueDate = due_date
    ? moment(due_date, "YYYY-MM-DD").format("MM/DD/YYYY")
    : "";

  const formatAmount = (value) => {
    const num = Number(value || 0);

    if (!Number.isFinite(num)) {
      return "0";
    }

    return num.toFixed(6).replace(/\.?0+$/, "");
  };

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

  const htmlContent = `
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
					src="https://socialsanitation.com/wp-content/uploads/2022/12/New-Logo.jpg"
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
            invoice_date
              ? moment(invoice_date, "YYYY-MM-DD").format("MMMM DD, YYYY")
              : "Month-Day-Year"
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

  const pdfDir = path.resolve(__dirname, "../../public/uploads/docs");
  const pdfPath = path.join(pdfDir, `invoice-${invoice_ref_no}.pdf`);

  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  await page.setContent(htmlContent);

  await page.evaluateHandle("document.fonts.ready");
  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map((img) => {
        if (img.complete) return;
        return new Promise((resolve) => {
          img.addEventListener("load", resolve);
          img.addEventListener("error", resolve);
        });
      }),
    );
  });

  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "20px",
      bottom: "20px",
      left: "20px",
      right: "20px",
    },
  });

  await browser.close();

  return pdfPath;
};

const generateServiceRequestPDF = async (data) => {
  const {
    ref_no,
    service_days,
    due_date,
    to_company_name,
    address_1,
    address_2,
    items,
    signature,
    date,
    pdfPath,
  } = data;

  const formatDate = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  };

  const formattedSignedDate = formatDate(date);
  const formattedDueDate = formatDate(due_date);

  const formatAmount = (value) => {
    const num = Number(value || 0);

    if (!Number.isFinite(num)) {
      return "0";
    }

    return num.toFixed(6).replace(/\.?0+$/, "");
  };

  const calculatedTotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 1);
    const unit_price = Number(item.unit_price || item.unitPrice || 0);

    return sum + quantity * unit_price;
  }, 0);

  const htmlContent = `
<!doctype html>
<html>

<head>
    <meta charset="utf-8" />
    <title>Service Quote</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 40px;
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

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 30px 0;
        }

        th,
        td {
            border: 1px solid #000;
            padding: 8px;
            text-align: left;
            font-size: 14px;
        }

        th {
            background-color: #f0f0f0;
        }

        .total {
            text-align: right;
            font-size: 16px;
            font-weight: bold;
            margin-top: 20px;
        }

        .signature-section {
            display: flex;
            justify-content: space-between;
            margin-top: 50px;
            font-size: 14px;
        }

        .signature-section .date,
        .signature-section .signature {
            width: 48%;
        }

        .signature-section .signature img {
            margin-top: 5px;
            width: 120px;
            /* smaller signature */
            height: auto;
        }

        .signature-section .signature p {
            margin-top: 10px;
            line-height: 1.2;
            white-space: pre-line;
            /* preserves line breaks */
        }

        .payment-link {
            margin-top: 60px;
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
            margin-top: 80px;
            font-size: 10px;
            line-height: 1.4;
            text-align: justify;
            padding: 0 30px;
        }

        .footer {
            margin-top: 140px;
            font-size: 10px;
            text-align: center;
            border-top: 1px solid #000;
            padding-top: 5px;
        }
    </style>
</head>

<body>
    <div class="header">
        <img class="logo" src="https://socialsanitation.com/wp-content/uploads/2022/12/New-Logo.jpg"
            alt="Company Logo" />
        <div class="title">SERVICE REQUEST</div>
    </div>

    <div class="meta-info">
        <div>
            <p><strong>Ref #:</strong> ${ref_no}</p>
            <p><strong>Service Days:</strong> ${service_days}</p>
            <p><strong>Due Date:</strong> ${formattedDueDate}</p>
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

    <table>
        <thead>
            <tr>
                <th>Description</th>
                <th>Frequency</th>
                <th>Quantity</th>
                <th>Price ($)</th>
                <th>Amount ($)</th>
            </tr>
        </thead>
        <tbody>
        ${items
          .map((item) => {
            const unit_price = Number(item.unit_price || item.unitPrice || 0);

            const quantity = Number(item.quantity || 1);

            const amount = quantity * unit_price;

            return `
      <tr>
        <td>${item.description || ""}</td>
        <td>${item.frequency || "-"}</td>
        <td>${quantity}</td>
        <td>$${formatAmount(unit_price)}</td>
        <td>$${formatAmount(amount)}</td>
      </tr>
    `;
          })
          .join("")}
        </tbody>
    </table>

   <p class="total">Total: $${formatAmount(calculatedTotal)}</p>
    <!-- SIGNATURE SECTION -->

	<div style="margin-top: 70px">

	<!-- ROW 1 -->
	<div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 50px">

		<!-- DATE (LEFT) -->
		<div style="width: 40%; text-align: center">
			<div style="font-size: 16px; font-weight: bold">
				${
          date
            ? new Date(date).toLocaleDateString("en-US", {
                month: "2-digit",
                day: "2-digit",
                year: "numeric",
              })
            : ""
        }
			</div>

			<div style="border-bottom: 1px solid #000; margin-top: 5px"></div>
			<div style="font-size: 12px; margin-top: 4px">Date</div>
		</div>

		<!-- ADMIN SIGNATURE (RIGHT) -->
		<div style="width: 40%; text-align: center">
			<div>
				${
          signature
            ? `<img src="${signature}" style="width:120px;height:auto;" />`
            : '<div style="height:60px"></div>'
        }
			</div>

			<div style="border-bottom: 1px solid #000; margin-top: 5px"></div>

			<div style="font-size: 12px; margin-top: 6px">
				Social Sanitation Commercial Cleaning Solutions<br/>
				Legal Representative Signature
			</div>
		</div>
	</div>

	<!-- ROW 2 -->
	<div style="display: flex; justify-content: space-between; align-items: flex-end">

		<!-- CLIENT DATE (LEFT) -->
		<div style="width: 40%; text-align: center">
			<div style="font-size: 16px; font-weight: bold">
				${formattedSignedDate || ""}
			</div>

			<div style="border-bottom: 1px solid #000; margin-top: 5px"></div>
			<div style="font-size: 12px; margin-top: 4px">Date</div>
		</div>

		<!-- CLIENT SIGNATURE (RIGHT) -->
		<div style="width: 40%; text-align: center">
			<div>
				<span style="font-size:1px;color:white">**SIGN_HERE**</span>
			</div>

			<div style="border-bottom: 1px solid #000; margin-top: 5px"></div>

			<div style="font-size: 12px; margin-top: 6px">
				Client's Legal Representative Signature
			</div>
		</div>
	</div>

</div>

    
    <div class="terms">
        <p>
            All service requests are in addition to the monthly or weekly price.
            Total price is due at the next invoice, for all services provided in
            this document. Ten business days after the signed date, this document
            and price becomes void, unless signed in contractual agreement. All
            services offered are appointment-based services. "Single Services" are
            scheduled with time and date for any given service. "Reoccurring Service
            Customers" must have a time and date specified in a service request for
            time specific services. Any holiday scheduling must be done thirty days
            prior to the scheduled service date. All charges are final. If any
            questions, changes, or adjustments are needed, contact our
            representative.
        </p>
    </div>

    <div class="footer">
        SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS &nbsp;&nbsp;&nbsp; |
        &nbsp;&nbsp;&nbsp; REF#: ${ref_no}
    </div>
</body>

</html>
`;

  const PUBLIC_DIR = path.resolve(__dirname, "../../../public");
  const pdfDir = path.join(PUBLIC_DIR, "uploads/docs");

  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }
  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      "/root/.cache/puppeteer/chrome/linux-136.0.7103.92/chrome-linux64/chrome",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");

  await page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map((img) => {
        if (img.complete) return;
        return new Promise((resolve) => {
          img.addEventListener("load", resolve);
          img.addEventListener("error", resolve);
        });
      }),
    );
  });

  console.log(pdfPath, "helloo");

  await page.pdf({
    path: pdfPath,
    width: "794px",
    height: "1123px",
    printBackground: true,
  });

  await browser.close();
};

module.exports = {
  generateQuotePDF,
  generatePDF,
  generateSpanishPDF,
  generateInvoicePDF,
  generateServiceRequestPDF,
};
