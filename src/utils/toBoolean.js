// Yes/no values from forms, JSON and the database: true, 1, "1" and "true" (any case) are true.
const toBoolean = (value) => value === true || value === 1 || value === "1" || String(value).trim().toLowerCase() === "true";

module.exports = toBoolean;
