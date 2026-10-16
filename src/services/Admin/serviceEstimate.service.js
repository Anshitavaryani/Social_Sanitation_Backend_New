/** @format */

// The service estimate service, split by feature in src/services/Admin/serviceEstimate/
module.exports = {
  ...require("./serviceEstimate/estimates"),
  ...require("./serviceEstimate/contracts"),
  ...require("./serviceEstimate/masterScope"),
  ...require("./serviceEstimate/userScope"),
  ...require("./serviceEstimate/estimateScope"),
};
