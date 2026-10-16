// Inspection service: where inspection photos are stored, and removing one

const fs = require("fs");
const { UPLOAD_DIRS } = require("../../../config/storage");
const path = require("path");

const INSPECTION_IMAGES_DIR = UPLOAD_DIRS.images;

// Inspection images are stored as "/<filename>" in InspectionItemImage.image
const deleteInspectionImageFile = (storedImage) => {
  if (!storedImage) return;
  const absolutePath = path.join(INSPECTION_IMAGES_DIR, path.basename(storedImage));
  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }
};

module.exports = { deleteInspectionImageFile };
