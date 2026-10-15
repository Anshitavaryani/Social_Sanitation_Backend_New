const config = require('../../src/config/config');

// const emailVerificationFormat = (otp) => {
//     return `
//     <!DOCTYPE html>
//     <html lang="en">
//     <head>
//     <meta charset="UTF-8">
//     <meta http-equiv="X-UA-Compatible" content="IE=edge">
//     <meta name="viewport" content="width=device-width, initial-scale=1.0">
//     <title>Email Verification</title>
//     <style>
//         /* Center the content vertically and horizontally */
//         body {
//             display: flex;
//             justify-content: center;
//             align-items: center;
//             height: 100vh;
//             margin: 0;
//             padding: 0;
//             font-family: Arial, sans-serif;
//             background-color: #f2f2f2;
//         }

//         /* Container for the content */
//         .container {
//             text-align: left; /* Align the content to the left */
//             max-width: 600px;
//             width: 100%;
//             padding: 20px;
//             background-color: #ffffff;
//             border-radius: 5px;
//         }

//         /* Headings */
//         h3, h5 {
//             margin: 10px 0;
//         }

//         /* Paragraph */
//         p {
//             margin: 10px 0;
//             font-size: 14px; /* Set the font size to smaller */
//         }

//         /* Image and paragraph in a row */
//         .row {
//             display: flex;
//             align-items: center;
//         }

//         /* Spacing between image and paragraph */
//         .row img {
//             margin-right: 10px;
//         }

//         /* Responsive styles */
//         @media (max-width: 600px) {
//             body {
//                 align-items: flex-start;
//             }

//             .container {
//                 border-radius: 0;
//             }

//             .row {
//                 flex-direction: column; /* Stack the image and paragraph vertically on smaller screens */
//                 align-items: flex-start; /* Align the content to the left on smaller screens */
//             }

//             .row img {
//                 margin-right: 0; /* Remove the margin on smaller screens */
//                 margin-bottom: 10px; /* Add bottom margin to the image on smaller screens */
//             }
//         }
//     </style>
//     </head>
//     <body>
//         <div class="container">
//             <h1>Dear User,</h1>
//             <h3>A Verify Email OTP request has been submitted from your account.</h3>
//             <h3>Use this secret code: ${otp} to verify Your Email.</h3>
//             <p style="font-size: 12px;">If you did not request any Email Verification request, please ignore this email.</p>
//             <div class="row">
//                 <p>${config.app_name}</p>
//             </div>
//         </div>
//     </body>
//     </html>`
// };

// module.exports = emailVerificationFormat;


