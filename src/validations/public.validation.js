// Schemas for the public endpoints that take input (see validate.middleware.js). The sign-in,
// sign-up, OTP and password endpoints check their input in their own middleware and services.
const { Joi, jsonObject } = require("../middlewares/validate.middleware");

// POST /contactUs/createContactUs: every column is optional, but an email has to be one
const createContactUs = {
  body: Joi.object({
    email: Joi.string().trim().email().allow(""),
    contact_number: Joi.alternatives(Joi.string(), Joi.number()).allow(""),
    address: Joi.string().allow(""),
  }),
};

// POST /form/submitForm: the hiring form, sent as an object or as JSON text (multipart), with the
// applicant's email in personalInfo
const submitForm = {
  body: Joi.object({
    formData: jsonObject(
      Joi.object({ personalInfo: Joi.object({ email: Joi.string().trim().min(1).required() }).required() }),
      "formData must be the hiring form as an object or JSON, with personalInfo.email",
    ).required(),
    language: Joi.string().allow(""),
  }),
};

module.exports = { createContactUs, submitForm };
