/** @format */

const { dayjs, BUSINESS_TZ } = require("../utils/time");

// An instant (Date or ISO string) as New York wall-clock time, "YYYY-MM-DD HH:mm:ss":
// the convention of the attendance *_est columns. Null when missing or invalid.
function convertToEST(value) {
	if (!value) return null;
	const instant = dayjs(value);
	return instant.isValid() ? instant.tz(BUSINESS_TZ).format("YYYY-MM-DD HH:mm:ss") : null;
}

module.exports = convertToEST;
