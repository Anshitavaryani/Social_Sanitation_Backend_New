/** @format */

const Country = require("./country.model");
const State = require("./state.model");
const City = require("./city.model");
const Timezone = require("./timezone.model");
const Category = require("./category.model");

const Role = require("./role.model");
const Department = require("./department.model");

const Admin = require("./admin.model");
const User = require("./user.model");
const Profile = require("./profile.model");
const UserAddress = require("./userAddress.model.js");
const UserToken = require("./userToken.model");
const UserAttachment = require("./userAttachment.model");
const userLoginTiming = require("./userLoginTiming.model");

const ContactUs = require("./contactUs.model");
const Faq = require("./faq.model");
const OTP = require("./otp.model");

const Payment = require("./payment.model");

const AboutUs = require("./aboutUs.model");
const AboutUsAttachment = require("./aboutUsAttachment.model.js");
const TermsAndConditions = require("./termsAndConditions.model");

const Service = require("./service.model.js");
const ServiceAttachment = require("./serviceAttachment.model.js");
const ServiceChecklistHeading = require("./serviceChecklistHeading.model.js");
const ServiceChecklist = require("./serviceChecklist.model.js");
const ServiceChecklistMapping = require("./serviceChecklistMapping.model.js");
const ServiceReview = require("./serviceReview.model.js");
const Booking = require("./booking.model");
const BookingAssignment = require("./bookingAssignment.model.js");
const BookingAttachment = require("./BookingAttachment.model.js");
const BannerAttachment = require("./bannerAttachment.model.js");
const BookingServiceChecklist = require("./bookingServiceCheckList.model.js");
const DailyChecklist = require("./dailyChecklist.model.js");
const DailySupervisorChecklist = require("./dailySupervisorChecklist.model.js");
const DailyChecklistHeading = require("./dailyChecklistHeading.model.js");
const ClientChecklist = require("./clientChecklist.model.js");
const ClientChecklistDetail = require("./clientChecklistDetails.model.js");
const ServiceQuote = require("./ServiceQuote.model");
const QuoteItem = require("./QuoteItem.model.js");

const Attendance = require("./attendance.model.js");
const Break = require("./break.model.js");

const BDMUser = require("./BDMUser.model.js");

const FormSubmission = require("./formSubmission.model.js");
const FormSection = require("./formSections.model.js");
const FormAttachment = require("./formAttachment.model.js");

const Report = require("./report.model.js");

const Notification = require("./notification.model.js");
const GuestBookingAddress = require("./guestBookingAddress.model.js");

const TrendingVideoAttachment = require("./trendingVideos.model.js");
const ReviewLink = require("./reviewLinks.model.js");

const Product = require("./product.model.js");
const ProductAttachment = require("./productAttachment.model.js");
const ProductRequest = require("./productRequest.model.js");
const ProductRequestAttachment = require("./productRequestAttachment.model.js");

const QuoteFormQuestion = require("./quoteFormQuestion.model.js");
const QuoteFormAnswer = require("./quoteFormAnswer.model.js");
const QuoteRequest = require("./quoteRequest.model.js");
const AttendancePayroll = require("./attendancePayroll.model.js");
const ServiceEstimate = require("./serviceEstimate.model.js");

const Invoice = require("./invoice.model.js");
const InvoiceItem = require("./invoiceItem.model.js");

const ContractAgreement = require("./contractAgreement.model.js");
const ServiceRequest = require("./serviceRequest.model.js");
const ServiceRequestQuoteItem = require("./serviceRequestQuoteItem.model.js");

const UserConsent = require("./userConsent.model.js");
const ScopeSection = require("./scopeSection.model.js");
const ScopeItem = require("./scopeItem.model.js");
const UserScopeSection = require("./userScopeSection.model.js");
const UserScopeItem = require("./userScopeItem.model.js");
const CostCalculation = require("./CostCalculation.js");
const CostCalculationTask = require("./CostCalculationTask.js");
const BidMaximizer = require("./BidMaximizer.js");
const CostCalculationSetting = require("./costCalculationSetting.model.js");

