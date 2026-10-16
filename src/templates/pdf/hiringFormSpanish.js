const { formatDisplayDate } = require("../../utils/time");
const hiringFormFields = require("./hiringFormFields");

// The employment application (hiring form) as submitted, in Spanish
const hiringFormSpanishHtml = ({ formData, signatureBase64Url, driverLicenseNumber, signatureCompanyBase64Url }) => {
  const { veteranStatus, militaryRecords, references } = hiringFormFields(formData);

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
      ? formatDisplayDate(formData.personalInfo.dateOfBirth)
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
                   ? formatDisplayDate(formData.personalInfo.dateOfBirth)
                   : ""
               }
            </div>
            <div class="info-row">
               <strong>Fecha de disponible:</strong>
${
  formData?.personalInfo?.dateAvailable
    ? formatDisplayDate(formData.personalInfo.dateAvailable)
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
                        ? `${formatDisplayDate(employer.duration[0])} - ${formatDisplayDate(employer.duration[1])}`
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
            <strong>${formatDisplayDate(formData?.floridaAgreement?.agreement_date)}</strong>

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
};

module.exports = hiringFormSpanishHtml;
