// Which records an app user may reach by id (audit row 2). Admins pass every check. Clients reach
// their own bookings, invoices, addresses and reviews; employees the bookings they are assigned to
// (and those clients' addresses) and their own records; supervisors and quality inspectors also
// read other employees' records and any booking. A refusal is a 403, or, with
// OWNERSHIP_CHECKS=report, only a logged warning (a way to switch the checks off without a deploy).
// A missing id or record is left to the handler, which answers as it did before.
const { status: httpStatus } = require("http-status");
const { Booking, BookingAssignment, Invoice, UserAddress, Inspection, ServiceReview } = require("../models");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const logger = require("../config/logger");
const config = require("../config/config");
const { ROLE } = require("../config/roles");

const STAFF_READERS = [ROLE.SUPERVISOR, ROLE.QUALITY_INSPECTOR];

const same = (a, b) => a !== undefined && a !== null && Number(a) === Number(b);
const isStaffReader = (user) => STAFF_READERS.includes(Number(user.role_id));

const isAssigned = async (bookingIds, user) =>
  (await BookingAssignment.count({ where: { booking_id: bookingIds, employee_id: user.id } })) > 0;

// guard(name, idOf, allowed): idOf(req) gives the record id; allowed(id, user) resolves true, false,
// or null when there is no such record (left to the handler)
const guard = (name, idOf, allowed) =>
  catchAsync(async (req, res, next) => {
    const user = req.body.user;
    if (req.body.user_type === "ADMIN" || !user) return next();

    const id = idOf(req);
    if (id === undefined || id === null || id === "") return next();

    const verdict = await allowed(id, user);
    if (verdict !== false) return next();

    logger.warn(`Ownership: app user ${user.id} (role ${user.role_id}) refused ${req.method} ${req.originalUrl} (${name} ${id})`);
    if (config.ownershipChecks === "report") return next();
    throw new ApiError(httpStatus.FORBIDDEN, "You can only access your own records.");
  });

const param = (key) => (req) => req.params[key];
const bodyField = (key) => (req) => req.body[key];

// A booking: its client, an employee assigned to it, or a supervisor / quality inspector
const readBooking = (idOf) =>
  guard("booking", idOf, async (id, user) => {
    const booking = await Booking.findByPk(id, { attributes: ["id", "user_id"] });
    if (!booking) return null;
    return same(booking.user_id, user.id) || isStaffReader(user) || isAssigned([booking.id], user);
  });

// Working on a booking (status, checklist, photos): an employee assigned to it, or a supervisor /
// quality inspector
const workOnBooking = (idOf) =>
  guard("booking", idOf, async (id, user) => {
    const booking = await Booking.findByPk(id, { attributes: ["id"] });
    if (!booking) return null;
    return isStaffReader(user) || isAssigned([booking.id], user);
  });

// An invoice: its client
const readInvoice = (idOf) =>
  guard("invoice", idOf, async (id, user) => {
    const invoice = await Invoice.findByPk(id, { attributes: ["id", "user_id"] });
    if (!invoice) return null;
    return same(invoice.user_id, user.id);
  });

// One user's own list (invoices by user id): only that user
const selfOnly = (idOf) => guard("user", idOf, async (id, user) => same(id, user.id));

// An address: its owner, a supervisor / quality inspector, or an employee assigned to a booking
// at that address
const readAddress = (idOf) =>
  guard("address", idOf, async (id, user) => {
    const address = await UserAddress.findByPk(id, { attributes: ["id", "user_id"] });
    if (!address) return null;
    if (same(address.user_id, user.id) || isStaffReader(user)) return true;
    const bookings = await Booking.findAll({ where: { address_id: address.id }, attributes: ["id"] });
    return bookings.length > 0 && isAssigned(bookings.map((b) => b.id), user);
  });

// Changing an address: its owner
const editAddress = (idOf) =>
  guard("address", idOf, async (id, user) => {
    const address = await UserAddress.findByPk(id, { attributes: ["id", "user_id"] });
    if (!address) return null;
    return same(address.user_id, user.id);
  });

// A client's addresses (by user id): the client, a supervisor / quality inspector, or an employee
// assigned to one of the client's bookings
const readUserAddresses = (idOf) =>
  guard("user", idOf, async (id, user) => {
    if (same(id, user.id) || isStaffReader(user)) return true;
    const bookings = await Booking.findAll({ where: { user_id: id }, attributes: ["id"] });
    return bookings.length > 0 && isAssigned(bookings.map((b) => b.id), user);
  });

// An employee's own records (attendance, equipment, inspections, checklists): the employee, or a
// supervisor / quality inspector
const employeeRecords = (idOf) => guard("employee", idOf, async (id, user) => same(id, user.id) || isStaffReader(user));

// An inspection: the employee doing it, its client, or a supervisor / quality inspector
const readInspection = (idOf) =>
  guard("inspection", idOf, async (id, user) => {
    const inspection = await Inspection.findByPk(id, { attributes: ["id", "employee_id", "user_id"] });
    if (!inspection) return null;
    return same(inspection.employee_id, user.id) || same(inspection.user_id, user.id) || isStaffReader(user);
  });

// A review: its author
const ownReview = (idOf) =>
  guard("review", idOf, async (id, user) => {
    const review = await ServiceReview.findByPk(id, { attributes: ["id", "user_id"] });
    if (!review) return null;
    return same(review.user_id, user.id);
  });

module.exports = {
  param,
  bodyField,
  readBooking,
  workOnBooking,
  readInvoice,
  selfOnly,
  readAddress,
  editAddress,
  readUserAddresses,
  employeeRecords,
  readInspection,
  ownReview,
  STAFF_READERS,
};
