/** @format */

// The admin user service, split by feature in src/services/Admin/user/
module.exports = {
  ...require("./user/accounts"),
  ...require("./user/lists"),
  ...require("./user/employeeBookings"),
  ...require("./user/dashboard"),
  ...require("./user/quotes"),
  ...require("./user/serviceRequests"),
  ...require("./user/messages"),
};
