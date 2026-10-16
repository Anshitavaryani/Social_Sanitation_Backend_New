// The inspection service, split by feature in src/services/Common/inspection/
module.exports = {
  ...require("./inspection/inspections"),
  ...require("./inspection/workflow"),
  ...require("./inspection/images"),
};
