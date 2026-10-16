// Where uploaded and generated files live, and the public URLs they are served at. multer saves
// into these folders, app.js serves them, and every file link is built here from API_BASE_URL
// (tests/companyStorage.test.js keeps upload paths and file links out of other files).
const fs = require("fs");
const path = require("path");
const config = require("./config");

const PUBLIC_DIR = path.resolve(__dirname, "../../public");
const UPLOADS_DIR = path.join(PUBLIC_DIR, "uploads");

// Upload folders by form field. Only images and docs are used today; audio is saved to audios/
// but app.js serves songs/, as before.
const UPLOAD_DIRS = Object.freeze({
  images: path.join(UPLOADS_DIR, "images"),
  videos: path.join(UPLOADS_DIR, "videos"),
  gifs: path.join(UPLOADS_DIR, "gifs"),
  docs: path.join(UPLOADS_DIR, "docs"),
  audios: path.join(UPLOADS_DIR, "audios"),
  songs: path.join(UPLOADS_DIR, "songs"),
});

// Upload folders app.js serves at /api/v1/<folder> and /<folder>
const SERVED_UPLOAD_FOLDERS = Object.freeze(["images", "videos", "gifs", "docs", "songs"]);

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
  UPLOAD_DIRS,
  SERVED_UPLOAD_FOLDERS,
  ASSETS_DIR,
  IMAGE_FILE_URI,
  docUrl,
  assetUrl,
  assetDataUri,
};
