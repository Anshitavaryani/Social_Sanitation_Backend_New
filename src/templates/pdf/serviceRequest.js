const { formatAmount } = require("../../utils/money");
const { formatDisplayDate } = require("../../utils/time");
const { logoDataUri } = require("../../config/company");

// The service request the client signs
const serviceRequestHtml = (data) => {
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
  } = data;

  const formattedSignedDate = formatDisplayDate(date);
  const formattedDueDate = formatDisplayDate(due_date);

  const calculatedTotal = items.reduce((sum, item) => {
    const quantity = Number(item.quantity || 1);
    const unit_price = Number(item.unit_price || item.unitPrice || 0);

    return sum + quantity * unit_price;
  }, 0);

  return `
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
        <img class="logo" src="${logoDataUri()}"
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
            ? formatDisplayDate(date)
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
};

module.exports = serviceRequestHtml;
