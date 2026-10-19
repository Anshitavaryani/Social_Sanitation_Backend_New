// Field rules shared by the request schemas. They check a value without changing it (an id sent
// as "12" stays "12", a date stays the text that was sent), and each accepts what the handler
// behind it can process, so a request that works keeps working.
const { Joi } = require("../middlewares/validate.middleware");
const { isValidDate, toCalendarDate, inZone, TIME_OF_DAY, DATE_FORMAT, SHORT_TIME_FORMAT } = require("../utils/time");

const DATE_MESSAGE = `{{#label}} must be a date as ${DATE_FORMAT}`;
const TIME_MESSAGE = `{{#label}} must be a time as ${SHORT_TIME_FORMAT}`;

const passes = (check, message) =>
  Joi.any()
    .custom((value, helpers) => (check(value) ? value : helpers.error("any.invalid")))
    .messages({ "any.invalid": message });

// A database id: a positive whole number, as a number or as text
const id = passes((v) => (typeof v === "number" && Number.isInteger(v) && v > 0) || (typeof v === "string" && /^[1-9]\d*$/.test(v)), "{{#label}} must be a positive whole number");

// Text with something in it
const text = Joi.string().pattern(/\S/).messages({ "string.pattern.base": "{{#label}} must not be empty", "string.base": "{{#label}} must be text" });

// Text, empty text or null
const optionalText = Joi.string().allow("", null).messages({ "string.base": "{{#label}} must be text" });

const email = Joi.string().trim().email().messages({ "string.email": "{{#label}} must be a valid email", "string.base": "{{#label}} must be text" });

// A real calendar date written YYYY-MM-DD
const date = passes(isValidDate, DATE_MESSAGE);

// YYYY-MM-DD, or an ISO date-time starting with one (the date part is used)
const calendarDate = passes((v) => toCalendarDate(typeof v === "string" ? v : null) !== null, DATE_MESSAGE);

// Any date or date-time the API's date handling reads (YYYY-MM-DD, ISO with or without offset)
const parseableDate = passes((v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return false;
  try {
    return inZone(v).isValid();
  } catch {
    return false;
  }
}, DATE_MESSAGE);

// A time of day: HH:mm or HH:mm:ss, 24-hour
const time = Joi.string().pattern(TIME_OF_DAY).messages({ "string.pattern.base": TIME_MESSAGE, "string.base": TIME_MESSAGE });

// A number of 0 or more, as a number or as numeric text
const amount = passes((v) => (typeof v === "number" && Number.isFinite(v) && v >= 0) || (typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim())), "{{#label}} must be a number of 0 or more");

// The same, where empty text or null means "not given" (the handlers use their default)
const optionalAmount = Joi.alternatives(amount, Joi.valid("", null)).messages({ "alternatives.match": "{{#label}} must be a number of 0 or more" });

// A line of a quote, invoice or service request: its numbers must be numbers (they are added up
// for the total and the payment link); hour and sqft may also be "N/A"
const lineItem = Joi.object({
  unit_price: optionalAmount,
  quantity: optionalAmount,
  amount: optionalAmount,
  hour: Joi.alternatives(amount, Joi.valid("", null, "N/A")).messages({ "alternatives.match": "{{#label}} must be a number of 0 or more" }),
  sqft: Joi.alternatives(amount, Joi.valid("", null, "N/A")).messages({ "alternatives.match": "{{#label}} must be a number of 0 or more" }),
}).messages({ "object.base": "each item must be an object" });

const lineItems = Joi.array().items(lineItem).messages({ "array.base": "{{#label}} must be a list" });

module.exports = { Joi, DATE_MESSAGE, TIME_MESSAGE, id, text, optionalText, email, date, calendarDate, parseableDate, time, amount, optionalAmount, lineItems };
