/** @format */

// The admin booking service, split by feature in src/services/Admin/booking/
module.exports = {
  ...require("./booking/create"),
  ...require("./booking/manage"),
  ...require("./booking/attendanceAlerts"),
  ...require("./booking/overviews"),
  ...require("./booking/schedules"),
};
