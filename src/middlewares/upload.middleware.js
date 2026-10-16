// Multipart uploads (src/config/multer.js) are parsed by the route's access middleware once the
// token has been accepted (publicRoute parses straight away), so a request without a valid token
// never writes a file to disk. Upload problems become JSON errors: 413 for a file over the size
// limit, 400 for a file type or field that is not accepted.
const multer = require("multer");
const { status: httpStatus } = require("http-status");

const { upload, MAX_FILE_MB } = require("../config/multer");
const ApiError = require("../utils/ApiError");

// Routes that read their multipart body with their own parser
const OWN_PARSER_PATHS = new Set(["/api/v1/invoice/import-historical-csv"]);

const PARSED = Symbol("uploadsParsed");

const uploadError = (err) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new ApiError(httpStatus.REQUEST_ENTITY_TOO_LARGE, `File too large. Each file can be up to ${MAX_FILE_MB} MB.`);
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return new ApiError(httpStatus.BAD_REQUEST, `Too many files, or an unexpected file field: ${err.field}`);
    }
    return new ApiError(httpStatus.BAD_REQUEST, err.message);
  }
  return err;
};

// Parses the request's multipart body once; resolves straight away for other requests
const parseUploads = (req, res) =>
  new Promise((resolve, reject) => {
    if (req[PARSED] || OWN_PARSER_PATHS.has(req.originalUrl.split("?")[0])) return resolve();
    req[PARSED] = true;
    upload(req, res, (err) => (err ? reject(uploadError(err)) : resolve()));
  });

module.exports = { parseUploads };
