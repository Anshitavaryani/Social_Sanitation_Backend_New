// Status values have one source, src/config/types.js: services, controllers and models use the
// enums (bookingTypes.ACCEPTED, invoicePaymentStatusTypes.PAID, ...) instead of writing the strings.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, ENTRY_FILES, loadFromRoot } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

const types = loadFromRoot("src/config/types.js");

const STATUS_ENUMS = [
  "bookingTypes",
  "bookingListFilterTypes",
  "paymentStatusTypes",
  "invoicePaymentStatusTypes",
  "invoicePaymentStageTypes",
  "paymentPurposeTypes",
  "squarePaymentStatusTypes",
  "invoiceStatusTypes",
  "recurringInvoiceStatusTypes",
  "quoteStatusTypes",
  "jobStatusTypes",
  "contractStatusTypes",
  "inspectionStatusTypes",
  "inspectionReviewStatusTypes",
  "equipmentAssignmentStatusTypes",
  "equipmentSignatureActionTypes",
  "equipmentSignatureStatusTypes",
  "attendanceStatusTypes",
  "breakStatusTypes",
  "quoteRequestStatusTypes",
  "productRequestStatusTypes",
  "userStatusTypes",
  "leaveStatusTypes",
  "reportTypes",
];
const STATUS_VALUES = new Set(STATUS_ENUMS.flatMap((name) => Object.values(types[name])));

// Strings that look like statuses but are not ours: message text, DocuSign's and JavaScript's vocabulary
const NOT_STATUSES = new Set([
  "src/services/Common/bookings.service.js completed", // "Checklist item marked as completed"
  "src/services/Common/dailyChecklist.service.js completed", // same message
  "app.js rejected", // Promise.allSettled result status
]);

test("every status family is an enum and the model columns list the same values", () => {
  for (const name of STATUS_ENUMS) assert.ok(types[name] && Object.keys(types[name]).length, name);
  const invoice = loadFromRoot("src/models/invoice.model.js");
  assert.deepEqual(invoice.rawAttributes.payment_status.values, Object.values(types.invoicePaymentStatusTypes));
  assert.deepEqual(invoice.rawAttributes.payment_stage.values, Object.values(types.invoicePaymentStageTypes));
});

const appFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["node_modules", "uploads", "seeders"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), ...ENTRY_FILES];
};

test("only src/config/types.js writes status values", () => {
  const offenders = [];
  for (const file of appFiles()) {
    const relative = path.relative(ROOT, file).split(path.sep).join("/");
    if (relative === "src/config/types.js") continue;
    const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "Literal" && typeof node.value === "string" && STATUS_VALUES.has(node.value) && !NOT_STATUSES.has(`${relative} ${node.value}`)) {
        offenders.push(`${relative}:${node.loc.start.line} "${node.value}"`);
      }
      for (const [key, child] of Object.entries(node)) {
        if (key === "loc") continue;
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child.type === "string") visit(child);
      }
    };
    visit(ast);
  }
  assert.deepEqual(offenders, [], "use the enums in src/config/types.js");
});
