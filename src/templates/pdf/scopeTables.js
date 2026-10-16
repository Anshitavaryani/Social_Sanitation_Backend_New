// The scope tables in the estimate and the scope of work: one table per section, with a check in
// the daily, weekly or monthly column of each item
const scopeTablesHtml = (sections) => {
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

module.exports = scopeTablesHtml;
