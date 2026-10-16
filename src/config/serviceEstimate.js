/** @format */

const { launchPdfBrowser } = require("./puppeteer");
const { assetDataUri } = require("./storage");
const { COMPANY, logoDataUri } = require("./company");
const { formatDisplayDate } = require("../utils/time");

const renderScopeTables = (sections) => {
  if (!sections || !sections.length) {
    return `<div style="text-align:center; margin-top:20px;">No scope defined</div>`;
  }

  return sections
    .map((section) => {
      const sectionClass = section.is_red
        ? "scope-section-red"
        : "scope-section";

      const itemsHTML = (section.items || []).length
        ? section.items
            .map(
              (item) => `
        <tr>
          <td>${item.description || ""}</td>
          <td class="${item.is_daily ? "scope-check" : ""}"></td>
          <td class="${item.is_weekly ? "scope-check" : ""}"></td>
          <td class="${item.is_monthly ? "scope-check" : ""}"></td>
        </tr>
      `,
            )
            .join("")
        : `<tr><td colspan="4" style="text-align:center;">No items</td></tr>`;

      return `
      <table class="scope-table">
        <tr class="${sectionClass}">
          <td>${section.title}</td>
          <td class="scope-frequency">DAILY</td>
          <td class="scope-frequency">WEEKLY</td>
          <td class="scope-frequency">MONTHLY</td>
        </tr>

        ${itemsHTML}
      </table>

      <div class="scope-gap"></div>
    `;
    })
    .join("");
};

