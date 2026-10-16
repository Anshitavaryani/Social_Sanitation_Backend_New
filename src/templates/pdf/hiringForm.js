const { formatDisplayDate } = require("../../utils/time");

// The employment application (hiring form) as submitted, in English
const hiringFormHtml = ({ formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url }) => {
  const veteranStatus = formData?.militaryService?.veteran;
  const militaryRecords = Array.isArray(formData?.militaryService?.records)
    ? formData.militaryService.records
    : [];
  const references = formData?.references || "[]";

  return `
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
      ? formatDisplayDate(formData.personalInfo.dateOfBirth)
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
      ? formatDisplayDate(formData.personalInfo.dateOfBirth)
      : ""
  }
</div>

<div class="info-row">
  <strong>Date Available:</strong> ${
    formData?.personalInfo?.dateAvailable
      ? formatDisplayDate(formData.personalInfo.dateAvailable)
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
              ? `${formatDisplayDate(employer.duration[0])} - ${formatDisplayDate(employer.duration[1])}`
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
      <strong>${formatDisplayDate(formData?.floridaAgreement?.agreement_date)}</strong>

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
};

module.exports = hiringFormHtml;
