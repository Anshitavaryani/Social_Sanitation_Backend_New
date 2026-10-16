// Every date people read is MM-DD-YYYY, and src/utils/time.js is the only place that spells a date
// format. The PDF and email checks run the real templates and read the HTML they produce.
require("./helpers/env");
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, mockModule, mockPackage, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const espree = require(require.resolve("espree", { paths: [ROOT] }));

mockDatabase();

// The PDF templates run as in production; the browser only records the HTML it is handed
const renderedHtml = [];
const writtenFiles = [];
const fakePage = {
  setContent: async (html) => {
    renderedHtml.push(html);
  },
  pdf: async (options = {}) => {
    if (options.path) {
      fs.mkdirSync(path.dirname(options.path), { recursive: true });
      fs.writeFileSync(options.path, "%PDF-");
      writtenFiles.push(options.path);
    }
    return Buffer.from("%PDF-");
  },
  evaluate: async () => undefined,
  evaluateHandle: async () => ({ dispose: async () => {} }),
};
mockPackage("puppeteer-core", { launch: async () => ({ newPage: async () => fakePage, close: async () => {} }) });
// estimate PDFs download their images
mockPackage("axios", { get: async () => ({ data: Buffer.from("89504e470d0a1a0a", "hex") }) });

const sentMail = [];
mockModule("src/config/microsoftGraph.helper.js", {
  sendMailViaGraph: async (mail) => sentMail.push(mail),
  sendMailViaGraphWithSender: async (mail) => sentMail.push(mail),
});

const time = loadFromRoot("src/utils/time.js");

after(() => writtenFiles.forEach((file) => fs.rmSync(file, { force: true })));

const quietly = async (fn) => {
  const { log, info, warn } = console;
  console.log = console.info = console.warn = () => {};
  try {
    return await fn();
  } finally {
    Object.assign(console, { log, info, warn });
  }
};

const htmlOf = async (render) => {
  renderedHtml.length = 0;
  await quietly(render);
  assert.equal(renderedHtml.length, 1, "one page rendered");
  return renderedHtml[0];
};

// The given dates appear as MM-DD-YYYY and never in their stored form or another style
const assertDisplayed = (rendered, expected, raw = []) => {
  // embedded images are not text (their base64 can contain "NaN")
  const html = rendered.replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "data:image");
  for (const shown of expected) assert.ok(html.includes(shown), `shows ${shown}`);
  for (const stored of raw) assert.ok(!html.includes(stored), `does not show the stored form ${stored}`);
  assert.doesNotMatch(html, /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, "no MM/DD/YYYY or M/D/YYYY dates");
  assert.doesNotMatch(html, /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/, "no long-form dates");
  assert.doesNotMatch(html, /NaN|Invalid Date/);
};

test("display helpers write MM-DD-YYYY and keep the calendar day", () => {
  assert.equal(time.formatDisplayDate("2026-10-16"), "10-16-2026");
  assert.equal(time.formatDisplayDate(new Date("2026-10-16T00:00:00Z")), "10-16-2026", "bookings.date (UTC midnight)");
  assert.equal(time.formatDisplayDate("2026-10-16T05:00:00.000Z"), "10-16-2026");
  for (const missing of [null, undefined, "", "2026-02-31", "not a date"]) {
    assert.equal(time.formatDisplayDate(missing), "", JSON.stringify(missing));
  }
  assert.equal(time.formatDisplayDateRange("2026-10-01 - 2026-10-31"), "10-01-2026 - 10-31-2026");
  assert.equal(time.formatDisplayDateRange("2026-10-20"), "10-20-2026");
  assert.equal(time.formatDisplayDateRange("Ongoing - 2026-10-31"), "Ongoing - 10-31-2026");
  assert.equal(time.formatDisplayDateTime("2026-10-16T19:05:00Z"), "10-16-2026 03:05 PM", "New York time");
  assert.equal(time.formatDisplayDateTime("2026-01-16T19:05:00Z"), "01-16-2026 02:05 PM", "standard time");
  assert.equal(time.formatTime12h("16:00:41"), "04:00 PM");
  assert.equal(time.formatTime12h("09:30"), "09:30 AM");
  assert.equal(time.formatTime12h("99:99"), "");
  assert.equal(time.formatDisplayMonth("2026-10"), "October 2026");
});

