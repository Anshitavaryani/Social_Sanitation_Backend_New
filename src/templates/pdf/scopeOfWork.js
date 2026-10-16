const scopeTablesHtml = require("./scopeTables");

// The scope of work sent with an estimate: the scope tables on their own
const scopeOfWorkHtml = ({ client_name, scopeSections, frequency = "Bi-Weekly" }) => {
  const scopeHTML = scopeTablesHtml(scopeSections);

  return `
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
};

module.exports = scopeOfWorkHtml;
