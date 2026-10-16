// Where uploaded and generated files live, and the public URLs they are served at. multer saves
// into these folders, app.js serves them, and every file link is built here from API_BASE_URL
// (tests/companyStorage.test.js keeps upload paths and file links out of other files).
const fs = require("fs");
const path = require("path");
const config = require("./config");

const PUBLIC_DIR = path.resolve(__dirname, "../../public");

// Where files were kept before STORAGE_DIR existed; app.js still serves it as a fallback while
// the files are copied across (audit: file storage migration)
const LEGACY_UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");

// STORAGE_DIR keeps uploads outside the deploy folder; without it they stay in public/uploads
const UPLOADS_DIR = config.storageDir ? path.join(path.resolve(config.storageDir), "uploads") : LEGACY_UPLOADS_DIR;

// Upload folders by form field (only images and docs are used today)
const UPLOAD_FOLDERS = Object.freeze(["images", "videos", "gifs", "docs", "audios"]);
const UPLOAD_DIRS = Object.freeze(Object.fromEntries(UPLOAD_FOLDERS.map((folder) => [folder, path.join(UPLOADS_DIR, folder)])));
const LEGACY_UPLOAD_DIRS = Object.freeze(Object.fromEntries(UPLOAD_FOLDERS.map((folder) => [folder, path.join(LEGACY_UPLOADS_DIR, folder)])));

// URL path the whole uploads folder is also served at: /uploads/images/<file>
const UPLOADS_URL_PATH = "/uploads";

// Creates the upload folders (multer does not); run once at start-up
const ensureUploadDirs = () => {
  for (const dir of Object.values(UPLOAD_DIRS)) fs.mkdirSync(dir, { recursive: true });
};

// Fixed images used by PDFs and emails (the logo, estimate photos), kept in the repository and
// served at /api/v1/assets
const ASSETS_DIR = path.join(PUBLIC_DIR, "assets");

// file_uri stored with an uploaded image; its URL is <file_uri>/<file_name>
const IMAGE_FILE_URI = "/images";

// Public URL of a generated or uploaded document (PDFs): <API_BASE_URL>/docs/<file>
const docUrl = (fileName) => `${config.apiBaseUrl}/docs/${fileName}`;

// Public URL of a fixed image, for emails
const assetUrl = (fileName) => `${config.apiBaseUrl}/assets/${fileName}`;

const MIME_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png" };
const dataUris = new Map();

// A fixed image as a data URI, so PDFs need no network to show it (read once)
const assetDataUri = (fileName) => {
  if (!dataUris.has(fileName)) {
    const file = fs.readFileSync(path.join(ASSETS_DIR, fileName));
    dataUris.set(fileName, `data:${MIME_TYPES[path.extname(fileName)]};base64,${file.toString("base64")}`);
  }
  return dataUris.get(fileName);
};

module.exports = {
  PUBLIC_DIR,
  UPLOADS_DIR,
  LEGACY_UPLOADS_DIR,
  UPLOADS_URL_PATH,
  UPLOAD_FOLDERS,
  UPLOAD_DIRS,
  LEGACY_UPLOAD_DIRS,
  ensureUploadDirs,
  ASSETS_DIR,
  IMAGE_FILE_URI,
  docUrl,
  assetUrl,
  assetDataUri,
};
