// Role ids of the roles table, by name, and the groups the app checks. Code refers to roles only
// through these names (tests/roles.test.js rejects a numeric role id anywhere else).
const ROLE = Object.freeze({
  SUPER_ADMIN: 1,
  ADMIN: 2,
  OPERATIONS_ADMIN: 3, // operational administrator ("Sub admin" in older code)
  BDM: 5, // business development manager
  CLIENT: 6,
  SUPERVISOR: 7, // inspector / supervisor
  QUALITY_INSPECTOR: 8, // quality assurance technician
  CLEANER: 9,
  JANITOR: 10, // cleaner sub-role (users.sub_role_id with role CLEANER)
  HOUSEKEEPING: 11, // cleaner sub-role (users.sub_role_id with role CLEANER)
});

// Employees: every role from supervisor to housekeeping
const EMPLOYEE_ROLE_IDS = Object.freeze([
  ROLE.SUPERVISOR,
  ROLE.QUALITY_INSPECTOR,
  ROLE.CLEANER,
  ROLE.JANITOR,
  ROLE.HOUSEKEEPING,
]);

// The roles an employee works a booking as; an employee's role can only change between these
const BOOKING_ROLE_IDS = Object.freeze([ROLE.SUPERVISOR, ROLE.QUALITY_INSPECTOR, ROLE.CLEANER]);

// App users: clients and employees
const APP_USER_ROLE_IDS = Object.freeze([ROLE.CLIENT, ...EMPLOYEE_ROLE_IDS]);

// Admin-panel roles that take part in team chat and create teams. Admins (role 2) are left out on purpose.
const TEAM_CHAT_ADMIN_ROLE_IDS = Object.freeze([ROLE.SUPER_ADMIN, ROLE.OPERATIONS_ADMIN, ROLE.BDM]);

// How each role is shown to people (team chat participant lists)
const ROLE_NAMES = Object.freeze({
  [ROLE.SUPER_ADMIN]: "Super Admin",
  [ROLE.ADMIN]: "Admin",
  [ROLE.OPERATIONS_ADMIN]: "Operations Administrator",
  [ROLE.BDM]: "BDM",
  [ROLE.CLIENT]: "Client",
  [ROLE.SUPERVISOR]: "Supervisor",
  [ROLE.QUALITY_INSPECTOR]: "Quality Inspector",
  [ROLE.CLEANER]: "Cleaner",
  [ROLE.JANITOR]: "Janitor",
  [ROLE.HOUSEKEEPING]: "Housekeeping",
});

module.exports = {
  ROLE,
  ROLE_NAMES,
  EMPLOYEE_ROLE_IDS,
  BOOKING_ROLE_IDS,
  APP_USER_ROLE_IDS,
  TEAM_CHAT_ADMIN_ROLE_IDS,
};