const Equipment = require("./equipment.model.js");
const EmployeeEquipmentAssignment = require("./employeeEquipmentAssignment.model.js");
const InvoiceRecurring = require("./InvoiceRecurring.model.js");
const EmployeeEquipmentSignature = require("./EmployeeEquipmentSignature.js");
const Inspection = require("./inspection.model.js");
const InspectionItem = require("./inspectionItem.model.js");
const InspectionItemImage = require("./inspectionItemImage.model.js");
const InspectionSectionReview = require("./inspectionSectionReview.model.js");

module.exports = {
  Country,
  State,
  City,
  Timezone,
  Category,

  Role,
  Department,

  Admin,
  User,
  Profile,
  UserAddress,
  UserToken,
  UserAttachment,
  userLoginTiming,

  ContactUs,
  Faq,
  OTP,

  Payment,

  AboutUs,
  AboutUsAttachment,
  TermsAndConditions,

  Service,
  ServiceAttachment,
  ServiceChecklistHeading,
  ServiceChecklist,
  ServiceChecklistMapping,
  ServiceReview,
  Booking,
  BannerAttachment,
  BookingAssignment,
  BookingAttachment,
  BookingServiceChecklist,

  Attendance,
  Break,

  BDMUser,
  FormSubmission,
  FormSection,
  FormAttachment,
  Report,
  DailyChecklist,
  DailySupervisorChecklist,
  DailyChecklistHeading,
  ClientChecklist,
  ClientChecklistDetail,
  ServiceQuote,
  QuoteItem,

  Notification,
  GuestBookingAddress,
  TrendingVideoAttachment,
  ReviewLink,

  Product,
  ProductAttachment,
  ProductRequest,
  ProductRequestAttachment,
  QuoteFormQuestion,
  QuoteFormAnswer,
  QuoteRequest,
  AttendancePayroll,
  ServiceEstimate,
  Invoice,
  InvoiceItem,
  InvoiceRecurring,

  ContractAgreement,
  UserConsent,

  ScopeSection,
  ScopeItem,

  UserScopeSection,
  UserScopeItem,

  CostCalculation,
  CostCalculationTask,
  BidMaximizer,
  CostCalculationSetting,

  Equipment,
  EmployeeEquipmentAssignment,
  EmployeeEquipmentSignature,

  Inspection,
  InspectionItem,
  InspectionItemImage,
  InspectionSectionReview,
};

