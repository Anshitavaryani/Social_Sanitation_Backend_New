const { ACCEPTED } = require("http-status");

const userStatusTypes = {
  ACCEPTED: "ACCEPTED",
  PENDING: "PENDING",
  REJECTED: "REJECTED",
  REVIEWING: "REVIEWING",
  REVIEWED: "REVIEWED",
};

const paymentModeTypes = {
  CREDIT_CARD: "CREDIT_CARD",
  DEBIT_CARD: "DEBIT_CARD",
  PHONE_PAY: "PHONE_PAY",
  GOOGLE_PAY: "GOOGLE_PAY",
  APPLE_PAY: "APPLE_PAY",
  BANK_ACCOUNT: "BANK_ACCOUNT",
  CARD: "CARD",
  UNKNOWN: "UNKNOWN",
};

const otpTypes = {
  EMAIL_VERIFICATION: "email_varification",
  MOBILE_VERIFICATION: "mobile_varification",
  FORGOT_PASSWORD: "forgot_password",
  RESET_PASSWORD: "reset_password",
};

const paymentStatusTypes = {
  PENDING: "PENDING",
  SUCCESS: "SUCCESS",
  REJECTED: "REJECTED",
  REFUNDED: "REFUNDED",
};

const rolesTypes = {
  ADM: "Admin",
  ADM_LEVEL_3: "Admin Level Three",
  ADM_LEVEL_2: "Admin Level Two",
  ADM_LEVEL_1: "Admin Level One",
  BDM: "Business Development Manager",
  USER: "User",
  SUPERVISOR: "Supervisor",
  QUALITY_INSPECTOR: "Quality Inspector",
  CLEANER: "Cleaner",
  SALES_EXECUTIVE:"Sales executive",
  JANITOR:"Janitor",
  HOUSEKEEPPING:"Housekeeping",
};

const bookingTypes = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  ONGOING: "ONGOING",
  SUCCESS: "SUCCESS",
  REJECTED: "REJECTED",
  CANCELLED:"CANCELLED",
  DELETED:"DELETED"
};

const orderTypes = {
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  BOOKED: "BOOKED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
};

const tokenTypes = {
  ACCESS: "access",
  REFRESH: "refresh",
  VERIFY_EMAIL: "email_varification",
  FORGOT_PASSWORD: "forgot_password",
  RESET_PASSWORD: "reset_password",
  SESSION: "session",
};

const currancyTypes = {
  USD: "USD",
  INR: "INR",
  EUR: "EUR",
  OMR: "OMR",
  CHF: "CHF",
  KYD: "KYD",
};

const notificationTypes = {
  SERVICE_BOOKED: "SERVICE BOOKED",
  BOOKING_ACCEPTED: "BOOKING ACCEPTED",
  SERVICE_ASSIGNED:"SERVICE ASSIGNED",
  BOOKING_REJECTED: "BOOKING REJECTED",
  BOOKING_STARTED: "BOOKING STARTED",
  BOOKING_COMPLETED: "BOOKING COMPLETED",
  ORDER_PLACED: "ORDER PLACED",
  ORDER_ACCEPTED: "ORDER ACCEPTED",
  ORDER_SHIPPED: "ORDER SHIPPED",
  ORDER_DELIVERED: "ORDER DELIVERED",
  CHAT_MESSAGE: "CHAT MESSAGE",
};

const leaveStatusTypes = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
};

const reportTypes = {
  ACCEPTED: 'ACCEPTED',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
};

const quoteQuestionTypes = {
  TEXT: "TEXT",
  PARAGRAPH: "PARAGRAPH",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  CHECKBOX: "CHECKBOX",
  DROPDOWN: "DROPDOWN",
  LINEAR_SCALE: "LINEAR_SCALE",
  DATE: "DATE",
  TIME: "TIME",
  FILE_UPLOAD: "FILE_UPLOAD",
};






module.exports = {
  userStatusTypes,
  paymentModeTypes,
  otpTypes,
  paymentStatusTypes,
  rolesTypes,
  bookingTypes,
  tokenTypes,
  currancyTypes,
  orderTypes,
  notificationTypes,
  leaveStatusTypes,
  reportTypes,
  notificationTypes,
  quoteQuestionTypes
};
