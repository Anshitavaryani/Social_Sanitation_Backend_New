const { LOGO_URL } = require("../../src/config/company");

const emailBase = ({ title, preheader = "", bodyHtml }) => `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
  </head>
  <body style="margin:0; padding:0; background:#f4f8f6; font-family: Arial, Helvetica, sans-serif;">
    <!-- preheader (hidden preview text) -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">
      ${preheader}
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f6; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:14px; overflow:hidden; box-shadow: 0 4px 20px rgba(27,122,67,0.08);">

            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #16324f 0%, #1b7a43 65%, #3ea56f 100%); padding: 28px 32px; text-align:center;">
                <img src="${LOGO_URL}" alt="Social Sanitation" width="150" style="display:block; margin: 0 auto; height:auto;" />
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 32px;">
                ${bodyHtml}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 20px 32px; background:#f8faf9; border-top:1px solid #eef0f2; text-align:center;">
                <p style="margin:0; font-size:12px; color:#8a938e; line-height:1.6;">
                  &copy; ${new Date().getFullYear()} Social Sanitation. All rights reserved.<br />
                  This is an automated message — please do not reply directly to this email.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

module.exports = emailBase;