async function initTableRelation() {
  Country.hasMany(State, { foreignKey: "country_id", as: "all_state" });
  State.belongsTo(Country, { foreignKey: "country_id", as: "country" });

  Country.hasMany(City, { foreignKey: "country_id", as: "all_city" });
  City.belongsTo(Country, { foreignKey: "country_id", as: "country" });

  State.hasMany(City, { foreignKey: "state_id", as: "all_city" });
  City.belongsTo(State, { foreignKey: "state_id", as: "state" });

  Role.hasMany(Admin, { foreignKey: "role_id", as: "role_admins" });
  Admin.belongsTo(Role, { foreignKey: "role_id", as: "admin_role" });

  Role.hasMany(User, { foreignKey: "role_id", as: "role_user" });
  User.belongsTo(Role, { foreignKey: "role_id", as: "user_role" });

  Department.hasMany(Admin, {
    foreignKey: "department_id",
    as: "department_admins",
  });
  Admin.belongsTo(Department, {
    foreignKey: "department_id",
    as: "admin_department",
  });

  User.hasOne(Profile, { foreignKey: "user_id", as: "user_profile" });
  Profile.belongsTo(User, { foreignKey: "user_id", as: "profile_user" });

  UserAddress.hasOne(Booking, {
    foreignKey: "address_id",
    as: "address_booking",
  });
  Booking.belongsTo(UserAddress, {
    foreignKey: "address_id",
    as: "booking_address",
  });

  User.hasMany(UserAttachment, {
    foreignKey: "user_id",
    as: "user_attachments",
  });
  UserAttachment.belongsTo(User, {
    foreignKey: "user_id",
    as: "attachments_user",
  });

  Booking.hasMany(BookingAttachment, {
    foreignKey: "booking_id",
    as: "booking_attachment",
  });
  BookingAttachment.belongsTo(Booking, {
    foreignKey: "booking_id",
    as: "attachments_booking",
  });

  User.hasMany(UserAddress, {
    foreignKey: "user_id",
    as: "user_address",
  });
  UserAddress.belongsTo(User, {
    foreignKey: "user_id",
    as: "address_user",
  });

  User.hasMany(BookingAssignment, {
    foreignKey: "employee_id",
    as: "profile_employee",
  });
  BookingAssignment.belongsTo(User, {
    foreignKey: "employee_id",
    as: "employee_profile",
  });

  Booking.hasMany(BookingAssignment, {
    foreignKey: "booking_id",
    as: "booking_employee_details",
  });
  BookingAssignment.belongsTo(Booking, {
    foreignKey: "booking_id",
    as: "employee_details_booking",
  });

  User.hasMany(UserToken, { foreignKey: "user_id", as: "user_tokens" });
  UserToken.belongsTo(User, { foreignKey: "user_id", as: "token_user" });

  User.hasMany(userLoginTiming, { foreignKey: "user_id", as: "user_login" });
  userLoginTiming.belongsTo(User, { foreignKey: "user_id", as: "login_user" });

  User.hasMany(Booking, { foreignKey: "user_id", as: "user_booking" });
  Booking.belongsTo(User, { foreignKey: "user_id", as: "booking_user" });

  Service.hasMany(Booking, { foreignKey: "service_id", as: "booking_service" });
  Booking.belongsTo(Service, {
    foreignKey: "service_id",
    as: "service_booking",
  });

  AboutUs.hasMany(AboutUsAttachment, {
    foreignKey: "about_us_id",
    as: "aboutUs_attachments",
  });
  AboutUsAttachment.belongsTo(AboutUs, {
    foreignKey: "about_us_id",
    as: "attachments_aboutUs",
  });

  Service.hasMany(ServiceAttachment, {
    foreignKey: "service_id",
    as: "service_attachments",
  });
  ServiceAttachment.belongsTo(Service, {
    foreignKey: "service_id",
    as: "attachments_service",
  });

  ServiceChecklistHeading.hasMany(ServiceChecklist, {
    foreignKey: "heading_id",
    as: "service_checklists",
  });

  ServiceChecklist.belongsTo(ServiceChecklistHeading, {
    foreignKey: "heading_id",
    as: "checklists",
  });

  Service.belongsToMany(ServiceChecklist, {
    through: "ServiceChecklistMapping",
    foreignKey: "service_id",
    as: "service_checklist",
  });

  ServiceChecklist.belongsToMany(Service, {
    through: "ServiceChecklistMapping",
    foreignKey: "service_checklist_id",
    as: "checklist_service",
  });

  Service.hasMany(ServiceChecklistMapping, {
    foreignKey: "service_id",
    as: "service_mapping_service_chechklist",
  });

  // ServiceChecklistMapping Model (If you have not defined it yet)
  ServiceChecklistMapping.belongsTo(Service, {
    foreignKey: "service_id",
    as: "service_mapping_service",
  });

  ServiceChecklistMapping.belongsTo(ServiceChecklist, {
    foreignKey: "service_checklist_id",
    as: "service_checklist",
  });

  ServiceChecklistMapping.belongsTo(BookingServiceChecklist, {
    foreignKey: "service_checklist_id",
    as: "booking_checklist",
  });

  ServiceChecklist.hasMany(ServiceChecklistMapping, {
    as: "service_mapping",
    foreignKey: "service_checklist_id",
  });

  ServiceChecklist.hasOne(BookingServiceChecklist, {
    as: "booking_checklist",
    foreignKey: "service_checklist_id",
  });

  DailyChecklistHeading.hasMany(DailyChecklist, {
    foreignKey: "heading_id",
    as: "daily_task",
  });

  DailyChecklist.belongsTo(DailyChecklistHeading, {
    foreignKey: "heading_id",
    as: "tasks",
  });

  // In DailyChecklist.js
  DailyChecklist.hasMany(DailySupervisorChecklist, {
    as: "supervisor_checklist",
    foreignKey: "service_checklist_id",
  });

  // In DailyChecklistHeading.js
  DailyChecklistHeading.hasMany(DailyChecklist, {
    as: "daily_tasks",
    foreignKey: "heading_id",
  });

  Service.hasMany(ServiceReview, {
    foreignKey: "service_id",
    as: "service_reviews",
  });
  ServiceReview.belongsTo(Service, {
    foreignKey: "service_id",
    as: "reviews_service",
  });

  User.hasMany(ServiceReview, {
    foreignKey: "user_id",
    as: "user_reviews",
  });
  ServiceReview.belongsTo(User, {
    foreignKey: "user_id",
    as: "reviews_user",
  });

  UserAddress.belongsTo(Country, {
    foreignKey: "country_id",
    as: "user_country",
  });
  Country.hasMany(UserAddress, {
    foreignKey: "country_id",
    as: "country_user",
  });

  UserAddress.belongsTo(State, { foreignKey: "state_id", as: "user_state" });
  State.hasMany(UserAddress, { foreignKey: "state_id", as: "state_user" });

  UserAddress.belongsTo(City, { foreignKey: "city_id", as: "user_city" });
  City.hasMany(UserAddress, { foreignKey: "city_id", as: "city_user" });

  User.hasMany(BDMUser, { foreignKey: "user_id", as: "bdm_users" });
  BDMUser.belongsTo(User, { foreignKey: "user_id", as: "user_bdm" });

  Booking.belongsTo(Admin, { foreignKey: "bdm_id", as: "bdm_details" });
  Admin.hasMany(Booking, { foreignKey: "bdm_id", as: "bdm_bookings" });

  FormSection.belongsTo(FormSubmission, {
    foreignKey: "submission_id",
    as: "form_Submission_details",
  });
  FormSubmission.hasMany(FormSection, {
    foreignKey: "submission_id",
    as: "details_form_submission",
  });

  // "attendence" (sic) in these aliases: they are keys in API responses the apps and the panel read
  User.hasMany(Attendance, { foreignKey: "user_id", as: "user_attendence" });
  Attendance.belongsTo(User, { foreignKey: "user_id", as: "attendence_user" });

  User.hasMany(Report, { foreignKey: "reported_by", as: "user_reports" });
  Report.belongsTo(User, { foreignKey: "reported_by", as: "report_user" });

  User.hasMany(Report, { foreignKey: "reported_to", as: "counselor_reports" });
  Report.belongsTo(User, { foreignKey: "reported_to", as: "report_counselor" });

  Booking.hasMany(Report, { foreignKey: "booking_id", as: "booking_reports" });
  Report.belongsTo(Booking, { foreignKey: "booking_id", as: "report_booking" });

  BookingAttachment.hasMany(Report, {
    foreignKey: "booking_id",
    as: "booking_attachment_reports",
  });
  Report.belongsTo(BookingAttachment, {
    foreignKey: "booking_id",
    as: "report_booking_attachment",
  });

  Booking.hasMany(Payment, {
    foreignKey: "booking_id",
    as: "booking_payment",
  });

  Payment.belongsTo(Booking, {
    foreignKey: "booking_id",
    as: "payment_booking",
  });

  User.hasMany(Payment, {
    foreignKey: "user_id",
    as: "user_payment",
  });

  Payment.belongsTo(User, {
    foreignKey: "user_id",
    as: "payment_user",
  });

  User.hasMany(Notification, {
    foreignKey: "user_id",
    as: "user_notification",
  });
  Notification.belongsTo(User, {
    foreignKey: "user_id",
    as: "notification_user",
  });

  User.hasMany(ClientChecklist, {
    foreignKey: "user_id",
    as: "user_client_checklist",
  });
  ClientChecklist.belongsTo(User, {
    foreignKey: "user_id",
    as: "client_checklist_user",
  });

  ClientChecklist.hasMany(ClientChecklistDetail, {
    foreignKey: "checklist_id",
    as: "user_client_checklist_details",
  });
  ClientChecklistDetail.belongsTo(ClientChecklist, {
    foreignKey: "checklist_id",
    as: "details_client_checklist_user",
  });

  Booking.hasMany(GuestBookingAddress, {
    foreignKey: "booking_id",
    as: "booking_non_client_address",
  });
  GuestBookingAddress.belongsTo(Booking, {
    foreignKey: "booking_id",
    as: "non_client_booking_address",
  });

  GuestBookingAddress.belongsTo(Country, {
    foreignKey: "country_id",
    as: "non_client_user_country",
  });
  Country.hasMany(GuestBookingAddress, {
    foreignKey: "country_id",
    as: "non_client_country_user",
  });

  GuestBookingAddress.belongsTo(State, {
    foreignKey: "state_id",
    as: "non_client_user_state",
  });
  State.hasMany(GuestBookingAddress, {
    foreignKey: "state_id",
    as: "non_client_state_user",
  });

  GuestBookingAddress.belongsTo(City, {
    foreignKey: "city_id",
    as: "non_client_user_city",
  });
  City.hasMany(GuestBookingAddress, {
    foreignKey: "city_id",
    as: "non_client_city_user",
  });

  Attendance.hasMany(Break, {
    foreignKey: "attendance_id",
    as: "break_attendence",
  });
  Break.belongsTo(Attendance, {
    foreignKey: "attendance_id",
    as: "attendence_break",
  });

  ServiceQuote.hasMany(QuoteItem, {
    foreignKey: "quote_id",
    as: "service_quote_item",
  });
  QuoteItem.belongsTo(ServiceQuote, { foreignKey: "quote_id", as: "items" });

  ServiceQuote.belongsTo(User, {
    foreignKey: "user_id",
    as: "payment_user",
  });

  User.hasMany(ProductRequest, {
    foreignKey: "employee_id",
    as: "user_request",
  });
  ProductRequest.belongsTo(User, {
    foreignKey: "employee_id",
    as: "requested_user",
  });

  Product.hasMany(ProductRequest, {
    foreignKey: "product_id",
    as: "product_request",
  });
  ProductRequest.belongsTo(Product, {
    foreignKey: "product_id",
    as: "requested_product",
  });

  Product.hasMany(ProductAttachment, {
    foreignKey: "product_id",
    as: "product_attachments",
  });
  ProductAttachment.belongsTo(Product, {
    foreignKey: "product_id",
    as: "attachment_product",
  });

  ProductRequest.hasMany(ProductRequestAttachment, {
    foreignKey: "product_request_id",
    as: "product_request_attachments",
  });
  ProductRequestAttachment.belongsTo(ProductRequest, {
    foreignKey: "product_request_id",
    as: "attachement_requested_product",
  });

  QuoteRequest.hasMany(QuoteFormAnswer, {
    foreignKey: "quote_request_id",
    as: "answers",
  });

  QuoteFormAnswer.belongsTo(QuoteRequest, {
    foreignKey: "quote_request_id",
    as: "quote_request",
  });

  QuoteFormQuestion.hasMany(QuoteFormAnswer, {
    foreignKey: "question_id",
    as: "answers",
  });

  QuoteFormAnswer.belongsTo(QuoteFormQuestion, {
    foreignKey: "question_id",
    as: "question",
  });

  User.hasMany(QuoteRequest, {
    foreignKey: "user_id",
    as: "quote_requests",
  });

  QuoteRequest.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  Attendance.hasOne(AttendancePayroll, {
    foreignKey: "attendance_id",
    as: "payroll",
  });

  AttendancePayroll.belongsTo(Attendance, {
    foreignKey: "attendance_id",
    as: "attendance",
  });

  Invoice.hasMany(InvoiceItem, {
    foreignKey: "invoice_id",
    as: "service_invoice_item",
  });
  InvoiceItem.belongsTo(Invoice, { foreignKey: "invoice_id", as: "items" });

  Invoice.belongsTo(User, {
    foreignKey: "user_id",
    as: "invoices_user",
  });

  User.belongsTo(Admin, {
    foreignKey: "assigned_to",
    as: "account_manager",
  });

  ServiceRequest.hasMany(ServiceRequestQuoteItem, {
    foreignKey: "service_request_id",
    as: "service_request_quote_item",
  });
  ServiceRequestQuoteItem.belongsTo(ServiceRequest, {
    foreignKey: "service_request_id",
    as: "service_request",
  });

  ServiceRequest.belongsTo(User, {
    foreignKey: "user_id",
    as: "request_user",
  });

  ScopeSection.hasMany(ScopeItem, {
    foreignKey: "section_id",
    as: "items",
  });

  ScopeItem.belongsTo(ScopeSection, {
    foreignKey: "section_id",
    as: "section",
  });

  BDMUser.belongsTo(Admin, {
    foreignKey: "bdm_id",
    as: "bdm",
  });

  Admin.hasMany(BDMUser, {
    foreignKey: "bdm_id",
    as: "bdm_users",
  });

  UserScopeSection.hasMany(UserScopeItem, {
    foreignKey: "user_scope_section_id",
    as: "items",
  });

  UserScopeItem.belongsTo(UserScopeSection, {
    foreignKey: "user_scope_section_id",
    as: "section",
  });

  CostCalculation.hasMany(CostCalculationTask, {
    foreignKey: "calculation_id",
    as: "custom_tasks",
  });

  CostCalculationTask.belongsTo(CostCalculation, {
    foreignKey: "calculation_id",
    as: "calculation",
  });

  CostCalculation.hasOne(BidMaximizer, {
    foreignKey: "cost_calculation_id",
    as: "bid_details",
  });

  BidMaximizer.belongsTo(CostCalculation, {
    foreignKey: "cost_calculation_id",
    as: "cost_calculation",
  });

  // Employee <-> Equipment Assignment

  User.hasMany(EmployeeEquipmentAssignment, {
    foreignKey: "employee_id",
    as: "user_equipment_assignments",
  });

  EmployeeEquipmentAssignment.belongsTo(User, {
    foreignKey: "employee_id",
    as: "equipment_assignment_user",
  });

  // Equipment <-> Equipment Assignment

  Equipment.hasMany(EmployeeEquipmentAssignment, {
    foreignKey: "equipment_id",
    as: "equipment_assignments",
  });

  EmployeeEquipmentAssignment.belongsTo(Equipment, {
    foreignKey: "equipment_id",
    as: "assignment_equipment",
  });

  Invoice.hasOne(InvoiceRecurring, {
    foreignKey: "invoice_id",
    as: "recurring",
  });

  InvoiceRecurring.belongsTo(Invoice, {
    foreignKey: "invoice_id",
    as: "invoice",
  });

  User.hasMany(InvoiceRecurring, {
    foreignKey: "user_id",
    as: "invoice_recurring",
  });

  InvoiceRecurring.belongsTo(User, {
    foreignKey: "user_id",
    as: "user",
  });

  EmployeeEquipmentAssignment.hasMany(EmployeeEquipmentSignature, {
    foreignKey: "assignment_id",
    as: "equipment_signatures",
  });

  EmployeeEquipmentSignature.belongsTo(EmployeeEquipmentAssignment, {
    foreignKey: "assignment_id",
    as: "signature_assignment",
  });

  User.hasMany(EmployeeEquipmentSignature, {
    foreignKey: "employee_id",
    as: "employee_equipment_signatures",
  });

  EmployeeEquipmentSignature.belongsTo(User, {
    foreignKey: "employee_id",
    as: "signature_employee",
  });

  Inspection.hasMany(InspectionItem, {
    foreignKey: "inspection_id",
    as: "items",
  });

  InspectionItem.belongsTo(Inspection, {
    foreignKey: "inspection_id",
    as: "inspection",
  });

  Inspection.hasMany(InspectionSectionReview, {
    foreignKey: "inspection_id",
    as: "section_reviews",
  });

  InspectionSectionReview.belongsTo(Inspection, {
    foreignKey: "inspection_id",
    as: "inspection",
  });

  InspectionItem.hasMany(InspectionItemImage, {
    foreignKey: "inspection_item_id",
    as: "images",
  });

  InspectionItemImage.belongsTo(InspectionItem, {
    foreignKey: "inspection_item_id",
    as: "item",
  });

  Inspection.hasMany(InspectionItemImage, {
    foreignKey: "inspection_id",
    as: "images",
  });

  InspectionItemImage.belongsTo(Inspection, {
    foreignKey: "inspection_id",
    as: "inspection",
  });

  Inspection.belongsTo(User, {
    foreignKey: "user_id",
    as: "client",
  });

  Inspection.belongsTo(User, {
    foreignKey: "employee_id",
    as: "employee",
  });
}

/* Only Uncomment when data migration will complete */
initTableRelation();
