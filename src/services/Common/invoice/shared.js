// Invoice service: settings and rules used by more than one part

const { BUSINESS_TZ } = require("../../../utils/time");

const timezone = BUSINESS_TZ;

// The billing date after `billingMoment` (a dayjs) for a recurring frequency; unknown or missing
// frequencies are monthly
const nextBillingAfter = (billingMoment, frequency) => {
  switch (frequency) {
    case "WEEKLY":
      return billingMoment.add(1, "week");
    case "BIWEEKLY":
      return billingMoment.add(2, "weeks");
    case "MONTHLY":
      return billingMoment.add(1, "month");
    case "QUARTERLY":
      return billingMoment.add(3, "months");
    case "YEARLY":
      return billingMoment.add(1, "year");
    default:
      return billingMoment.add(1, "month");
  }
};

module.exports = { timezone, nextBillingAfter };
