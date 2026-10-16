// Request validation: validate(schemas) checks req.body, req.query and req.params against Joi
// schemas before the handler runs, and answers 400 with what is wrong. Schemas only require what
// the handler needs and allow other fields, so what the apps already send keeps working; input that
// would otherwise fail inside the handler (often as a 500) is refused up front. Valid values are
// passed on as Joi converted them (e.g. a JSON string field parsed).
const Joi = require("joi");
const { status: httpStatus } = require("http-status");
const ApiError = require("../utils/ApiError");

const validate = (schemas) => (req, res, next) => {
  for (const part of ["params", "query", "body"]) {
    if (!schemas[part]) continue;
    const { value, error } = schemas[part].validate(req[part] ?? {}, { abortEarly: false, allowUnknown: true, convert: true });
    if (error) {
      return next(new ApiError(httpStatus.BAD_REQUEST, error.details.map((detail) => detail.message.replace(/"/g, "")).join("; ")));
    }
    if (part === "body") req.body = value;
  }
  next();
};

// A field sent either as an object or as a JSON string of one (multipart forms send JSON as text);
// message is the error when it is neither
const jsonObject = (schema, message) =>
  Joi.alternatives().try(
    schema,
    Joi.string().custom((text, helpers) => {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return helpers.error("any.invalid");
      }
      const { value, error } = schema.validate(parsed, { allowUnknown: true });
      return error ? helpers.error("any.invalid") : value;
    }).messages({ "any.invalid": message }),
  ).messages({ "alternatives.match": message });

module.exports = { validate, jsonObject, Joi };
