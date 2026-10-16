// The hiring-form PDF renders whatever the applicant left out. A form without references failed with
// "references.map is not a function" after the submission was saved, so the applicant got a 500
// and no PDF or email went out.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadFromRoot } = require("./helpers/mocks");

const english = loadFromRoot("src/templates/pdf/hiringForm.js");
const spanish = loadFromRoot("src/templates/pdf/hiringFormSpanish.js");
const render = (template, formData) =>
  template({ formData, signatureBase64Url: "", driverLicenseNumber: "", signatureCompanyBase64Url: "" });

test("a form without references renders, saying none were given", () => {
  const formData = { personalInfo: { firstName: "Cy", email: "cy@example.com" } };
  assert.match(render(english, formData), /No references provided/);
  assert.match(render(spanish, formData), /No se proporcionan referencias/);
});

test("references and military records are shown whether sent as a list or as JSON text", () => {
  const reference = { firstName: "Rae", lastName: "Quill", relationship: "Mentor" };
  const record = { branch: "Coast Guard", rank: "E5" };
  for (const formData of [
    { references: [reference], militaryService: { veteran: "yes", records: [record] } },
    { references: JSON.stringify([reference]), militaryService: { veteran: "yes", records: JSON.stringify([record]) } },
  ]) {
    for (const template of [english, spanish]) {
      const html = render(template, formData);
      assert.match(html, /Rae/);
      assert.match(html, /Quill/);
      assert.match(html, /Coast Guard/);
    }
  }
});
