const multer = require("multer");
const path = require("path");

const PUBLIC_DIR = path.resolve(__dirname, "../../public");

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
    cb(null, `${file.fieldname}-${Date.now()}.${ext}`);
  },
});

// Check file type
function checkFileType(file, cb) {
  console.log("file11111", file);

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
    "Error: Images(.jpeg, .jpg, .png, .gif, .webp), videos(.mp4, .mov), Audio(.mp3), and File(.pdf, .doc, .docx) only allow!",
  );
}

function getFileExtension(file) {
  console.log("file", file);

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

module.exports = upload;
