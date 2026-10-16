const multer = require("multer");
const path = require("path");
const { randomBytes } = require("crypto");
const { status: httpStatus } = require("http-status");
const ApiError = require("../utils/ApiError");
const { LIMITS } = require("./rules");

const PUBLIC_DIR = path.resolve(__dirname, "../../public");

// Largest file accepted in one upload field (images, PDFs, documents)
const MAX_FILE_MB = LIMITS.MAX_UPLOAD_FILE_MB;

// Set storage engine
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === "videos") {
      cb(null, PUBLIC_DIR + "/uploads/videos");
    } else if (file.fieldname === "images") {
      cb(null, PUBLIC_DIR + "/uploads/images");
    } else if (file.fieldname === "gifs") {
      cb(null, PUBLIC_DIR + "/uploads/gifs");
    } else if (file.fieldname === "docs") {
      cb(null, PUBLIC_DIR + "/uploads/docs");
    } else if (file.fieldname === "audios") {
      cb(null, PUBLIC_DIR + "/uploads/audios");
    } else {
      cb(new Error("Invalid fieldname"));
    }
  },

  filename: function (req, file, cb) {
    const ext = getFileExtension(file);
    // the random part keeps two files saved in the same millisecond from overwriting each other
    cb(null, `${file.fieldname}-${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`);
  },
});

// Check file type
function checkFileType(file, cb) {
  const allowedFiletypes = [
    "jpeg",
    "jpg",
    "png",
    "gif",
    "webp",
    "mp4",
    "mov",
    "pdf",
    "mp3",
    "doc",
    "docx",
    "csv",
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();

  const isValidExtension = allowedFiletypes.includes(
    fileExtension.substring(1),
  );

  const isValidMimeType =
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    file.mimetype.startsWith("application/pdf") ||
    file.mimetype.startsWith("audio/") ||
    file.mimetype === "application/msword" ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimetype === "text/csv" ||
    file.mimetype === "application/csv" ||
    file.mimetype === "application/octet-stream";

  if (isValidExtension && isValidMimeType) {
    return cb(null, true);
  }

  cb(
    new ApiError(
      httpStatus.BAD_REQUEST,
      "Only images (.jpeg, .jpg, .png, .gif, .webp), videos (.mp4, .mov), audio (.mp3), documents (.pdf, .doc, .docx) and .csv files can be uploaded.",
    ),
  );
}

function getFileExtension(file) {
  const mimeToExtMap = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/png": "png",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/mov": "mov",
    "application/pdf": "pdf",
    "text/csv": "csv",
    "application/csv": "csv",
    "audio/mpeg": "mp3",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };

  // If MIME type is known, use it
  if (mimeToExtMap[file.mimetype]) {
    return mimeToExtMap[file.mimetype];
  }

  // For application/octet-stream, use original extension
  const originalExtension = path
    .extname(file.originalname)
    .toLowerCase()
    .substring(1);

  return originalExtension || "txt";
}

// Init upload
const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },

  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  },
}).fields([
  { name: "gifs", maxCount: 10 },
  { name: "images", maxCount: 20 },
  { name: "videos", maxCount: 10 },
  { name: "docs", maxCount: 10 },
  { name: "audios", maxCount: 10 },
]);

module.exports = { upload, MAX_FILE_MB };