const emailVerificationFormat = (otp) => {
    return `<!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <title>Simple Transactional Email</title>
        <style media="all" type="text/css">
          @media all {
            .btn-primary table td:hover {
              background-color: #ec0867 !important;
            }
    
            .btn-primary a:hover {
              background-color: #ec0867 !important;
              border-color: #ec0867 !important;
            }
          }
          @media only screen and (max-width: 640px) {
            .main p,
            .main td,
            .main span {
              font-size: 16px !important;
            }
    
            .wrapper {
              padding: 8px !important;
            }
    
            .content {
              padding: 0 !important;
            }
    
            .container {
              padding: 0 !important;
              padding-top: 8px !important;
              width: 100% !important;
            }
    
            .main {
              border-left-width: 0 !important;
              border-radius: 0 !important;
              border-right-width: 0 !important;
            }
    
            .btn table {
              max-width: 100% !important;
              width: 100% !important;
            }
    
            .btn a {
              font-size: 16px !important;
              max-width: 100% !important;
              width: 100% !important;
            }
          }
          @media all {
            .ExternalClass {
              width: 100%;
            }
    
            .ExternalClass,
            .ExternalClass p,
            .ExternalClass span,
            .ExternalClass font,
            .ExternalClass td,
            .ExternalClass div {
              line-height: 100%;
            }
    
            .apple-link a {
              color: inherit !important;
              font-family: inherit !important;
              font-size: inherit !important;
              font-weight: inherit !important;
              line-height: inherit !important;
              text-decoration: none !important;
            }
    
            #MessageViewBody a {
              color: inherit;
              text-decoration: none;
              font-size: inherit;
              font-family: inherit;
              font-weight: inherit;
              line-height: inherit;
            }
          }
        </style>
      </head>
      <body
        style="
          font-family: Helvetica, sans-serif;
          -webkit-font-smoothing: antialiased;
          font-size: 16px;
          line-height: 1.3;
          -ms-text-size-adjust: 100%;
          -webkit-text-size-adjust: 100%;
          background-color: #f4f5f6;
          margin: 0;
          padding: 0;
        "
      >
        <table
          role="presentation"
          border="0"
          cellpadding="0"
          cellspacing="0"
          class="body"
          style="
            border-collapse: separate;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
            background-color: #f4f5f6;
            width: 100%;
          "
          width="100%"
          bgcolor="#f4f5f6"
        >
          <tr>
            <td
              style="
                font-family: Helvetica, sans-serif;
                font-size: 16px;
                vertical-align: top;
              "
              valign="top"
            >
              &nbsp;
            </td>
            <td
              class="container"
              style="
                font-family: Helvetica, sans-serif;
                font-size: 16px;
                vertical-align: top;
                max-width: 600px;
                padding: 0;
                padding-top: 40px;
                padding-bottom: 40px;
                width: 600px;
                margin: 0 auto;
              "
              width="600"
              valign="top"
            >
              <div
                class="content"
                style="
                  box-sizing: border-box;
                  display: block;
                  margin: 0 auto;
                  max-width: 600px;
                  padding: 0;
                "
              >
                <!-- START CENTERED WHITE CONTAINER -->
                <span
                  class="preheader"
                  style="
                    color: transparent;
                    display: none;
                    height: 0;
                    max-height: 0;
                    max-width: 0;
                    opacity: 0;
                    overflow: hidden;
                    mso-hide: all;
                    visibility: hidden;
                    width: 0;
                  "
                  >OTP Verification Page</span
                >
                <table
                  role="presentation"
                  border="0"
                  cellpadding="0"
                  cellspacing="0"
                  class="main"
                  style="
                    border-collapse: separate;
                    mso-table-lspace: 0pt;
                    mso-table-rspace: 0pt;
                    background: #ffffff;
                    border: 1px solid #eaebed;
                    border-radius: 16px;
                    width: 100%;
                  "
                  width="100%"
                >
                  <!-- START MAIN CONTENT AREA -->
                  <tr>
                    <td
                      class="wrapper"
                      style="
                        font-family: Helvetica, sans-serif;
                        font-size: 16px;
                        vertical-align: top;
                        box-sizing: border-box;
                        padding: 24px;
                      "
                      valign="top"
                    >
                      <p
                        style="
                          font-family: Helvetica, sans-serif;
                          font-size: 16px;
                          font-weight: normal;
                          margin: 0;
                          margin-bottom: 16px;
                        "
                      >
                        Hi,
                      </p>
                      <p
                        style="
                          font-family: Helvetica, sans-serif;
                          font-size: 16px;
                          font-weight: normal;
                          margin: 0;
                          margin-bottom: 16px;
                        "
                      >
                        Thank you for choosing ${config.app_name}. Use the following
                        OTP to complete your Sign Up procedures. OTP is valid for 5
                        minutes
                      </p>
                      <table
                        role="presentation"
                        border="0"
                        cellpadding="0"
                        cellspacing="0"
                        class="btn btn-primary"
                        style="
                          border-collapse: separate;
                          mso-table-lspace: 0pt;
                          mso-table-rspace: 0pt;
                          box-sizing: border-box;
                          width: 100%;
                          min-width: 100%;
                        "
                        width="100%"
                      >
                        <tbody>
                          <tr>
                            <td
                              align="left"
                              style="
                                font-family: Helvetica, sans-serif;
                                font-size: 16px;
                                vertical-align: top;
                                padding-bottom: 16px;
                              "
                              valign="top"
                            >
                              <table
                                role="presentation"
                                border="0"
                                cellpadding="0"
                                cellspacing="0"
                                style="
                                  border-collapse: separate;
                                  mso-table-lspace: 0pt;
                                  mso-table-rspace: 0pt;
                                  width: auto;
                                "
                              >
                                <tbody>
                                  <tr>
                                    <td
                                      style="
                                        font-family: Helvetica, sans-serif;
                                        font-size: 16px;
                                        vertical-align: top;
                                        border-radius: 4px;
                                        text-align: center;
                                        background-color: #0867ec;
                                      "
                                      valign="top"
                                      align="center"
                                      bgcolor="#0867ec"
                                    >
                                      <a
                                        href="http://htmlemail.io"
                                        target="_blank"
                                        style="
                                          border: solid 2px #0867ec;
                                          border-radius: 4px;
                                          box-sizing: border-box;
                                          cursor: pointer;
                                          display: inline-block;
                                          font-size: 16px;
                                          font-weight: bold;
                                          margin: 0;
                                          padding: 12px 24px;
                                          text-decoration: none;
                                          text-transform: capitalize;
                                          background-color: #0867ec;
                                          border-color: #0867ec;
                                          color: #ffffff;
                                        "
                                        >${otp}</a
                                      >
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p
                        style="
                          font-family: Helvetica, sans-serif;
                          font-size: 0.7em;
                          font-weight: normal;
                          margin: 0;
                          margin-bottom: 16px;
                        "
                      >
                        If you did not request any Email Verification request,
                        please ignore this email.
                      </p>
                      <p
                        style="
                          font-family: Helvetica, sans-serif;
                          font-size: 0.8em;
                          font-weight: normal;
                          margin: 0;
                          margin-bottom: 16px;
                        "
                      >
                        Regards,
                        <br />
                        ${config.app_name}
                      </p>
                    </td>
                  </tr>
    
                  <!-- END MAIN CONTENT AREA -->
                </table>
    
                <!-- START FOOTER 
                <div
                  class="footer"
                  style="
                    clear: both;
                    padding-top: 24px;
                    text-align: center;
                    width: 100%;
                  "
                >
                  <table
                    role="presentation"
                    border="0"
                    cellpadding="0"
                    cellspacing="0"
                    style="
                      border-collapse: separate;
                      mso-table-lspace: 0pt;
                      mso-table-rspace: 0pt;
                      width: 100%;
                    "
                    width="100%"
                  >
                    <tr>
                      <td
                        class="content-block"
                        style="
                          font-family: Helvetica, sans-serif;
                          vertical-align: top;
                          color: #9a9ea6;
                          font-size: 16px;
                          text-align: center;
                        "
                        valign="top"
                        align="center"
                      >
                        <span
                          class="apple-link"
                          style="
                            color: #9a9ea6;
                            font-size: 16px;
                            text-align: center;
                          "
                          >Company Inc, 7-11 Commercial Ct, Belfast BT1 2NB</span
                        >
                        <br />
                        Don't like these emails?
                        <a
                          href="http://htmlemail.io/blog"
                          style="
                            text-decoration: underline;
                            color: #9a9ea6;
                            font-size: 16px;
                            text-align: center;
                          "
                          >Unsubscribe</a
                        >.
                      </td>
                    </tr>
                    <tr>
                      <td
                        class="content-block powered-by"
                        style="
                          font-family: Helvetica, sans-serif;
                          vertical-align: top;
                          color: #9a9ea6;
                          font-size: 16px;
                          text-align: center;
                        "
                        valign="top"
                        align="center"
                      >
                        Powered by
                        <a
                          href="http://htmlemail.io"
                          style="
                            color: #9a9ea6;
                            font-size: 16px;
                            text-align: center;
                            text-decoration: none;
                          "
                          >HTMLemail.io</a
                        >
                      </td>
                    </tr>
                  </table>
                </div>
    
                END FOOTER -->
    
                <!-- END CENTERED WHITE CONTAINER -->
              </div>
            </td>
            <td
              style="
                font-family: Helvetica, sans-serif;
                font-size: 16px;
                vertical-align: top;
              "
              valign="top"
            >
              &nbsp;
            </td>
          </tr>
        </table>
      </body>
    </html>
    `;
  };
  
  module.exports = emailVerificationFormat;
  