const emailBase = require("./emailBase");
const { formatDisplayDate } = require("../../src/utils/time");

const STATUS_COLORS = {
  APPROVED: { bg: "#ecfdf5", color: "#059669" },
  ISSUE: { bg: "#fee2e2", color: "#dc2626" },
  PENDING: { bg: "#f1f4f2", color: "#4b5f58" },
};

const statusBadge = (status) => {
  const style = STATUS_COLORS[status] || STATUS_COLORS.PENDING;

  return `
    <span style="display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:${style.bg}; color:${style.color};">
      ${status || "—"}
    </span>
  `;
};

const scoreBadge = (score) => {
  const numericScore = Number(score);
  const color =
    numericScore >= 8 ? "#059669" : numericScore >= 5 ? "#b45309" : "#dc2626";
  const bg =
    numericScore >= 8 ? "#ecfdf5" : numericScore >= 5 ? "#fef3c7" : "#fee2e2";

  return `
    <span style="display:inline-block; padding:6px 16px; border-radius:20px; font-size:18px; font-weight:700; background:${bg}; color:${color};">
      ${numericScore}/10
    </span>
  `;
};

const formatAddress = (clientUserAddressArray) => {
  const clientAddress = Array.isArray(clientUserAddressArray)
    ? clientUserAddressArray[0]
    : clientUserAddressArray;

  if (!clientAddress || !clientAddress.address) return null;

  const parts = [
    clientAddress.address,
    clientAddress.user_city?.name,
    clientAddress.user_state?.name,
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : null;
};

/*
 * ==========================================
 * TIME TO COMPLETE
 * ==========================================
 *
 * Wall-clock duration from when the employee
 * actually started work (started_at) to when
 * the BDM marked it complete (bdm_completed_at).
 * Falls back to created_at if started_at is
 * somehow null (inspection was never started
 * but got completed anyway).
 */
const formatDuration = (inspection) => {
  const start = inspection.started_at || inspection.created_at;
  const end = inspection.bdm_completed_at;

  if (!start || !end) return null;

  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms <= 0) return null;

  const totalMinutes = Math.round(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? "s" : ""}`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} min`);

  return parts.length ? parts.join(" ") : "Under a minute";
};

const sectionSummaryRows = (items = []) => {
  const sections = Object.values(
    items.reduce((acc, item) => {
      const key = item.section_name;
      if (!acc[key]) {
        acc[key] = { section_name: key, items: [] };
      }
      acc[key].items.push(item);
      return acc;
    }, {}),
  );

  if (!sections.length) {
    return `
      <tr>
        <td colspan="4" style="padding:12px 10px; font-size:13px; color:#8a938e; text-align:center;">
          No scope items on this inspection.
        </td>
      </tr>
    `;
  }

  return sections
    .map((section) => {
      const total = section.items.length;
      const completed = section.items.filter(
        (i) => i.employee_completed,
      ).length;
      const issues = section.items.filter(
        (i) => i.bdm_status === "ISSUE",
      ).length;

      return `
        <tr>
          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#16324f; font-weight:600;">
            ${section.section_name}
          </td>
          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:13px; color:#4b5f58; text-align:center;">
            ${completed}/${total}
          </td>
          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; text-align:center;">
            ${issues > 0 ? statusBadge("ISSUE") : statusBadge("APPROVED")}
          </td>
          <td style="padding:12px 10px; border-bottom:1px solid #eef0f2; font-size:12.5px; color:#4b5f58; text-align:center;">
            ${issues > 0 ? `${issues} flagged` : "—"}
          </td>
        </tr>
      `;
    })
    .join("");
};

const issueRemarksBlock = (items = []) => {
  const issueItems = items.filter(
    (i) => i.bdm_status === "ISSUE" && i.bdm_remark,
  );

  if (!issueItems.length) {
    return "";
  }

  const rows = issueItems
    .map(
      (item) => `
        <div style="margin-bottom:8px; padding:8px 10px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; font-size:12px; color:#7f1d1d; line-height:1.5;">
          <strong style="color:#991b1b;">${item.item_name}</strong><br />
          ${item.bdm_remark}
        </div>
      `,
    )
    .join("");

  return `
    <p style="margin:24px 0 10px; font-size:13.5px; font-weight:600; color:#16324f;">
      Flagged Items
    </p>
    ${rows}
  `;
};