test("date checks are strict and date helpers keep their old results", () => {
  assert.equal(time.isValidDate("2026-02-28"), true);
  assert.equal(time.isValidDate("2026-02-31"), false);
  assert.equal(time.isValidDate("2026-2-3"), false);
  assert.equal(time.isValidDate(new Date()), false);
  assert.equal(time.isValidMonth("2026-12"), true);
  assert.equal(time.isValidMonth("2026-13"), false);
  assert.equal(time.utcDate(new Date("2026-10-16T23:30:00Z")), "2026-10-16");
  // the former convertToEST in src/config/timeManagement.js
  assert.equal(time.toBusinessDateTime("2026-10-16T19:05:00Z"), "2026-10-16 15:05:00");
  assert.equal(time.toBusinessDateTime(null), null);
  assert.equal(time.toBusinessDateTime("garbage"), null);
});

test("quote, invoice and service request PDFs show MM-DD-YYYY", async () => {
  const pdf = loadFromRoot("src/config/puppeteer.js");
  const items = [{ description: "Janitorial", quantity: 2, unit_price: 150.5, multiplier: 1 }];
  const party = { to_company_name: "Test Co", address_1: "1 Main St", address_2: "Tampa FL", items, signature: "" };

  const quote = await htmlOf(() =>
    pdf.generateQuotePDF({ ...party, ref_no: "Q-1", service_dates: "2026-10-01 - 2026-10-31", due_date: "2026-10-30", date: "2026-10-15" }),
  );
  assertDisplayed(quote, ["10-01-2026 - 10-31-2026", "10-30-2026"], ["2026-10-01", "2026-10-30"]);

  const invoice = await htmlOf(() =>
    pdf.generateInvoicePDF({
      ...party,
      invoice_ref_no: "INV-1",
      event_name: "Office cleaning",
      service_start: "2026-10-01",
      service_end: "2026-10-31",
      invoice_date: "2026-10-15",
      billing_date: "2026-10-16",
      due_date: "2026-11-14",
      payment_link: "https://example.com/pay",
    }),
  );
  assertDisplayed(invoice, ["10-01-2026", "10-31-2026", "10-15-2026", "10-16-2026", "11-14-2026"], ["2026-10-15", "2026-11-14"]);

  const serviceRequest = await htmlOf(() =>
    pdf.generateServiceRequestPDF({
      ...party,
      ref_no: "SR-1",
      service_days: "MON, WED",
      due_date: "2026-10-30",
      date: "2026-10-15",
      pdfPath: path.join(fs.mkdtempSync(path.join(require("os").tmpdir(), "ss-dates-")), "sr.pdf"),
    }),
  );
  assertDisplayed(serviceRequest, ["10-15-2026", "10-30-2026"], ["2026-10-15", "2026-10-30"]);
});

test("hiring form PDFs (English and Spanish) show MM-DD-YYYY", async () => {
  const pdf = loadFromRoot("src/config/puppeteer.js");
  const form = {
    personalInfo: { firstName: "Ana", lastName: "Lopez", dateOfBirth: "1990-05-01", dateAvailable: "2026-11-02" },
    previousEmployment: {
      hasJob: "yes",
      employers: [{ companyName: "Clean Co", email: "hr@clean.example", duration: ["2020-01-06", "2023-06-30"] }],
    },
    floridaAgreement: { agreement_date: "2026-10-16" },
    references: [],
    militaryService: { veteran: "no", records: [] },
  };
  for (const render of [pdf.generatePDF, pdf.generateSpanishPDF]) {
    const html = await htmlOf(() => render(form, "", "D123", "", 7));
    assertDisplayed(html, ["05-01-1990", "11-02-2026", "01-06-2020 - 06-30-2023", "10-16-2026"], ["1990-05-01", "2026-10-16"]);
  }
});