const generateEstimatePDF = async (data, pdfPath) => {
  const {
    client_company_name,
    client_name,
    address_line_1,
    address_line_2,
    city,
    state,
    zip,
    signature,

    signed_date,
    scopeSections = [],
    frequency = "Bi-Weekly",

    bdmName,
    bdmEmail,
    bdmPhone,
    extendedServices = [],
  } = data;

  const renderScopeTables = (sections) => {
    if (!sections || !sections.length) {
      return `<div style="text-align:center; margin-top:20px;">No scope defined</div>`;
    }

    return sections
      .map((section) => {
        const sectionClass = section.is_red
          ? "scope-section-red"
          : "scope-section";

        const itemsHTML = (section.items || []).length
          ? section.items
              .map(
                (item) => `
        <tr>
          <td>${item.description || ""}</td>
          <td class="${item.is_daily ? "scope-check" : ""}"></td>
          <td class="${item.is_weekly ? "scope-check" : ""}"></td>
          <td class="${item.is_monthly ? "scope-check" : ""}"></td>
        </tr>
      `,
              )
              .join("")
          : `<tr><td colspan="4" style="text-align:center;">No items</td></tr>`;

        return `
      <table class="scope-table">
        <tr class="${sectionClass}">
          <td>${section.title}</td>
          <td class="scope-frequency">DAILY</td>
          <td class="scope-frequency">WEEKLY</td>
          <td class="scope-frequency">MONTHLY</td>
        </tr>

        ${itemsHTML}
      </table>

      <div class="scope-gap"></div>
    `;
      })
      .join("");
  };

  const scopeHTML = renderScopeTables(scopeSections);

  const formattedSignedDate = signed_date
    ? formatDisplayDate(signed_date)
    : "";

  // fixed images in public/assets; they used to be downloaded from the live server for every PDF
  const hallwayImg = assetDataUri("estimate-hallway.png");
  const refrigeratorImg = assetDataUri("estimate-refrigerator.png");
  const acordImg = assetDataUri("acord-logo.png");

  const htmlContent = `
<!doctype html>
<html>

<head>
	<meta charset="UTF-8" />
	<title>Service Estimate</title>
	<style>
		/* ===== GLOBAL RESET ===== */

		body {
			margin: 0;
			padding: 0;
			font-family: "Times New Roman", serif;
			color: #000;
			-webkit-print-color-adjust: exact;
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

		/* ===== COVER PAGE ===== */

		.cover-page {
			text-align: center;
			padding-top: 90px;
		}

		.logo {
			width: 380px;
			margin-bottom: 50px;
		}

		.estimate-title {
			font-size: 44px;
			margin-top: 30px;
			margin-bottom: 90px;
			font-weight: 500;
		}

		.client-name {
			font-size: 38px;
			font-weight: bold;
			margin-bottom: 25px;
		}

		.address {
			font-size: 24px;
			margin: 6px 0;
		}

		/* ===== PAGE 2 (WELCOME) ===== */

		.welcome-title {
			text-align: center;
			font-size: 30px;
			font-weight: bold;
			margin-bottom: 15px;
		}

		.welcome-subtitle {
			text-align: center;
			font-size: 20px;
			margin-bottom: 45px;
		}

		.welcome-page .paragraph {
			font-size: 14px;
			line-height: 1.6;
		}

		.welcome-page .section-heading {
			margin-top: 20px;
			margin-bottom: 6px;
		}

		.section-heading {
			font-weight: bold;
			font-size: 18px;
			margin-top: 30px;
			margin-bottom: 10px;
		}

		.paragraph {
			font-size: 15px;
			line-height: 1.75;
			margin-bottom: 10px;
			text-align: justify;
		}

		.page-number {
			position: absolute;
			bottom: 35px;
			right: 75px;
			font-size: 11px;
		}

		/* ===== SIMPLE HEADER (OTHER PAGES) ===== */

		.simple-header {
			position: relative;
			margin-bottom: 30px;
		}

		.header-logo {
			position: absolute;
			left: 0;
			top: -10px;
			width: 110px;
		}

		.header-title {
			text-align: center;
			font-size: 26px;
			font-weight: bold;
			margin-top: 10px;
		}

		/* ===== TWO COLUMN LAYOUT ===== */

		.two-column {
			display: flex;
			gap: 25px;
			margin-top: 10px;
		}

		.column {
			width: 50%;
			display: flex;
			flex-direction: column;
		}

		/* ===== SECTION BLOCK TITLES ===== */

		/* Section title cleaner */
		.block-title {
			background-color: #2e3d59;
			color: #fff;
			padding: 6px 10px;
			font-size: 11px;
			font-weight: bold;
			margin-bottom: 10px;
			letter-spacing: 0.5px;
		}

		/* Body text optimized */
		.content-text {
			font-size: 11px;
			line-height: 1.45;
			margin-bottom: 8px;
			text-align: justify;
		}

		/* ===== PAGE 4 SCOPE WORK ===== */

		.scope-page {
			padding: 40px 60px 60px 60px;
		}

		.scope-main-title {
			text-align: center;
			font-weight: bold;
			background: #f2f2f2;
			border: 2px solid #000;
			/* border-bottom: none; */
			padding: 6px 0;
			font-size: 13px;
		}

		.scope-sub-header {
			background: #ffeb00;
			border-left: 2px solid #000;
			border-right: 2px solid #000;
			border-bottom: 2px solid #000;
			padding: 6px 8px;
			text-align: right;
			font-weight: bold;
			font-size: 11px;
		}

		.scope-table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 0;
		}

		.scope-table td {
			border: 1px solid #000;
			padding: 5px 7px;
			font-size: 11px;
		}

		.scope-section td {
			background: #5aa02c;
			font-weight: bold;
			text-align: center;
		}

		.scope-frequency {
			width: 75px;
			text-align: center;
			background: #e0e0e0;
			font-size: 10px;
			font-weight: bold;
		}

		.scope-check {
			background: #bfbfbf;
		}

		.scope-gap {
			height: 8px;
			/* this creates visual separation like your screenshot */
		}

		/* Red section header (only for Client Request / Hotspots) */
		.scope-section-red td {
			background: #e10600;
			color: #fff;
			font-weight: bold;
			text-align: center;
		}

		/* ===== SERVICES PAGE (PAGE 6) CLEAN SPACING ===== */

		.services-page {
			padding: 40px 60px 60px 60px;
		}

		.services-top {
			position: relative;
			margin-bottom: 70px;
			/* 👈 more space below heading block */
		}

		.services-logo {
			position: absolute;
			left: 0;
			top: 0;
			width: 110px;
		}

		.services-header {
			text-align: center;
			font-size: 28px;
			font-weight: bold;
			letter-spacing: 2px;
			border-bottom: 2px solid #000;
			display: inline-block;
			padding-bottom: 6px;
			margin-top: 10px;
			/* 👈 space above heading */
		}

		.services-content {
			margin-top: 40px;
			/* 👈 space between heading and content */
		}

		.services-section {
			margin-bottom: 32px;
			/* 👈 better spacing between sections */
		}

		.services-section-title {
			font-weight: bold;
			font-size: 15px;
			margin-bottom: 8px;
		}

		.services-text {
			font-size: 14px;
			line-height: 1.75;
			text-align: justify;
		}

		/* ===== PAGE 7 - MAINTENANCE PROGRAMS ===== */

		.maintenance-page {
			padding: 40px 60px 60px 60px;
		}

		.maintenance-top {
			position: relative;
			margin-bottom: 70px;
		}

		.maintenance-logo {
			position: absolute;
			left: 0;
			top: 0;
			width: 110px;
		}

		.maintenance-heading {
			text-align: center;
			font-size: 28px;
			font-weight: bold;
			letter-spacing: 2px;
			border-bottom: 2px solid #000;
			display: inline-block;
			padding-bottom: 6px;
			margin-top: 10px;
		}

		.maintenance-content {
			margin-top: 40px;
			display: flex;
			gap: 50px;
		}

		.maintenance-left {
			width: 40%;
		}

		.maintenance-left img {
			width: 100%;
			margin-bottom: 25px;
		}

		.image-caption {
			font-size: 12px;
			text-align: center;
			margin-top: -15px;
			margin-bottom: 20px;
			font-weight: bold;
		}

		.maintenance-right {
			width: 60%;
			font-size: 14px;
			line-height: 1.75;
			text-align: justify;
		}

		.maintenance-right h3 {
			font-size: 15px;
			margin-bottom: 10px;
		}

		.maintenance-right ul {
			padding-left: 18px;
		}

		.maintenance-right li {
			margin-bottom: 14px;
		}

		/* ==================== PAGE 10 ACORD - FINAL FIT VERSION ==================== */

		.acord-page {
			height: 1123px !important;
			min-height: 1123px !important;
			overflow: hidden !important;
			padding: 18px 32px 25px 32px !important;
			font-size: 9px;
			line-height: 1.18;
			box-sizing: border-box;
		}

		.acord-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			margin-bottom: 6px;
			padding-bottom: 4px;
			border-bottom: 1px solid #000;
		}

		.acord-left {
			width: 25%;
		}

		.acord-left img {
			width: 95px !important;
		}

		.acord-center {
			width: 50%;
			text-align: center;
			font-weight: bold;
			font-size: 14px;
			letter-spacing: 0.5px;
		}

		.acord-right {
			width: 25%;
			text-align: right;
			font-size: 9px;
			border: 1px solid #000;
			padding: 4px 6px;
			line-height: 1.2;
		}

		.acord-note,
		.acord-important-note {
			border: 1px solid #000;
			padding: 4px 6px;
			margin-bottom: 5px;
			font-size: 8.7px;
			line-height: 1.25;
		}

		.acord-table td {
			border: 1px solid #000;
			padding: 2.5px 4px;
			font-size: 9px;
		}

		.acord-label {
			background: #f5f5f5;
			font-weight: bold;
			padding: 3px 5px;
			font-size: 9px;
		}

		/* Coverage Top */
		.coverage-top td {
			border: 1px solid #000;
			padding: 3px 5px;
			font-size: 9.2px;
		}

		/* Main Table - Tightest part */
		.coverage-table {
			font-size: 7.6px !important;
			margin: 6px 0;
		}

		.coverage-table th,
		.coverage-table td {
			border: 1px solid #000;
			padding: 2px 3px !important;
			font-size: 7.6px !important;
			line-height: 1.15;
		}

		.inner-type-table td {
			padding: 1px 3px;
			font-size: 8px;
		}

		.limits-cell td {
			font-size: 7.6px;
			padding: 1px 3px;
		}

		/* Bottom Section */
		.acord-bottom-main {
			margin-top: 5px;
		}

		.acord-bottom-main td {
			border: 1px solid #000;
			padding: 3px 5px;
			font-size: 9px;
		}

		.desc-title {
			background: #f5f5f5;
			font-weight: bold;
			padding: 4px 6px;
		}

		.desc-body {
			padding: 4px 6px;
			font-size: 9px;
		}

		.holder-content,
		.cancel-text {
			padding: 4px 6px;
			font-size: 9px;
		}

		.signature {
			font-size: 16px;
		}

		.acord-footer {
			margin-top: 6px;
			font-size: 8px;
		}

		.holder-col {
			width: 55%;
		}

		.cancel-col {
			width: 45%;
		}

		.holder-content {
			padding: 8px 8px;
			/* more breathing room */
			min-height: 90px;
			/* ensures space */
		}

		.cancel-text {
			padding: 6px 6px;
		}

		.acord-footer {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-top: 6px;
			font-size: 8px;
		}

		.acord-footer-left {
			width: 30%;
			text-align: left;
		}

		.acord-footer-center {
			width: 40%;
			text-align: center;
		}

		.acord-footer-right {
			width: 30%;
			text-align: right;
		}


		/* ===== TABLE STYLING ===== */

		table {
			width: 100%;
			border-collapse: collapse;
			font-size: 15px;
		}

		th,
		td {
			border: 1px solid #000;
			padding: 8px;
			vertical-align: top;
		}

		th {
			background-color: #f2f2f2;
			font-weight: bold;
			text-align: left;
		}

		/* ===== PRINT STABILITY ===== */

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
	<div class="pdf-page cover-page">
		<!-- LOGO -->
		<img class="logo"
			src="${logoDataUri()}"
			alt="Social Sanitation Logo" />

		<!-- TITLE -->
		<div class="estimate-title">Service Estimate</div>

		<!-- CLIENT NAME -->
		<div class="client-name">${client_company_name}</div>

		<!-- ADDRESS -->
		<div class="address">
			${address_line_1 || ""} ${
        address_line_2 ? `<br />${address_line_2}` : ""
      } <br />${city || ""}${city ? "," : ""} ${state || ""} ${zip || ""}
		</div>
	</div>

	<!-- PAGE 2 -->
	<div class="pdf-page welcome-page">
		<div class="welcome-title">Welcome</div>

		<div class="welcome-subtitle">
			Social Sanitation Commercial Cleaning Solutions
		</div>

		<div class="paragraph">
			Welcome to <strong>Social Sanitation</strong>, where we make a clean
			space is a safe place. We opened during COVID season, to help efforts to
			end <strong>COVID-19</strong>
			infections in the Tampa Bay area. During the pandemic, we've helped over
			<strong>+200 companies</strong> keep their employees safe and keep their
			business open. Currently, we perform all cleaning services with
			chemicals that continue to defend against the virus and other similar
			bacteria.
		</div>

		<div class="section-heading">Bacteria cleaners in use:</div>
		<div class="paragraph">
			Bathrooms - BETCO AF315 Disinfectant Cleaner<br />
			Kitchen Area - BETCO GE Fight Bac RTU Disinfectant
		</div>

		<div class="section-heading">Equipment:</div>
		<div class="paragraph">
			Our vacuums are very proficient equipment. We use U-80 Koblenz Upright
			Vacuum Cleaners w/ HEPA F&G bags.
		</div>

		<div class="paragraph">
			We use green and blue microfiber rags for the kitchen area, yellow and
			orange are specifically for restrooms.
		</div>

		<div class="paragraph">
			Our cleaners change gloves after each task, i.e: trash removal, bathroom
			cleaning, kitchen cleaning. The different changes of gloves for each
			area.
		</div>

		<div class="section-heading">Service Cleaners:</div>
		<div class="paragraph">
			Our cleaners are screened and background checked before employment. The
			cleaner will be the same person cleaning each day. Our cleaners are well
			experienced as they clean commercial buildings and residential cleans.
			If we ever need to switch cleaners out for any reason, we will notify
			you.
		</div>

		<div class="section-heading">Other Service Locations in your area:</div>
		<div class="paragraph">
			<strong>Momentum Solar</strong> 5711 Johns Rd Suite 1305, Tampa, FL
			33634<br />
			<strong>Rexel USA Electric Supply</strong> 4010 W Osborne Ave Tampa
			33614<br />
			<strong>Cove Community Housing Center</strong> 3630 N 50 ST Tampa
			33619<br />
			<strong>Seminole Heights Charter High School</strong> 4006 N Florida
			Ave, Tampa, FL 33604<br />
			<strong>Brightside Applied Behavior Analysis</strong> 2906 S Falkenburg
			Rd, Riverview, FL 33578<br />
			<strong>MD Now Urgent Care</strong> 408 E Brandon Blvd, Brandon, FL
			33511
		</div>

		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 2</div>
		</div>
	</div>

	<!-- PAGE 3 -->
	<div class="pdf-page">
		<!-- SIMPLE HEADER -->
		<div class="simple-header">
			<img src="${logoDataUri()}"
				class="header-logo" />
			<div class="header-title">Capability Statement</div>
		</div>

		<!-- TWO COLUMN SECTION -->
		<div class="two-column">
			<!-- LEFT COLUMN -->
			<div class="column">
				<div class="block-title">COMPANY SNAPSHOT</div>
				<div class="content-text">
					<strong>Legal Business Name:</strong> SOCIAL SANITATION COMMERCIAL
					CLEANING SOLUTIONS LLC<br />
					<strong>UEI:</strong> DXMEZLDCENG6<br />
					<strong>CAGE Code:</strong> 173M3<br />
					<strong>Physical Address:</strong> 5201 N.44th St Tampa FL 33610<br />
					<strong>Website:</strong> ${COMPANY.WEBSITE}
				</div>

				<div class="content-text">
					<strong>POINT OF CONTACT:</strong><br />
					${bdmName}<br />
					<strong>Phone Number:</strong> ${bdmPhone}<br />
					<strong>Email:</strong> ${bdmEmail}
				</div>

				<div class="block-title">WHY CHOOSE US?</div>
				<div class="content-text">
					<strong>Customer-Focused Service Delivery:</strong> Customized
					cleaning plans aligned with agency requirements and performance
					standards.
				</div>

				<div class="content-text">
					<strong>Quality & Compliance Driven:</strong> Consistent service
					delivery supported by inspections, quality control, and adherence to
					federal, OSHA, and sanitation standards.
				</div>

				<div class="content-text">
					<strong>Environmentally Responsible Practices:</strong> Use of
					EPA-approved, eco-conscious products and sustainable cleaning
					methods.
				</div>

				<div class="block-title">NAICS CODES</div>
				<div class="content-text">
					<strong>561720:</strong>Janitorial Services<br />
					<strong>561740:</strong>Carpet and Upholstery Cleaning Services<br />
					<strong>561790:</strong> Other Services to Buildings and
					Dwellings<br />
					<strong>238990:</strong>All Other Specialty Trade Contractors
					(Specialized Cleaning Projects)<br />
					<strong>811490:</strong> Other Personal and Household Goods Repair
					and Maintenance (Floor or Equipment Maintenance)
				</div>
			</div>

			<!-- RIGHT COLUMN -->
			<div class="column">
				<div class="block-title">ABOUT US</div>
				<div class="content-text">
					We are a Veteran-Owned small business providing reliable, compliant,
					and result-based commercial cleaning and facility services to
					federal, state, and local government agencies, delivering
					mission-critical janitorial and sanitation services designed to
					maintain safe, healthy, and well-managed environments. We combine
					experienced personnel, quality-control processes, and
					environmentally responsible practices to ensure consistent
					performance, regulatory compliance, and responsive service delivery.
					With a strong local presence in Tampa, Florida, we provide
					dependable support backed by federal-focused operational standards
					and accountability.
				</div>

				<div class="block-title">CORE CAPABILITIES</div>
				<div class="content-text">
					<strong>Comprehensive Facility & Janitorial Services</strong><br />
					• Routine and specialized cleaning for federal office buildings,
					medical facilities, educational institutions, industrial spaces, and
					public-use facilities. <br />
					•Services include day porter services, janitorial cleaning, floor
					care, carpet and upholstery cleaning, window cleaning, and restroom
					sanitation
				</div>

				<div class="content-text">
					<strong>Sanitation, Health & Environmental Compliance</strong><br />
					•Enhanced disinfection protocols supporting workplace health,
					safety, and infection control requirements <br />
					•Use of EPA-approved cleaning products, environmentally responsible
					methods, and compliant equipment<br />
					•Adherence to federal, state, and local health and sanitation
					standards
				</div>

				<div class="content-text">
					<strong>Customized & Scalable Cleaning Programs</strong><br />
					•Tailored service plans aligned with agency mission needs, facility
					size, and security requirements<br />

					•Flexible scheduling to support daily, weekly, monthly, and on-
					demand services, including after-hours operations
				</div>

				<div class="content-text">
					<strong>Trained, Cleared & Safety-Compliant Workforce</strong><br />
					•Experienced cleaning professionals trained in federal facility
					standards and quality control procedures •Ongoing staff training
					with strict adherence to OSHA regulations and workplace safety
					protocols Quality-Control & Performance Monitoring<br />
					•Use of modern cleaning equipment to improve efficiency and
					consistency<br />
					•Quality assurance and performance tracking systems to ensure
					contract compliance and service accountability
				</div>

				<div class="content-text">
					<strong>Quality-Control & Performance Monitoring</strong><br />
					•Use of modern cleaning equipment to improve efficiency and
					consistency <br />
					•Quality assurance and performance tracking systems to ensure
					contract compliance and service accountability
				</div>
			</div>
		</div>

		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 3</div>
		</div>
	</div>

	<!-- PAGE 4 & 5 -->
	<div class="pdf-page scope-page">
		<div class="scope-main-title">
  ${client_name ? `${client_name}'s Scope of Work` : "Scope of Work"}
</div>

		<div class="scope-sub-header">${frequency} Services</div>

		${scopeHTML}

		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 4</div>
		</div>
	</div>


	<!-- PAGE 6 -->
	<div class="pdf-page services-page">
		<!-- TOP AREA -->
		<div class="services-top">
			<!-- LOGO TOP LEFT -->
			<img src="${logoDataUri()}"
				class="services-logo" />

			<!-- CENTER HEADING -->
			<div style="text-align: center">
				<div class="services-header">SERVICES</div>
			</div>
		</div>

		<!-- FULL WIDTH CONTENT -->
		<div class="services-content">
			<div class="services-section">
				<div class="services-section-title">Communication Log Book</div>
				<div class="services-text">
					A communication log book will be placed at every account location.
					This book will be checked daily by the janitorial staff to see if
					the customer has any concerns.
					<br /><br />
					The janitorial staff will also use the communication log book to
					note any discrepancies in the building, such as maintenance problems
					of which the customer needs to be made aware.
				</div>
			</div>

			<div class="services-section">
				<div class="services-section-title">Electronic Communication</div>
				<div class="services-text">
					In addition to cell phones, and home phones, we have created web
					access for any and all of your employees/tenants to communicate with
					us via e-mail.
				</div>
			</div>

			<div class="services-section">
				<div class="services-section-title">General</div>
				<div class="services-text">
					Care will be taken to conserve water and go beyond that which is
					required for the performance of our duties. Every effort will be
					made to observe and report any unusual occurrences during our time
					in the building.
				</div>
			</div>

			<div class="services-section">
				<div class="services-section-title">Holidays</div>
				<div class="services-text">
					Any problem that may arise during our schedule will be reported. A
					notice will be sent to the point of contact via email or call.
					<br /><br />
					Unless a request is made for service at an additional charge, the
					following holidays will be observed and no services shall be
					provided: New Year’s, Memorial Day, Independence Day, Labor Day,
					Thanksgiving Day and Christmas Day.
				</div>
			</div>
		</div>

		<!-- FOOTER -->
		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 6</div>
		</div>
	</div>

	<!-- PAGE 7 -->
	<div class="pdf-page maintenance-page">
		<div class="maintenance-top">
			<img src="${logoDataUri()}"
				class="maintenance-logo" />
			<div style="text-align: center">
				<div class="maintenance-heading">SERVICES</div>
			</div>
		</div>

		<div class="maintenance-content">
			<!-- LEFT SIDE IMAGES -->
			<div class="maintenance-left">
				<h3>Maintenance Programs</h3>

				<img src="${hallwayImg}" />

				<div class="image-caption">Refrigerator Deep Clean</div>

				<img src="${refrigeratorImg}" />
			</div>

			<!-- RIGHT SIDE TEXT -->
			<div class="maintenance-right">
				<h3>Services to perform every <strong>3 months</strong></h3>

				<ul>
					<li>
						We offer <strong>Carpet Cleaning and Spot Removal.</strong>
						These services are to maintain your carpets, mats, and rugs.
					</li>

					<li>
						For Tile floors we offer a <strong>Machine floor scrub</strong>,
						to maintain your LVT & VCT flooring.
						<strong>Acid wash scrub</strong>
						for hard stains on tile floors, or remove urine smells in
						bathrooms.
					</li>

					<li>
						<strong>Deep Clean</strong> requested every 3 months. These tasks
						provide a more detailed clean, where we complete the scope of work
						in one service day, clean all 4 walls, all furniture, and complete
						any special cleaning requests.
					</li>
				</ul>

				<br />

				<h3>Services to be performed <strong>Per month:</strong></h3>

				<p>
					We ask for all unwanted items to stay in the refrigerator & freezer.
					All items within, while performing this service, will be thrown
					away. All walls, trays, shelves, and corners will be free of debris.
				</p>
			</div>
		</div>

		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 7</div>
		</div>
	</div>

	<!-- PAGE 8 -->
	<div class="pdf-page maintenance-page">
		<!-- HEADER (same layout as page 6 & 7) -->
		<div class="maintenance-top">
			<img src="${logoDataUri()}"
				class="maintenance-logo" />
			<div style="text-align: center">
				<div class="maintenance-heading">Extended Services</div>
				<div style="margin-top: 10px; font-size: 14px">
					Specific Pricing for Individually Purchased Services
				</div>
			</div>
		</div>

		<!-- CONTENT -->
		<div style="margin-top: 60px; display: flex; justify-content: center">
			<table style="width: 75%; border-collapse: collapse; font-size: 14px">
				<tr>
					<th style="border: 1px solid #000; padding: 8px">Service</th>
					<th style="border: 1px solid #000; padding: 8px">
						Recommended Request
					</th>
					<th style="border: 1px solid #000; padding: 8px">Starting At:</th>
					<th style="border: 1px solid #000; padding: 8px">Minimum Charge</th>
				</tr>
				${extendedServices
          .map(
            (s) => `
				<tr>
					<td>${s.name}</td>
					<td>${s.frequency}</td>
					<td>${s.startingAt}</td>
					<td>${s.minimumCharge}</td>
				</tr>
				`,
          )
          .join("")}
			</table>
		</div>

		<!-- BOTTOM TEXT -->
		<div style="
					margin-top: 60px;
					font-size: 13px;
					line-height: 1.7;
					width: 80%;
					margin-left: auto;
					margin-right: auto;
					text-align: justify;
				">
			If you have requests monthly or weekly services to add to your Cleaning
			Service Package, please inform the representative to add to this
			estimate. Services added after the signed contract agreement is
			complete, will be added to monthly bill with a service request.
			<br /><br />
			If you have any questions, please call or email the representative from
			whom you received the document. Prices above are general estimate
			prices, total price is negotiable.
		</div>

		<!-- FOOTER -->
		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 8</div>
		</div>
	</div>

	<!-- PAGE 9 -->
	<div class="pdf-page maintenance-page">
		<!-- HEADER AREA -->
		<div style="display: flex; align-items: stretch; margin-bottom: 40px">
			<!-- LEFT LOGO -->
			<div style="width: 35%; display: flex; align-items: center">
				<img src="${logoDataUri()}"
					style="width: 140px" />
			</div>

			<!-- RIGHT DARK TITLE BAR -->
			<div style="
						width: 65%;
						background: #5a646e;
						display: flex;
						align-items: center;
						justify-content: center;
					">
				<div style="
							color: #fff;
							font-size: 22px;
							font-weight: bold;
							letter-spacing: 1px;
						">
					STOCK INVENTORY SHEET
				</div>
			</div>
		</div>

		<!-- TABLE -->
		<table style="width: 100%; border-collapse: collapse; font-size: 13px">
			<tr style="border-bottom: 2px solid #000">
				<th style="text-align: left; padding: 8px">DESCRIPTION</th>
				<th style="text-align: left; padding: 8px">SKU #</th>
				<th style="text-align: center; padding: 8px">QUANTITY (#)</th>
				<th style="text-align: right; padding: 8px">UNIT PRICE ($)</th>
			</tr>

			<tr>
				<td>Jr Jumbo Toilet Paper Rolls</td>
				<td>PULL-1001920</td>
				<td style="text-align: center">12</td>
				<td style="text-align: right">32.95</td>
			</tr>
			<tr>
				<td>2-Ply Double Layer Toilet Tissue</td>
				<td>SOD41010</td>
				<td style="text-align: center">96</td>
				<td style="text-align: right">65.95</td>
			</tr>
			<tr>
				<td>Multi-Fold Paper Towels</td>
				<td>RES-800A MOR</td>
				<td style="text-align: center">4000</td>
				<td style="text-align: right">53.95</td>
			</tr>
			<tr>
				<td>White Hardwound Towel Rolls</td>
				<td>W6800</td>
				<td style="text-align: center">12</td>
				<td style="text-align: right">25.95</td>
			</tr>
			<tr>
				<td>Hardwound Towel Dispenser</td>
				<td>SCA-772B28</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">32.95</td>
			</tr>
			<tr>
				<td>Twin Jumbo Toilet Paper Dispenser Hy</td>
				<td>PULL-1410304</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">32.95</td>
			</tr>
			<tr>
				<td>Tech Black Multi-fold Dispenser Flex</td>
				<td>PULL-1410892</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">27.95</td>
			</tr>
			<tr>
				<td>Four Units Chemical Dispenser Storm</td>
				<td>MULTI-421440</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">23.95</td>
			</tr>
			<tr>
				<td>Neutral Floor Cleaner</td>
				<td>ESS-1043GR4</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">26.95</td>
			</tr>
			<tr>
				<td>Husky Trio Fresh Disinfectant Lavender</td>
				<td>HUSKY-800L-05</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">9.95</td>
			</tr>
			<tr>
				<td>Soap Dispenser</td>
				<td>PULL-1410632</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">44.95</td>
			</tr>
			<tr>
				<td>Case Hand Soap</td>
				<td>SCL-15012876</td>
				<td style="text-align: center">6</td>
				<td style="text-align: right">32.95</td>
			</tr>
			<tr>
				<td>Urinal Screen</td>
				<td>URS-5012691</td>
				<td style="text-align: center">10</td>
				<td style="text-align: right">9.95</td>
			</tr>
			<tr>
				<td>Air Freshener Chem Easy</td>
				<td>CHEM-5014684</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">18.95</td>
			</tr>
			<tr>
				<td>Soft Soap Gallon</td>
				<td>SOFT-5012856</td>
				<td style="text-align: center">1</td>
				<td style="text-align: right">—</td>
			</tr>
		</table>

		<!-- FOOTNOTE -->
		<div style="margin-top: 40px; font-size: 12px">
			The above pricing does not include applicable sales tax.
		</div>

		<!-- FOOTER -->
		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 9</div>
		</div>
	</div>

	<!-- PAGE 10 -->
	<div class="pdf-page acord-page">
		<!-- HEADER -->
		<div class="acord-header">
			<div class="acord-left">
				<img src="${acordImg}" class="acord-logo" />
			</div>
			<div class="acord-center">CERTIFICATE OF LIABILITY INSURANCE</div>
			<div class="acord-right">
				DATE (MM/DD/YYYY)<br />
				08/09/2025
			</div>
		</div>

		<!-- DESCRIPTION -->
		<div class="acord-note">
			THIS CERTIFICATE IS ISSUED AS A MATTER OF INFORMATION ONLY AND CONFERS
			NO RIGHTS UPON THE CERTIFICATE HOLDER. THIS CERTIFICATE DOES NOT
			AFFIRMATIVELY OR NEGATIVELY AMEND, EXTEND OR ALTER THE COVERAGE AFFORDED
			BY THE POLICIES BELOW. THIS CERTIFICATE OF INSURANCE DOES NOT CONSTITUTE
			A CONTRACT BETWEEN THE ISSUING INSURER(S), AUTHORIZED REPRESENTATIVE OR
			PRODUCER, AND THE CERTIFICATE HOLDER.
		</div>

		<!-- DESCRIPTION -->
		<div class="acord-important-note">
			IMPORTANT: If the certificate holder is an ADDITIONAL INSURED, the
			policy(ies) must be endorsed. If SUBROGATIONIS WAIVED, subject to the
			terms and conditions of the policy, certain policies may require an
			endorsement. A statement on this certificate does not confer rights to
			the certificate holder in lieu of such endorsement(s).
		</div>

		<!-- PRODUCER + CONTACT -->
		<table class="acord-table acord-contact-table">
			<tr>
				<td class="acord-producer">
					<div class="acord-label">PRODUCER</div>

					NUTMEG INS AGENCY INC/PHS<br />
					76210797<br />
					The Hartford Business Service Center<br />
					3600 Wiseman Blvd<br />
					San Antonio, TX 78251
				</td>

				<td class="acord-contact">
					<table class="acord-inner-table">
						<tr>
							<td class="small-label">CONTACT NAME:</td>
						</tr>

						<tr>
							<td class="small-label">PHONE<br />(A/C, No, Ext):</td>
							<td class="small-label">FAX<br />(A/C, No):</td>
						</tr>

						<tr>
							<td class="small-label">E-MAIL ADDRESS:</td>
						</tr>
					</table>
				</td>
			</tr>

			<tr>
				<td class="acord-insured">
					<div class="acord-label">INSURED</div>

					Social Sanitation Commercial Cleaning Solutions, LLC<br />
					5201 N 44TH ST<br />
					TAMPA FL 33610-5269
				</td>

				<td class="acord-insurers">
					<table class="acord-insurer-table">
						<tr class="insurer-header">
							<td>INSURER(S) AFFORDING COVERAGE</td>
							<td class="naic">NAIC#</td>
						</tr>

						<tr>
							<td>
								INSURER A : Property and Casualty Insurance Company of
								Hartford
							</td>
							<td class="naic">34690</td>
						</tr>

						<tr>
							<td>INSURER B :</td>
							<td></td>
						</tr>

						<tr>
							<td>INSURER C :</td>
							<td></td>
						</tr>

						<tr>
							<td>INSURER D :</td>
							<td></td>
						</tr>

						<tr>
							<td>INSURER E :</td>
							<td></td>
						</tr>

						<tr>
							<td>INSURER F :</td>
							<td></td>
						</tr>
					</table>
				</td>
			</tr>
		</table>

		<!-- COVERAGE HEADER -->
		<table class="coverage-top">
			<tr>
				<td class="coverage-left">
					<strong>COVERAGES</strong>
				</td>

				<td class="coverage-middle">
					<strong>CERTIFICATE NUMBER:</strong>
					<span></span>
				</td>

				<td class="coverage-right">
					<strong>REVISION NUMBER:</strong>
					<span></span>
				</td>
			</tr>
		</table>

		<div class="coverage-description">
			THIS IS TO CERTIFY THAT THE POLICIES OF INSURANCE LISTED BELOW HAVE BEEN
			ISSUED TO THE INSURED NAMED ABOVE FOR THE POLICY PERIOD INDICATED.
			NOTWITHSTANDING ANY REQUIREMENT, TERM OR CONDITION OF ANY CONTRACT OR
			OTHER DOCUMENT WITH RESPECT TO WHICH THIS CERTIFICATE MAY BE ISSUED OR
			MAY PERTAIN, THE INSURANCE AFFORDED BY THE POLICIES DESCRIBED HEREIN IS
			SUBJECT TO ALL THE TERMS, EXCLUSIONS AND CONDITIONS OF SUCH POLICIES.
			LIMITS SHOWN MAY HAVE BEEN REDUCED BY PAID CLAIMS.
		</div>

		<table class="coverage-table">
			<tr class="coverage-header">
				<th class="insr">INSR<br />LTR</th>
				<th class="type">TYPE OF INSURANCE</th>
				<th class="addl">ADDL<br />INSR</th>
				<th class="subr">SUBR<br />WVD</th>
				<th class="policy">POLICY NUMBER</th>
				<th class="eff">POLICY EFF<br />(MM/DD/YYYY)</th>
				<th class="exp">POLICY EXP<br />(MM/DD/YYYY)</th>
				<th class="limits">LIMITS</th>
			</tr>

			<!-- rows will come here -->
			<!-- COMMERCIAL GENERAL LIABILITY -->

			<tr>
				<td class="insr-cell">A</td>

				<td class="type-cell">
					<table class="inner-type-table">
						<tr>
							<td colspan="4">
								<strong>COMMERCIAL GENERAL LIABILITY</strong>
							</td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>CLAIMS-MADE</td>
							<td class="checkbox">☑</td>
							<td>OCCUR</td>
						</tr>

						<tr>
							<td class="checkbox">☑</td>
							<td colspan="3">General Liability</td>
						</tr>

						<tr>
							<td colspan="4">GEN'L AGGREGATE LIMIT APPLIES PER:</td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>POLICY</td>
							<td class="checkbox">☑</td>
							<td>PROJECT</td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>LOC</td>
							<td colspan="2">OTHER:</td>
						</tr>
					</table>
				</td>

				<td></td>
				<td></td>

				<td>76 SBU BT7NMF</td>
				<td>06/19/2025</td>
				<td>06/19/2026</td>

				<td class="limits-cell">
					<table class="limits-table">
						<tr>
							<td>EACH OCCURRENCE</td>
							<td class="amount">$2,000,000</td>
						</tr>

						<tr>
							<td>DAMAGE TO RENTED PREMISES (Ea occurrence)</td>
							<td class="amount">$1,000,000</td>
						</tr>

						<tr>
							<td>MED EXP (Any one person)</td>
							<td class="amount">$10,000</td>
						</tr>

						<tr>
							<td>PERSONAL & ADV INJURY</td>
							<td class="amount">$2,000,000</td>
						</tr>

						<tr>
							<td>GENERAL AGGREGATE</td>
							<td class="amount">$4,000,000</td>
						</tr>

						<tr>
							<td>PRODUCTS - COMP/OP AGG</td>
							<td class="amount">$4,000,000</td>
						</tr>
					</table>
				</td>
			</tr>

			<!-- AUTOMOBILE LIABILITY -->

			<tr>
				<td></td>

				<td class="type-cell">
					<table class="inner-type-table">
						<tr>
							<td colspan="2"><strong>AUTOMOBILE LIABILITY</strong></td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>ANY AUTO</td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>ALL OWNED AUTOS</td>
							<td class="checkbox">☐</td>
							<td>SCHEDULED AUTOS</td>
						</tr>

						<tr>
							<td class="checkbox">☐</td>
							<td>HIRED AUTOS</td>
							<td class="checkbox">☐</td>
							<td>NON-OWNED AUTOS</td>
						</tr>
					</table>
				</td>

				<td></td>
				<td></td>
				<td></td>
				<td></td>
				<td></td>

				<td>
					<table class="limits-table">
						<tr>
							<td>COMBINED SINGLE LIMIT (Ea accident)</td>
							<td></td>
						</tr>

						<tr>
							<td>BODILY INJURY (Per person)</td>
							<td></td>
						</tr>

						<tr>
							<td>BODILY INJURY (Per accident)</td>
							<td></td>
						</tr>

						<tr>
							<td>PROPERTY DAMAGE (Per accident)</td>
							<td></td>
						</tr>
					</table>
				</td>
			</tr>

			<!-- UMBRELLA LIABILITY -->

			<tr>
				<td class="insr-cell">A</td>

				<td class="type-cell">
					<table class="inner-type-table">
						<tr>
							<td class="checkbox">☑</td>
							<td><strong>UMBRELLA LIAB</strong></td>

							<td class="checkbox">☑</td>
							<td>OCCUR</td>
						</tr>

						<tr>
							<td></td>
							<td><strong>EXCESS LIAB</strong></td>

							<td class="checkbox">☐</td>
							<td>CLAIMS-MADE</td>
						</tr>

						<tr>
							<td colspan="4">DED &nbsp;&nbsp; RETENTION $ 10,000</td>
						</tr>
					</table>
				</td>

				<td></td>
				<td></td>

				<td>76 SBU BT7NMF</td>

				<td>06/19/2025</td>

				<td>06/19/2026</td>

				<td>
					<table class="limits-table">
						<tr>
							<td>EACH OCCURRENCE</td>
							<td class="amount">$3,000,000</td>
						</tr>

						<tr>
							<td>AGGREGATE</td>
							<td class="amount">$3,000,000</td>
						</tr>
					</table>
				</td>
			</tr>

			<!-- WORKERS COMP -->

			<tr>
				<td></td>

				<td class="type-cell">
					<table class="inner-type-table">
						<tr>
							<td colspan="4">
								<strong>WORKERS COMPENSATION AND EMPLOYERS' LIABILITY</strong>
							</td>
						</tr>

						<tr>
							<td colspan="4">
								ANY PROPRIETOR/PARTNER/EXECUTIVE OFFICER/MEMBER EXCLUDED?
							</td>
						</tr>

						<tr>
							<td colspan="4">(Mandatory in NH)</td>
						</tr>

						<tr>
							<td colspan="4">
								If yes, describe under DESCRIPTION OF OPERATIONS below
							</td>
						</tr>
					</table>
				</td>

				<td>N/A</td>

				<td></td>

				<td></td>
				<td></td>
				<td></td>

				<td>
					<table class="limits-table">
						<tr>
							<td>PER STATUTE</td>
							<td>OTHER</td>
						</tr>

						<tr>
							<td>E.L. EACH ACCIDENT</td>
							<td></td>
						</tr>

						<tr>
							<td>E.L. DISEASE - EA EMPLOYEE</td>
							<td></td>
						</tr>

						<tr>
							<td>E.L. DISEASE - POLICY LIMIT</td>
							<td></td>
						</tr>
					</table>
				</td>
			</tr>

			<!-- EMPLOYMENT PRACTICES -->

			<tr>
				<td class="insr-cell">A</td>

				<td>Employment Practices Liability Insurance</td>

				<td></td>
				<td></td>

				<td>76 SBU BT7NMF</td>

				<td>06/19/2025</td>

				<td>06/19/2026</td>

				<td>
					<table class="limits-table">
						<tr>
							<td>Each Claim Limit</td>
							<td class="amount">$25,000</td>
						</tr>

						<tr>
							<td>Annual Aggregate Limit</td>
							<td class="amount">$25,000</td>
						</tr>
					</table>
				</td>
			</tr>
		</table>

		<table class="acord-bottom-main">
			<!-- DESCRIPTION -->
			<tr>
				<td colspan="2" class="desc-title">
					DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES (ACORD 101,
					Additional Remarks Schedule, may be attached if more space is
					required)
				</td>
			</tr>

			<tr>
				<td colspan="2" class="desc-body">
					Those usual to the Insured's Operations.
				</td>
			</tr>

			<!-- HOLDER + CANCELLATION -->
			<tr>
				<td class="holder-col">
					<div class="section-title">CERTIFICATE HOLDER</div>

					<div class="holder-content">
						For Informational Purposes<br />
						${client_company_name}<br />
						${address_line_1}<br />
						${city}, ${state} ${zip}
					</div>
				</td>

				<td class="cancel-col">
					<div class="section-title">CANCELLATION</div>

					<div class="cancel-text">
						SHOULD ANY OF THE ABOVE DESCRIBED POLICIES BE CANCELLED BEFORE THE
						EXPIRATION DATE THEREOF, NOTICE WILL BE DELIVERED IN ACCORDANCE
						WITH THE POLICY PROVISIONS.
					</div>

					<div class="rep-title">AUTHORIZED REPRESENTATIVE</div>

					<div class="signature">Susan R. Castellano</div>
				</td>
			</tr>
		</table>

		<div class="acord-footer">
			<div class="acord-footer-left">
				ACORD 25 (2016/03)
			</div>

			<div class="acord-footer-center">
				The ACORD name and logo are registered marks of ACORD
			</div>

			<div class="acord-footer-right">
				© 1988-2015 ACORD CORPORATION. All rights reserved.
			</div>
		</div>

		<!-- FOOTER -->
		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 10</div>
		</div>
	</div>

	<!-- PAGE 11 -->
	<div class="pdf-page maintenance-page">
		<!-- HEADER -->
		<div class="maintenance-top">
			<img src="${logoDataUri()}"
				class="maintenance-logo" />
			<div style="text-align: center">
				<div class="maintenance-heading">Service Estimate</div>
			</div>
		</div>

		<!-- SUBTITLE -->
		<div style="
					text-align: center;
					font-size: 16px;
					font-weight: bold;
					margin-bottom: 5px;
				">
			Advance Cleaning Service Package
		</div>

		<div style="text-align: center; font-size: 13px; margin-bottom: 40px">
			Includes all cleaning services outlined in the Scope of Work.
		</div>

		<!-- PRICING TABLE -->
		<table style="width: 100%; font-size: 14px; margin-bottom: 30px">
			<tr style="font-weight: bold; border-bottom: 1px solid #000">
				<td></td>
				<td style="text-align: center">Frequency</td>
				<td style="text-align: right">Price / Service</td>
				<td style="text-align: right">Estimated Man Hrs/ Personnel</td>
			</tr>

			<tr>
				<td style="padding-top: 12px">
					<strong>Advance Cleaning Services</strong>
				</td>
				<td style="text-align: center">1 times / 2 weeks</td>
				<td style="text-align: right">$108.24</td>
				<td style="text-align: right">5.5 Hrs / 2</td>
			</tr>

			<tr>
				<td style="padding-top: 12px">
					<strong>Supervision / Quality Assurance</strong>
				</td>
				<td></td>
				<td style="text-align: right">$22.84</td>
				<td style="text-align: right">1 Hrs / 1</td>
			</tr>

			<tr>
				<td style="padding-top: 12px">
					<strong>Cleaning Equipment & Chemicals</strong>
				</td>
				<td></td>
				<td style="text-align: right">$6.32</td>
				<td></td>
			</tr>
		</table>

		<!-- TOTAL -->
		<div style="
					text-align: right;
					font-size: 15px;
					font-weight: bold;
					margin-bottom: 20px;
				">
			Total Bi-Weekly Price (1 days / 2 weeks): $137.40
		</div>

		<div style="text-align: center; font-size: 12px; margin-bottom: 30px">
			The above pricing does not include applicable sales tax, paper products,
			toiletries and other miscellaneous products sold at inventory price. See
			page 8 for more info.
		</div>

		<!-- CLIENT COMPANY -->

		<div style="display: flex; justify-content: flex-end; margin: 35px 0 25px 0">
			<div style="width: 42%; text-align: center">
				<div style="font-size: 15px; margin-bottom: 5px">
					${client_company_name}
				</div>

				<div style="border-bottom: 2px solid #000"></div>

				<div style="font-size: 12px; margin-top: 6px">
					Client Company's Legal Name
				</div>
			</div>
		</div>

		<!-- SIGNATURE ROW -->
		<div style="display: flex; justify-content: space-between; margin-top: 35px">
			<!-- DATE -->
			<div style="width: 42%; text-align: center">
				<div style="border-bottom: 2px solid #000"></div>
				<div style="font-size: 12px; margin-top: 5px">Date</div>

				<div style="margin-top: 15px; font-size: 16px; font-weight: bold">
					${formattedSignedDate}
				</div>

				<div style="border-bottom: 2px solid #000; margin-top: 5px"></div>
				<div style="font-size: 12px; margin-top: 4px">Date</div>
			</div>

			<!-- SIGNATURE -->
			<div style="width: 42%; text-align: center">
				<div style="border-bottom: 2px solid #000"></div>
				<div style="font-size: 12px; margin-top: 5px">
					Authorized Representative Signature
				</div>

				<div style="margin-top: -8px">
					<span style="color: white; font-size: 2px;">**SIGN_HERE**</span>
				</div>

				<div style="border-bottom: 2px solid #000; margin-top: 10px"></div>

				 <!-- ADMIN SIGNATURE -->
  <div style="margin-top:18px">

    <span
      style="
        display:inline-block;
        width:250px;
        height:40px;
        border-bottom:2px solid #000;
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
                left:50%;
                transform:translateX(-50%);
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

  <div style="font-size:12px; margin-top:6px">
    Social Sanitation Commercial Cleaning Solutions,<br />
    Representative Signature
  </div>
			</div>
		</div>

		<!-- TERMS -->
		<div style="font-size: 11px; margin-top: 40px; text-align: justify">
			All quotes and estimates are valid within thirty days from signed date.
			Prices are set for a thirty-day period, once the document is signed and
			dated by customer's legal representative. Thirty days after customer's
			signature, this document and price becomes void, unless signed in
			contractual agreement. All services offered are appointment-based
			services. “Single Services” are charged a twenty-five percent fee to
			reschedule time and/or date if within 24 hours of scheduled service.
			“Recurring Services” must have a time and date specified in a service
			request for additional services. Any holiday scheduling must be done
			thirty days prior to the scheduled service date. If billed monthly, all
			charges are final. If any questions, changes, or adjustments are needed,
			contact your representative.
		</div>

		<!-- FOOTER -->
		<div class="footer">
			<div class="footer-left">
				Social Sanitation Commercial Cleaning Solutions 2026
			</div>
			<div class="footer-right">Page 11</div>
		</div>
	</div>
</body>

</html>
`;

  const browser = await launchPdfBrowser();

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready"); // Optional font load wait

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
    preferCSSPageSize: true,
  });

  await browser.close();

  return pdfPath;
};

const generateContractPDF = async (data, pdfPath) => {
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

  const htmlContent = `
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

  const browser = await launchPdfBrowser();

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready"); // Optional font load wait

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

  return pdfPath;
};

const generateScopeOfWorkPdfBuffer = async ({
  client_name,
  scopeSections,
  frequency = "Bi-Weekly",
}) => {
  const scopeHTML = renderScopeTables(scopeSections); // ✅ reused as-is, zero changes

  const htmlContent = `
<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Scope of Work</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: "Times New Roman", serif;
      color: #000;
      -webkit-print-color-adjust: exact;
    }

    .scope-doc {
      width: 794px;
      margin: 0 auto;
      padding: 40px 60px 60px 60px;
      box-sizing: border-box;
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
      border-left: 2px solid #000;
      border-right: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 6px 8px;
      text-align: right;
      font-weight: bold;
      font-size: 11px;
    }

    .scope-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0;
    }

    .scope-table td {
      border: 1px solid #000;
      padding: 5px 7px;
      font-size: 11px;
    }

    .scope-section td {
      background: #5aa02c;
      font-weight: bold;
      text-align: center;
    }

    .scope-section-red td {
      background: #e10600;
      color: #fff;
      font-weight: bold;
      text-align: center;
    }

    .scope-frequency {
      width: 75px;
      text-align: center;
      background: #e0e0e0;
      font-size: 10px;
      font-weight: bold;
    }

    .scope-check {
      background: #bfbfbf;
    }

    .scope-gap {
      height: 8px;
    }

    /* let sections flow naturally across pages instead of being clipped */
    .scope-table {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="scope-doc">
    <div class="scope-main-title">
      ${client_name ? `${client_name}'s Scope of Work` : "Scope of Work"}
    </div>

    <div class="scope-sub-header">${frequency} Services</div>

    ${scopeHTML}
  </div>
</body>
</html>
`;

  const browser = await launchPdfBrowser();

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: "networkidle0" });
  await page.evaluateHandle("document.fonts.ready");

  const pdfBuffer = await page.pdf({
    printBackground: true,
    format: "A4",
    margin: { top: "0px", bottom: "0px", left: "0px", right: "0px" },
  });

  await browser.close();

  return pdfBuffer;
};

module.exports = {
  generateEstimatePDF,
  generateContractPDF,
  generateScopeOfWorkPdfBuffer,
};
