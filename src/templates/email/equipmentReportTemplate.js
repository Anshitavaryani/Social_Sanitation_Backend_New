const emailBase = require("./emailBase");
const { formatDisplayDate, formatDisplayDateTime } = require("../../utils/time");

const STATUS_COLORS = {
  ASSIGNED: { bg: "#eef2ff", color: "#4338ca" },
  RETURNED: { bg: "#ecfdf5", color: "#059669" },
  PARTIALLY_RETURNED: { bg: "#fef3c7", color: "#b45309" },
  OVERDUE: { bg: "#fee2e2", color: "#dc2626" },
};

const statusBadge = (status) => {
  const style =
    STATUS_COLORS[status] || {
      bg: "#f1f4f2",
      color: "#4b5f58",
    };

  return `
    <span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:${style.bg}; color:${style.color};">
      ${status || "—"}
    </span>
  `;
};

const signatureHistoryBlock = (history = []) => {
  if (!history.length) {
    return `<span style="color:#8a938e; font-size:12.5px;">No signature</span>`;
  }

  return history
    .map(
      (signature) => `
        <div style="margin-bottom:8px; padding:8px 10px; background:#fafcfb; border:1px solid #eef0f2; border-radius:8px; font-size:12px; color:#4b5f58; line-height:1.5;">
          <strong style="color:#16324f;">${signature.action}</strong><br />
          Quantity: ${signature.quantity} &middot; Remaining: ${signature.remaining_quantity}<br />
          Signed: ${formatDisplayDateTime(signature.signed_at)}
        </div>
      `,
    )
    .join("");
};

const employeeEquipmentAssignmentFormat = ({
  name,
  assignment,
}) => {
  const bodyHtml = `
    <h2 style="margin:0 0 6px; font-size:20px; color:#16324f;">
      Hello ${name || "Employee"},
    </h2>

    <p style="margin:0 0 24px; font-size:14px; color:#4b5f58; line-height:1.6;">
      Here is your equipment assignment and acknowledgement record.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom: 24px;">
      <thead>
        <tr style="background:#e9f7ef;">
          <th style="padding:10px; text-align:left; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Equipment
          </th>

          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Assigned
          </th>

          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Returned
          </th>

          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Pending
          </th>

          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Status
          </th>

          <th style="padding:10px; text-align:left; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Assigned Date
          </th>

          <th style="padding:10px; text-align:left; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Return By
          </th>

          <th style="padding:10px; text-align:left; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Signature History
          </th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#16324f; font-weight:600;">
            ${assignment.equipment?.name || "-"}
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#4b5f58; text-align:center;">
            ${assignment.assigned_quantity}
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#4b5f58; text-align:center;">
            ${assignment.returned_quantity}
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#4b5f58; text-align:center;">
            ${assignment.pending_quantity}
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; text-align:center;">
            ${statusBadge(assignment.status)}
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:12.5px; color:#4b5f58;">
            ${
              assignment.assigned_date
                ? formatDisplayDate(assignment.assigned_date)
                : "-"
            }
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:12.5px; color:#4b5f58;">
            ${
              assignment.expected_return_date
                ? formatDisplayDate(assignment.expected_return_date)
                : "-"
            }
          </td>

          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2;">
            ${signatureHistoryBlock(
              assignment.signature?.history,
            )}
          </td>
        </tr>
      </tbody>
    </table>

    <div style="background:#f8faf9; border:1px solid #eef0f2; border-radius:10px; padding:14px 16px; margin-bottom: 8px;">
      <p style="margin:0; font-size:12.5px; color:#6b7b76; line-height:1.6;">
        This record reflects the equipment assignment and the
        acknowledgement/signature history maintained by Social Sanitation.
      </p>
    </div>

    <p style="margin:20px 0 0; font-size:13.5px; color:#4b5f58;">
      If you have any questions regarding this equipment record, please contact your administrator.
    </p>

    <p style="margin:20px 0 0; font-size:13.5px; color:#16324f;">
      Best regards,<br />
      <strong>Social Sanitation Team</strong>
    </p>
  `;

  return emailBase({
    title: `Your Equipment Assignment - ${
      assignment.equipment?.name || "Equipment"
    }`,
    preheader:
      "Your equipment assignment and signature record",
    bodyHtml,
  });
};

module.exports = employeeEquipmentAssignmentFormat;