/*
 * ==========================================
 * DETAILS TABLE — client, address, employee, duration
 * ==========================================
 */
const detailsTable = ({ clientName, address, employeeName, duration }) => {
  const rows = [
    { label: "Client", value: clientName },
    { label: "Address", value: address },
    { label: "Employee Assigned", value: employeeName },
    { label: "Time to Complete", value: duration },
  ].filter((row) => row.value);

  if (!rows.length) return "";

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:24px;">
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td style="padding:8px 10px; font-size:12px; color:#8a938e; text-transform:uppercase; letter-spacing:0.02em; width:160px; border-bottom:1px solid #f2f4f3;">
                  ${row.label}
                </td>
                <td style="padding:8px 10px; font-size:13.5px; color:#16324f; font-weight:600; border-bottom:1px solid #f2f4f3;">
                  ${row.value}
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const inspectionCompletedFormat = ({
  name,
  inspection,
  clientAddress = null,
}) => {
  const items = inspection.items || [];
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.employee_completed).length;

  const employeeName =
    inspection.employee?.user_profile?.name || inspection.employee?.email || null;

const address =
  formatAddress(clientAddress) ||
  formatAddress(inspection.client?.user_address) ||
  null;

  const duration = formatDuration(inspection);

  const bodyHtml = `
    <h2 style="margin:0 0 6px; font-size:20px; color:#16324f;">
      Hello ${name || "Client"},
    </h2>

    <p style="margin:0 0 20px; font-size:14px; color:#4b5f58; line-height:1.6;">
      Your inspection <strong>${inspection.name}</strong> conducted on
      ${
        inspection.inspection_date
          ? formatDisplayDate(inspection.inspection_date)
          : "-"
      } has been completed.
    </p>

    ${detailsTable({ clientName: name, address, employeeName, duration })}

    <div style="display:flex; align-items:center; gap:20px; background:#f8faf9; border:1px solid #eef0f2; border-radius:10px; padding:16px 18px; margin-bottom:24px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:20px;">
            ${scoreBadge(inspection.score)}
          </td>
          <td>
            <p style="margin:0; font-size:13px; color:#16324f; font-weight:600;">
              ${completedItems}/${totalItems} items completed
            </p>
            <p style="margin:2px 0 0; font-size:12px; color:#8a938e;">
              Overall inspection score
            </p>
          </td>
        </tr>
      </table>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin-bottom:16px;">
      <thead>
        <tr style="background:#e9f7ef;">
          <th style="padding:10px; text-align:left; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Section
          </th>
          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Completed
          </th>
          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Status
          </th>
          <th style="padding:10px; text-align:center; font-size:11.5px; color:#1b7a43; text-transform:uppercase; letter-spacing:0.03em;">
            Issues
          </th>
        </tr>
      </thead>
      <tbody>
        ${sectionSummaryRows(items)}
      </tbody>
    </table>

    ${issueRemarksBlock(items)}

    ${
      inspection.overall_remark
        ? `
          <div style="background:#f8faf9; border:1px solid #eef0f2; border-radius:10px; padding:14px 16px; margin:20px 0 8px;">
            <p style="margin:0 0 4px; font-size:12px; color:#8a938e; text-transform:uppercase; letter-spacing:0.03em;">
              Overall Remark
            </p>
            <p style="margin:0; font-size:13.5px; color:#4b5f58; line-height:1.6;">
              ${inspection.overall_remark}
            </p>
          </div>
        `
        : ""
    }

    <p style="margin:20px 0 0; font-size:13.5px; color:#4b5f58;">
      If you have any questions about this inspection report, please contact your account manager.
    </p>

    <p style="margin:20px 0 0; font-size:13.5px; color:#16324f;">
      Best regards,<br />
      <strong>Social Sanitation Team</strong>
    </p>
  `;

  return emailBase({
    title: `Inspection Report - ${inspection.name}`,
    preheader: `Your inspection has been completed with a score of ${inspection.score}/10`,
    bodyHtml,
  });
};

module.exports = inspectionCompletedFormat;