test("estimate and contract PDFs show MM-DD-YYYY; a contract date that is not a date prints as typed", async () => {
  const pdf = loadFromRoot("src/config/serviceEstimate.js");
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "ss-dates-"));

  const estimate = await htmlOf(() =>
    pdf.generateEstimatePDF(
      { client_company_name: "Test Co", client_name: "Jane", signature: "", signed_date: "2026-10-15", scopeSections: [] },
      path.join(dir, "estimate.pdf"),
    ),
  );
  // Page 10 reproduces the insurer's ACORD 25 certificate as issued, MM/DD/YYYY labels and dates included
  const certificate = estimate.match(/<!-- PAGE 10 -->[\s\S]*?<!-- PAGE 11 -->/)[0];
  assert.ok(certificate.includes("DATE (MM/DD/YYYY)") && certificate.includes("06/19/2025"), "certificate left as issued");
  assertDisplayed(estimate.replace(certificate, ""), ["10-15-2026"], ["2026-10-15"]);

  const contract = await htmlOf(() =>
    pdf.generateContractPDF({ client_company_name: "Test Co", contract_date: "2026-10-16", signature: "" }, path.join(dir, "contract.pdf")),
  );
  assertDisplayed(contract, ["10-16-2026"], ["2026-10-16"]);

  const typed = await htmlOf(() =>
    pdf.generateContractPDF({ client_company_name: "Test Co", contract_date: "Upon signature", signature: "" }, path.join(dir, "contract2.pdf")),
  );
  assert.ok(typed.includes("Upon signature"));
});

test("emails show MM-DD-YYYY dates and 12-hour times", async () => {
  const email = loadFromRoot("src/services/Common/email.service.js");
  sentMail.length = 0;

  await quietly(() =>
    email.sendEmailToAdmin({ email: "c@example.com", user_profile: { name: "Client" } }, { date: "2026-10-20", time: "09:30:00" }, { name: "Office cleaning" }),
  );
  assert.match(sentMail.at(-1).html, /Date: 10-20-2026<br \/>\s*Time: 09:30 AM/);

  await quietly(() =>
    email.sendInvoiceEmailWithPDF(
      { email: "c@example.com", user_profile: { name: "Client" } },
      { ref_no: "INV-1", service_dates: "2026-10-01 - 2026-10-31", total_due: 100 },
      "/tmp/invoice.pdf",
      "billing@example.com",
    ),
  );
  assert.ok(sentMail.at(-1).html.includes("10-01-2026 - 10-31-2026"));

  await quietly(() =>
    email.sendClockOutDistanceEmail({
      bookingId: 5,
      date: "2026-10-16",
      employee: { name: "Sam", clockOutLat: 1, clockOutLng: 2 },
      userLat: 1,
      userLng: 2,
    }),
  );
  assert.ok(sentMail.at(-1).html.includes("<strong>Date:</strong> 10-16-2026"));

  await quietly(() => email.sendAutoClockOutEmail({ date: "2026-10-16", employees: ["Sam"] }));
  assert.equal(sentMail.at(-1).subject, "Employees Who Did Not Clock Out – 10-16-2026");
  assert.ok(sentMail.at(-1).html.includes("<strong>10-16-2026</strong>"));

  for (const mail of sentMail) assertDisplayed(mail.html, [], ["2026-10-20", "2026-10-16"]);
});

test("equipment and inspection email templates show MM-DD-YYYY (signature time in New York)", () => {
  const equipmentEmail = loadFromRoot("src/templates/email/equipmentReportTemplate.js");
  const html = equipmentEmail({
    name: "Sam",
    assignment: {
      status: "ASSIGNED",
      assigned_date: "2026-10-01",
      expected_return_date: "2026-10-31",
      assigned_quantity: 1,
      returned_quantity: 0,
      pending_quantity: 1,
      equipment: { name: "Vacuum" },
      signature: { history: [{ action: "ASSIGNED", quantity: 1, remaining_quantity: 1, signed_at: "2026-10-01T13:15:00Z" }] },
    },
  });
  assertDisplayed(html, ["10-01-2026", "10-31-2026", "10-01-2026 09:15 AM"], ["2026-10-01", "2026-10-31"]);

  const inspectionEmail = loadFromRoot("src/templates/email/inspectionCompletedFormat.js");
  const inspectionHtml = inspectionEmail({ name: "Client", inspection: { name: "Monthly", inspection_date: "2026-10-16", score: 8, items: [] } });
  assertDisplayed(inspectionHtml, ["10-16-2026"], ["2026-10-16"]);
});

