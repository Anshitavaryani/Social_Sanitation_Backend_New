
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

// bookings.booking_status. DELETED and RESCHEDULED are not in the column's ENUM, so the list
// filters that include them never match a row (audit doc).
const bookingTypes = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  ONGOING: "ONGOING",
  SUCCESS: "SUCCESS",
  REJECTED: "REJECTED",
  CANCELLED:"CANCELLED",
  DELETED:"DELETED",
  RESCHEDULED: "RESCHEDULED",
};

// Booking list filters the apps and the panel ask for besides the stored statuses
const bookingListFilterTypes = {
  UPCOMING: "UPCOMING",
  COMPLETED: "COMPLETED",
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

// payment_status of invoices, quotes and service requests (payments and bookings use paymentStatusTypes)
const invoicePaymentStatusTypes = {
  NOT_PAID: "NOT_PAID",
  PAID: "PAID",
  CASH_PAID: "CASH_PAID",
  CHECK_PAID: "CHECK_PAID",
  ACH_PAID: "ACH_PAID",
};

// invoices.payment_stage
const invoicePaymentStageTypes = {
  FULL: "FULL",
  DEPOSIT_PENDING: "DEPOSIT_PENDING",
  DEPOSIT_PAID: "DEPOSIT_PAID",
  BALANCE_PENDING: "BALANCE_PENDING",
  COMPLETED: "COMPLETED",
};

// payments.payment_purpose: the part of an invoice a payment covers
const paymentPurposeTypes = {
  FULL: "FULL",
  DEPOSIT: "DEPOSIT",
  BALANCE: "BALANCE",
};

// Square's own payment statuses, as sent in its webhooks
const squarePaymentStatusTypes = {
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
};

// invoices.status
const invoiceStatusTypes = {
  ACTIVE: "ACTIVE",
  CANCELLED: "CANCELLED",
};

// invoice_recurrings.status
const recurringInvoiceStatusTypes = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

// status of quotes and service requests (SIGNED: service requests only)
const quoteStatusTypes = {
  DRAFT: "DRAFT",
  SAVED: "SAVED",
  SIGNED: "SIGNED",
};

// job_status of quotes and service requests
const jobStatusTypes = {
  NOT_BOOKED: "NOT_BOOKED",
  BOOKED: "BOOKED",
  EXPIRED: "EXPIRED",
};

// status of service estimates and contract agreements (DocuSign signing)
const contractStatusTypes = {
  DRAFT: "draft",
  PENDING_SIGNATURE: "pending_signature",
  SIGNED: "signed",
  DECLINED: "declined",
  VOIDED: "voided",
  FAILED: "failed",
};

// inspections.status
const inspectionStatusTypes = {
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  COMPLETED: "COMPLETED",
  REOPENED: "REOPENED",
  CANCELLED: "CANCELLED",
};

// The BDM's review of an inspection item or section
const inspectionReviewStatusTypes = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  ISSUE: "ISSUE",
};

// employee_equipment_assignments.status
const equipmentAssignmentStatusTypes = {
  ASSIGNED: "ASSIGNED",
  PARTIALLY_RETURNED: "PARTIALLY_RETURNED",
  RETURNED: "RETURNED",
  OVERDUE: "OVERDUE",
  LOST: "LOST",
};

// employee_equipment_signatures.action
const equipmentSignatureActionTypes = {
  ASSIGNED: "ASSIGNED",
  PARTIAL_RETURN: "PARTIAL_RETURN",
  FULL_RETURN: "FULL_RETURN",
};

// Whether an employee has signed the current version of an equipment assignment
const equipmentSignatureStatusTypes = {
  PENDING: "PENDING",
  SIGNED: "SIGNED",
};

// An employee's attendance status for a day, worked out from the booking and the clock-in
const attendanceStatusTypes = {
  PENDING: "PENDING",
  PRESENT: "PRESENT",
  LATE: "LATE",
  ABSENT: "ABSENT",
};

// breaks.status
const breakStatusTypes = {
  ACTIVE: "active",
  COMPLETED: "completed",
};

// quote_requests.status
const quoteRequestStatusTypes = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
};

// product_requests.status
const productRequestStatusTypes = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
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
  bookingListFilterTypes,
  invoicePaymentStatusTypes,
  invoicePaymentStageTypes,
  paymentPurposeTypes,
  squarePaymentStatusTypes,
  invoiceStatusTypes,
  recurringInvoiceStatusTypes,
  quoteStatusTypes,
  jobStatusTypes,
  contractStatusTypes,
  inspectionStatusTypes,
  inspectionReviewStatusTypes,
  equipmentAssignmentStatusTypes,
  equipmentSignatureActionTypes,
  equipmentSignatureStatusTypes,
  attendanceStatusTypes,
  breakStatusTypes,
  quoteRequestStatusTypes,
  productRequestStatusTypes,
  tokenTypes,
  currancyTypes,
  notificationTypes,
  leaveStatusTypes,
  reportTypes,
  quoteQuestionTypes,
};
