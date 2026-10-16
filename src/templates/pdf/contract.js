const { formatDisplayDate } = require("../../utils/time");

// The service contract the client signs through DocuSign
const contractHtml = (data) => {
  const {
    client_company_name,
    total_monthly_price,
    service_address,
    client_legal_name,
    client_representative,
    signature,
    contract_date,
    paymentUrl,
  } = data;

  return `
<!doctype html>
<html>
	<head>
		<meta charset="UTF-8" />
		<style>
			body {
				font-family: "Times New Roman", serif;
				margin: 0;
				padding: 0;
			}

			/* ===== FOOTER ===== */

			.footer {
				position: absolute;
				bottom: 15px;
				/* was 25px */
				left: 60px;
				right: 60px;
				font-size: 11px;
				border-top: 1px solid #ccc;
				padding-top: 6px;
			}

			.footer-left {
				text-align: center;
				width: 100%;
			}

			.footer-right {
				position: absolute;
				right: 0;
				top: 8px;
			}

			.page {
				width: 794px;
				height: 1123px;
				padding: 80px 120px;
				box-sizing: border-box;
			}

			.title {
				text-align: center;
				font-size: 26px;
				font-weight: bold;
				margin-bottom: 30px;
			}

			.paragraph {
				font-size: 13px;
				line-height: 1.6;
				text-align: center;
				margin-bottom: 35px;
				text-align: justify;
			}

			.row {
				display: flex;
				justify-content: space-between;
				margin-bottom: 20px;
				font-size: 13px;
			}

			.field {
				border-bottom: 1px solid #000;
				min-width: 150px;
				display: inline-block;
				text-align: center;
			}

			.long-field {
				border-bottom: 1px solid #000;
				display: inline-block;
				min-width: 350px;
				padding-left: 5px;
			}

			.section {
				margin-top: 30px;
			}

			.payment {
				display: flex;
				align-items: center;
				gap: 20px;
				margin-top: 15px;
			}

			.circle {
				border: 1px solid #000;
				border-radius: 50%;
				width: 16px;
				height: 16px;
				display: inline-block;
				text-align: center;
				line-height: 16px;
				font-size: 10px;
			}

			.address {
				margin-top: 20px;
				font-size: 13px;
			}

			.scope-page {
				padding: 40px 60px 60px 60px;
			}

			.scope-main-title {
				text-align: center;
				font-weight: bold;
				background: #f2f2f2;
				border: 2px solid #000;
				padding: 6px 0;
				font-size: 13px;
			}

			.scope-sub-header {
				background: #ffeb00;
				border-top: 2px solid #000;
				border-left: 2px solid #000;
				border-right: 2px solid #000;
				border-bottom: 2px solid #000;
				padding: 6px 8px;
				text-align: center;
				font-weight: bold;
				font-size: 11px;
			}

			.checkbox {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1.5px solid #000;
  margin-right: 8px;
  vertical-align: middle;
  position: relative;
}

			.scope-table {
				width: 100%;
				border-collapse: collapse;
			}

			.scope-table td {
				border: 1px solid #000;
				padding: 5px 7px;
				font-size: 11px;
			}

			.scope-section td {
				background: #eaeaea;
				font-weight: bold;
			}

			.scope-frequency {
				width: 70px;
				text-align: center;
				font-weight: bold;
				background: #f5f5f5;
			}

			.scope-check {
				background: #bfbfbf;
			}

			.scope-gap {
				height: 20px;
			}

			.page4 {
				padding: 20px 80px;
			}

			/* ===== UNIVERSAL PAGE LAYOUT ===== */

			.pdf-page {
				width: 794px;
				min-height: 1123px;
				/* ✅ use min-height instead */
				margin: 0 auto;
				padding: 40px 60px 60px 60px;
				/* slightly tighter */
				box-sizing: border-box;
				page-break-after: always;
				position: relative;
				background: #fff;
			}

			.pdf-page:last-child {
				page-break-after: auto;
			}

			@media print {
				.pdf-page {
					page-break-after: always;
				}

				.pdf-page:last-child {
					page-break-after: auto;
				}
			}
		</style>
	</head>

	<body>
		<!-- PAGE 1 -->
		<div class="pdf-page page">
			<div class="title">Contract Agreement</div>

			<div class="paragraph">
				This legally binding contract is agreed between two parties
				<strong>Social Sanitation Commercial Cleaning Solutions</strong> the
				service provider, and the client receiving services and accepted by the
				<strong>${client_company_name}</strong>. The Service provider has
				offered to complete all services outlined in the Scope of Work agreed
				upon and they will be done within the time-frame allotted. The service
				provider has full intent to keep the client's building secure while
				inside the service area, with doors closed and secured. After services
				rendered, any necessary alarms will be turned on and entry doors
				secured. Keeping your building and its contents safe. Fill out the
				client information below to complete this contract.
			</div>

			<div class="row">
				<div>
					Client's Start of Service Date:
					<span class="field">
  <span style="font-size:1px; color:transparent;">/start_date/</span>
</span>
				</div>
				<div>
  Service Days:
  <span class="field">
    <span style="font-size:1px; color:transparent;">/service_days/</span>
  </span>
</div>
			</div>

			<div class="row">
				<div>
					Total Base Monthly Price:
					<span class="field">$${total_monthly_price || ""}</span>
				</div>
			<div>
  Start Time:
  <span class="field">
    <span style="font-size:1px; color:transparent;">/start_time/</span>
  </span>
</div>
			</div>

			<div class="section">
				<strong>Service Address:</strong>
				<span class="long-field">${service_address || ""}</span>
			</div>

			<div class="section">
				<strong>Client's Legal Name:</strong>
				<span class="long-field">${client_legal_name || ""}</span>
			</div>

			<div class="section">
				<strong>Client's Legal Representative:</strong>
				<span class="long-field">${client_representative || ""}</span>
			</div>

<div class="section">
  <strong>Choice of payment:</strong>

  <div style="margin-top: 12px;">

    <div style="margin-bottom: 10px;">
      <span style="font-size:1px; color:transparent;">/payment_eft/</span>
      EFT
    </div>

    <div style="margin-bottom: 10px;">
      <span style="font-size:1px; color:transparent;">/payment_check/</span>
      Check
    </div>

    <div>
      <span style="font-size:1px; color:transparent;">/payment_card/</span>
      Card Payment
    </div>

  </div>
</div>

			<div class="address">
				If check, All payments are to be mail to:<br /><br />

				<strong>Social Sanitation Commercial Cleaning Solutions</strong><br />
				5201 N 44th St<br />
				Tampa, FL 33610
			</div>

			<div class="address">
				All Card Payments are made via Square Link:<br />
				<a href="${paymentUrl}" target="_blank">${paymentUrl}</a>
			</div>

			<div class="address">
				Card Payments made via Square are charged an additional 3% per
				transaction.
			</div>

			<div class="footer">
				<div class="footer-left">
					Social Sanitation Commercial Cleaning Solutions 2026
				</div>
				<div class="footer-right">Page 1</div>
			</div>
		</div>

		<!-- PAGE 2 -->
		<div class="pdf-page scope-page">
			<div style="text-align: center; font-size: 11px; margin-bottom: 10px">
				SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS
			</div>

			<div class="scope-main-title">Scope Of Work</div>

			<div class="scope-sub-header">GENERAL OFFICE AND COMMON AREAS</div>

			<!-- ================= TABLE 1 ================= -->
			<table class="scope-table">
				<tr class="scope-section">
					<td>Daily Services</td>
					<td class="scope-frequency">DAILY</td>
					<td class="scope-frequency">WEEKLY</td>
					<td class="scope-frequency">MONTHLY</td>
				</tr>

				<tr>
					<td>Wipe clean all exterior and interior glass doors.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Vacuum all mats, rugs, and carpet.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Mop hard floors for spots and spills.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Remove all trash from trash cans and replace trash liners.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Sweep or vacuum all hard floors, dust, and debris.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Weekly Services</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Dust window ledges, frames, and all horizontal surfaces.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Wipe all tables free of dust and debris.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Mop all hard floor areas wall-to-wall.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Clean mirrors and spot clean interior glass.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Disinfect door knobs, handles, and light switches.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Monthly Services</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust HVAC air vents and wall vents.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all edges and corners of the walls for cob-webs.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all blinds to remove discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Clean all baseboards for dust, spills, and discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>
			</table>

			<!-- GAP BETWEEN TABLES -->
			<div class="scope-gap"></div>

			<!-- SECTION HEADING -->
			<div class="scope-sub-header">BATHROOMS AND RESTROOM AREAS</div>

			<!-- ================= TABLE 2 ================= -->
			<table class="scope-table">
				<tr class="scope-section">
					<td>Daily Services</td>
					<td class="scope-frequency">DAILY</td>
					<td class="scope-frequency">WEEKLY</td>
					<td class="scope-frequency">MONTHLY</td>
				</tr>

				<tr>
					<td>Wipe mirrors to remove hand prints, drips, and smudges.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Wipe clean all urinals, toilets, sinks, and counters with EPA
						approved disinfectant.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Dust or wipe clean all dispensers.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Replenish paper products, hand soap, and disposable items from
						client inventory.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Remove all trash from trash cans and replace trash liners as needed.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Vacuum all mats, rugs, and carpet.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Mop all hard floor areas wall-to-wall.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Weekly Services</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Polish all bright work, fixtures, faucets, and stainless steel.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Wipe clean all door knobs, handles, and light switches with
						disinfectant.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Spot clean partition stall walls with EPA approved disinfectant.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Detail edges and corners of the floors.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Monthly Services</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>
						Dust all HVAC air vents, walls near vents, and light fixtures.
					</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all edges and corners of the walls for cobwebs.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Wipe tile walls to remove spots, spills, and discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>
			</table>

			<!-- FOOTER -->
			<div class="footer">
				<div class="footer-left">
					Social Sanitation Commercial Cleaning Solutions 2026
				</div>

				<div class="footer-right">Page 2</div>
			</div>
		</div>

		<!-- PAGE 3 -->
		<div class="pdf-page scope-page">
			<div style="text-align: center; font-size: 11px; margin-bottom: 10px">
				SOCIAL SANITATION COMMERCIAL CLEANING SOLUTIONS
			</div>

			<!-- ================= SECTION 1 ================= -->
			<div class="scope-sub-header">KITCHEN AND BREAK AREAS</div>

			<table class="scope-table">
				<tr class="scope-section">
					<td>Daily Services</td>
					<td class="scope-frequency">DAILY</td>
					<td class="scope-frequency">WEEKLY</td>
					<td class="scope-frequency">MONTHLY</td>
				</tr>

				<tr>
					<td>
						Wipe clean countertops, tables, and sinks with EPA Approved
						disinfectant.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Replenish all paper products, hand soap, and disposable items from
						client inventory.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Remove all trash from trash cans and replace trash can liners.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Vacuum all mats, rugs, and carpet.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Sweep or vacuum all hard floors for trash, dust, and debris.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>Mop all hard floor areas wall-to-wall.</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Wipe clean the surface outside and handles of refrigerator and
						microwave.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Weekly Services</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Polish all bright work, fixtures, faucets, and stainless steel.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>
						Wipe clean all door knobs, handles, and light switches with EPA
						Approved disinfectant.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Detail edges and corners of the floors.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Monthly Services</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust HVAC air vents and wall vents.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all edges and corners of the walls for cobwebs.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all blinds to remove discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Clean all baseboards for dust, spills, and discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>
			</table>

			<div class="scope-gap"></div>

			<!-- ================= SECTION 2 ================= -->
			<div class="scope-sub-header">ALL AREAS</div>

			<table class="scope-table">
				<tr class="scope-section">
					<td>Weekly Services</td>
					<td class="scope-frequency">DAILY</td>
					<td class="scope-frequency">WEEKLY</td>
					<td class="scope-frequency">MONTHLY</td>
				</tr>

				<tr>
					<td>
						Wipe clean all door knobs, handles, and light switches with EPA
						Approved disinfectant.
					</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr>
					<td>Detail edges and corners of the floors.</td>
					<td></td>
					<td class="scope-check"></td>
					<td></td>
				</tr>

				<tr class="scope-section">
					<td>Monthly Services</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>
						Dust window ledges, frames, and all other horizontal surfaces.
					</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust HVAC air vents and wall vents.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all edges and corners of the walls for cobwebs.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Dust all blinds to remove discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>

				<tr>
					<td>Clean all baseboards for dust, spills, and discoloration.</td>
					<td></td>
					<td></td>
					<td class="scope-check"></td>
				</tr>
			</table>

			<div class="scope-gap"></div>

			<!-- ================= HOT SPOTS ================= -->
			<table class="scope-table">
				<tr
					style="
						background: #e10600;
						color: white;
						font-weight: bold;
						text-align: center;
					"
				>
					<td colspan="4">HOT SPOTS & CUSTOMER REQUESTS</td>
				</tr>

				<tr>
					<td>
						Men's restroom must be mopped and cleaned to remove urine and the
						smell of urine.
					</td>
					<td class="scope-check"></td>
					<td></td>
					<td></td>
				</tr>
			</table>

			<!-- FOOTER -->
			<div class="footer">
				<div class="footer-left">
					Social Sanitation Commercial Cleaning Solutions 2026
				</div>
				<div class="footer-right">Page 3</div>
			</div>
		</div>

		<!-- PAGE 4 -->
		<div class="pdf-page page4">
			<div
				style="
					text-align: center;
					font-size: 24px;
					font-weight: bold;
					margin-bottom: 30px;
				"
			>
				Terms & Conditions
			</div>

			<div
				style="
					font-size: 12px;
					line-height: 1.6;
					text-align: justify;
				
					margin: 0 auto;
				"
			>
				<p>
					An account manager is assigned to your building to ensure any issues
					will be solved abruptly. Our services provide a night supervisor to
					maintain a consistent clean in your service area. We provide a peace
					of mind, your building is locked and secured before the end of every
					service day. Negligence will not be tolerated and will be handled
					swiftly with crew changes.
				</p>

				<p>
					We handle all customer belongings with care. Technology such as
					laptops, commuters, televisions, radios, hand held phones, etc., will
					not be sprayed or wiped for liability reasons. No papers, containers,
					or food products will be thrown away on top of desks, tables, or
					counter tops. All trash needs to be place in the trash can or boxed
					within inches of the trash can labeled "TRASH".
				</p>

				<p>
					Invoices are sent on the last day of each month, and are to be paid
					within 5 business days. Any late payments are subject to late fees of
					$30, every 5 business day period after the service month. If needed,
					the pay options above can change but it is necessary to change payment
					arrangements 5 business days before the end of the service month if
					check or ACH. Payments made via credit or debit card can be made at
					anytime. All late fees will be added to the invoice of the following
					service month, to fully satisfy the invoice for the previous service
					month.
				</p>

				<p>
					The term for this contract is 1 year. Due to annual rise in minimum
					wage, inflation, and costs per service; we hold the right to renew
					this contract and its terms after the 1 year period. Requests for
					changes will only be made upon customer approval. We ensure our
					cleaners are paid for their expertise and the client is receiving the
					best service for their investment. Our cleaners are screened and have
					background checks done before employment to ensure safety to your
					service area.
				</p>

				<p>
					Cancellation Policy: If you wish to terminate services with Social
					Sanitation Commercial Cleaning Solutions we require: 3 requests for
					crew changes, a detailed email with reasons for termination, and an
					email including Scope of Work violations. If request for termination
					has met all requirements, it is necessary to include a 30 day notice.
					These completed actions will terminate this contract in its entirety,
					unless client sends an email to continue services. In the event of
					early termination, 20 percent monthly cost of each month remaining
					will be charged to the final payment. Termination by means of extreme
					negligence or acts resulting in criminal charges, will waive the 20
					percent monthly cost for remaining months of contract term.
				</p>
			</div>

			<!-- SIGNATURE AREA -->
			<div
				style="
					margin-top: 40px;
					font-size: 12px;
			
					margin-left: auto;
					margin-right: auto;
				"
			>
				<div
					style="
						display: flex;
						justify-content: space-between;
						margin-bottom: 25px;
					"
				>
					<div>
						<strong>Client's Legal Name:</strong>
						<span
							style="
								border-bottom: 1px solid #000;
								display: inline-block;
								width: 220px;
							"
							>${client_legal_name || ""}</span
						>
					</div>

					<div>
						<strong>Date:</strong>
						<span
							style="
								border-bottom: 1px solid #000;
								display: inline-block;
								width: 120px;
							"
							>${formatDisplayDate(contract_date) || contract_date || ""}</span
						>
					</div>
				</div>

				<div style="margin-bottom: 25px">
					<strong>Client's Legal Representative Signature:</strong>
				<span style="
  display:inline-block;
  width:300px;
  border-bottom:1px solid #000;
  position:relative;
  height:20px;
">
  <span style="
    position:absolute;
    left:0;
    top:0;
    font-size:1px;
    color:transparent;
  ">
    **CLIENT_SIGN**
  </span>
</span>
				</div>

				<div>
  <strong>Social Sanitation Legal Representative Signature:</strong>

  <span
    style="
      display:inline-block;
      width:250px;
      height:40px;
      border-bottom:1px solid #000;
      position:relative;
      vertical-align:bottom;
    "
  >
    ${
      signature
        ? `
          <img
            src="${signature}"
            style="
              position:absolute;
              left:5px;
              bottom:2px;
              height:32px;
              width:auto;
            "
          />
        `
        : ""
    }
  </span>
</div>
			</div>

			<!-- FOOTER -->
			<div class="footer">
				<div class="footer-left">
					Social Sanitation Commercial Cleaning Solutions 2026
				</div>
				<div class="footer-right">Page 4</div>
			</div>
		</div>
	</body>
</html>
`;
};

module.exports = contractHtml;