test("an impossible inspection date or equipment month is a 400 (the old checks only matched the shape)", async () => {
  const inspectionService = loadFromRoot("src/services/Common/inspection.service.js");
  await assert.rejects(
    inspectionService.createInspection({ user: { id: 1 }, user_id: 2, employee_id: 3, inspection_date: "2026-02-31" }),
    (err) => err.statusCode === 400 && err.message === "Inspection date must be in YYYY-MM-DD format.",
  );
  const equipmentService = loadFromRoot("src/services/Common/equipment.service.js");
  await assert.rejects(
    equipmentService.getMonthlyEmployeeEquipmentRecords({ month: "2026-13" }),
    (err) => err.statusCode === 400 && err.message === "Invalid month format. Please use YYYY-MM.",
  );
});

// Date-format strings and locale date formatting anywhere in the app outside src/utils/time.js.
// Static document text (template parts holding HTML) is content, not formatting code: the ACORD
// insurance certificate in the estimate PDF prints "DATE (MM/DD/YYYY)" as part of the form.
const FORMAT_TOKENS = /YYYY|HH:mm|hh:mm|MM\/DD|MM-DD|DD\/MM|MMMM|\bMMM\b/;
const LOCALE_FORMATTERS = new Set(["toLocaleDateString", "toLocaleTimeString", "toLocaleString", "toDateString"]);

const appFiles = () => {
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return ["node_modules", "uploads"].includes(entry.name) ? [] : walk(full);
      return entry.name.endsWith(".js") ? [full] : [];
    });
  return [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "public")), path.join(ROOT, "app.js"), path.join(ROOT, "index.js")];
};

const dateFormatOffenders = (file) => {
  const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
  const found = [];
  const visit = (node, parent) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Literal" && typeof node.value === "string" && FORMAT_TOKENS.test(node.value)) {
      found.push(`${node.loc.start.line} "${node.value}"`);
    }
    const text = node.type === "TemplateElement" ? node.value.cooked || "" : "";
    if (node.type === "TemplateElement" && !text.includes("<") && FORMAT_TOKENS.test(text)) {
      found.push(`${node.loc.start.line} \`${node.value.cooked.trim().slice(0, 40)}\``);
    }
    if (node.type === "MemberExpression" && !node.computed && LOCALE_FORMATTERS.has(node.property.name)) {
      found.push(`${node.loc.start.line} .${node.property.name}()`);
    }
    // someDate.toISOString().split("T")[0]: utcDate() / toCalendarDate()
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.property.name === "split" &&
      node.callee.object.type === "CallExpression" &&
      node.callee.object.callee.property?.name === "toISOString"
    ) {
      found.push(`${node.loc.start.line} .toISOString().split()`);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === "loc") continue;
      if (Array.isArray(child)) child.forEach((item) => visit(item, node));
      else if (child && typeof child.type === "string") visit(child, node);
    }
  };
  visit(ast, null);
  return found;
};

test("only time.js and the config schema name a time zone", () => {
  const offenders = [];
  const zoneName = /^(America|Europe|Asia|Africa|Australia|Pacific|Atlantic|Etc)\/[A-Za-z_]+$/;
  for (const file of appFiles()) {
    const relative = path.relative(ROOT, file);
    if ([path.join("src", "utils", "time.js"), path.join("src", "config", "env.schema.js")].includes(relative)) continue;
    const ast = espree.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script", loc: true });
    const visit = (node) => {
      if (!node || typeof node.type !== "string") return;
      if (node.type === "Literal" && typeof node.value === "string" && zoneName.test(node.value)) offenders.push(`${relative}:${node.loc.start.line} ${node.value}`);
      for (const [key, child] of Object.entries(node)) {
        if (key === "loc") continue;
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child.type === "string") visit(child);
      }
    };
    visit(ast);
  }
  assert.deepEqual(offenders, [], "use BUSINESS_TZ from src/utils/time.js");
});

test("only src/utils/time.js spells a date format or formats dates by locale", () => {
  const offenders = [];
  for (const file of appFiles()) {
    const relative = path.relative(ROOT, file);
    if (relative === path.join("src", "utils", "time.js")) continue;
    for (const hit of dateFormatOffenders(file)) offenders.push(`${relative}:${hit}`);
  }
  assert.deepEqual(offenders, [], "use the formats and helpers in src/utils/time.js");
});
