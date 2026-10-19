// Schemas for admin endpoints whose handlers failed on missing or wrongly typed input (most as a
// 500). Each requires only what the handler needs and allows other fields; see fields.js.
const { Joi, DATE_MESSAGE, id, text, optionalText, email, date, calendarDate, parseableDate, amount, optionalAmount, lineItems } = require("./fields");
const { inZone, SHORT_TIME_FORMAT } = require("../utils/time");

const optionalId = Joi.alternatives(id, Joi.valid("", null));
const optionalDate = Joi.alternatives(parseableDate, Joi.valid("", null)).messages({ "alternatives.match": DATE_MESSAGE });

// --- checklists: POST /checklist/createServiceChecklist, /checklist/createDailyChecklist
const createChecklist = {
  body: Joi.object({
    heading: text.required(),
    role_id: optionalId,
    tasks: Joi.array().items(text).required().messages({ "array.base": "tasks must be a list of task names" }),
  }),
};

// --- users: POST /admin/user/createUser, addNewUserAddress, resetUserCredentials
const createUser = {
  body: Joi.object({
    email: email.required(),
    role_id: id.required(),
    name: optionalText,
  }),
};

const addNewUserAddress = { body: Joi.object({ user_id: id.required() }) };

const resetUserCredentials = {
  body: Joi.object({
    user_id: id.required(),
    new_email: Joi.alternatives(email, Joi.valid("", null)).messages({ "alternatives.match": "new_email must be a valid email" }),
  }),
};

// --- quotes and service requests: POST /admin/user/submitServiceQuote, saveDraftQuote,
// PUT editServiceQuote, POST submitServiceRequest, PUT editServiceRequest
const submitServiceQuote = {
  body: Joi.object({
    user_id: id.required(),
    quote_id: optionalId,
    items: lineItems,
    cc_email: optionalText,
  }),
};
const saveDraftQuote = { body: Joi.object({ user_id: id.required(), quote_id: optionalId, items: lineItems }) };
const editServiceQuote = { body: Joi.object({ quote_id: id.required(), user_id: id.required(), items: lineItems }) };
const submitServiceRequest = { body: Joi.object({ user_id: id.required(), items: lineItems }) };
const editServiceRequest = { body: Joi.object({ request_id: id.required(), user_id: id.required(), items: lineItems }) };

// --- admin bookings: POST /admin/booking/adminCreateBooking, adminCreateBookingForGuest,
// send-two-week-schedule. repeat_on_days are the short day names the recurrence reads.
const repeatOnDays = Joi.array()
  .items(Joi.string().valid("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"))
  .messages({ "array.base": "repeat_on_days must be a list of days", "any.only": "repeat_on_days must use Sun, Mon, Tue, Wed, Thu, Fri, Sat" });
const adminCreateBooking = {
  body: Joi.object({
    user_id: id.required(),
    service_id: id.required(),
    address_id: optionalId,
    date: calendarDate.required(),
    repeat_on_days: repeatOnDays,
  }),
};
const adminCreateBookingForGuest = {
  body: Joi.object({ service_id: id.required(), date: calendarDate.required(), repeat_on_days: repeatOnDays }),
};
const sendTwoWeekSchedule = { body: Joi.object({ employee_id: id.required() }) };

// --- attendance: POST /attendance/manualClockInOut. clock_in/clock_out are read as New York
// times on that date; anything the date handling cannot read is refused (it failed on save)
const readableClock = (dateValue, clock) => {
  try {
    return inZone(`${dateValue} ${clock}`).isValid();
  } catch {
    return false;
  }
};
const manualClockInOut = {
  body: Joi.object({
    employee_id: id.required(),
    date: date.required(),
    role_id: optionalId,
    clock_in: optionalText,
    clock_out: optionalText,
  }).custom((body, helpers) => {
    for (const field of ["clock_in", "clock_out"]) {
      if (body[field] && !readableClock(body.date, body[field])) return helpers.message(`${field} must be a time as ${SHORT_TIME_FORMAT}`);
    }
    return body;
  }),
};

// --- service estimates: POST /admin/auth/generate-estimate-pdf, PUT update-service-estimate
const generateEstimatePdf = { body: Joi.object({ user_id: id.required(), client_company_name: text.required() }) };
const updateServiceEstimate = {
  body: Joi.object({ estimate_id: id.required(), user_id: id.required(), client_company_name: text.required() }),
};

// --- invoices: POST /invoice/createInvoice, PUT /invoice/:id
const RECURRING_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]; // invoice_recurring.frequency
const invoiceFields = {
  items: lineItems,
  billing_date: optionalDate,
  invoice_date: optionalDate,
  due_date: optionalDate,
  balance_date: optionalDate,
  recurring_end_date: optionalDate,
  recurring_frequency: Joi.string().valid(...RECURRING_FREQUENCIES).messages({ "any.only": `recurring_frequency must be one of ${RECURRING_FREQUENCIES.join(", ")}` }),
  recurring_max_occurrences: Joi.alternatives(amount, Joi.valid(null, "")).messages({ "alternatives.match": "recurring_max_occurrences must be a number" }),
  deposit_percentage: optionalAmount,
  event_name: optionalText,
  custom_ref_no: optionalText,
};
const createInvoice = {
  body: Joi.object({ quote_id: optionalId, user_id: optionalId, ...invoiceFields }).custom((body, helpers) =>
    body.quote_id || body.user_id ? body : helpers.message("user_id or quote_id is required"),
  ),
};
const updateInvoice = { params: Joi.object({ id: id.required() }), body: Joi.object(invoiceFields) };

// --- quote form questions: PUT /quote/editQuestion/:id
const editQuestion = { params: Joi.object({ id: id.required() }), body: Joi.object({ question: optionalText, type: optionalText }) };

// --- push notifications: POST /firebase/sendPushNotification
const sendPushNotification = {
  body: Joi.object({
    notificationObj: Joi.object({ title: optionalText, body: optionalText }).required(),
    registrationTokens: Joi.array().items(text).min(1).required().messages({ "array.min": "registrationTokens must not be empty", "array.base": "registrationTokens must be a list" }),
  }),
};

// --- admin accounts: PUT /admin/auth/updateAdmin, DELETE /admin/auth/deleteAdmin
const updateAdmin = {
  body: Joi.object({
    admin_id: id.required(),
    name: optionalText,
    mobile: Joi.alternatives(Joi.string().allow("", null), Joi.number()).messages({ "alternatives.match": "mobile must be text" }),
    email: Joi.alternatives(email, Joi.valid("", null)).messages({ "alternatives.match": "email must be a valid email" }),
    role_id: optionalId,
  }),
};
const deleteAdmin = { body: Joi.object({ admin_id: id.required() }) };

module.exports = {
  createChecklist,
  createUser,
  addNewUserAddress,
  resetUserCredentials,
  submitServiceQuote,
  saveDraftQuote,
  editServiceQuote,
  submitServiceRequest,
  editServiceRequest,
  adminCreateBooking,
  adminCreateBookingForGuest,
  sendTwoWeekSchedule,
  manualClockInOut,
  generateEstimatePdf,
  updateServiceEstimate,
  createInvoice,
  updateInvoice,
  editQuestion,
  sendPushNotification,
  updateAdmin,
  deleteAdmin,
};
