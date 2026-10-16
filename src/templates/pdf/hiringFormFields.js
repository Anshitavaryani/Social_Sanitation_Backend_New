// What both hiring-form pages (English and Spanish) read from the submitted form, besides its sections
const listOf = (value) => {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
};

// references and military records are lists (or the same list as JSON text); anything else, or
// nothing, shows as none
const hiringFormFields = (formData) => ({
  veteranStatus: formData?.militaryService?.veteran,
  militaryRecords: listOf(formData?.militaryService?.records),
  references: listOf(formData?.references),
});

module.exports = hiringFormFields;
