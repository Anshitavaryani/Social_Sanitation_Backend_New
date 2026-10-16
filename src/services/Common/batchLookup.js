// Lookups for many rows at once, for the jobs and admin lists that used to run one query per
// employee (per booking): the first matching row per key, or all rows grouped by key.
const { Attendance, Break, AttendancePayroll, User, UserAddress, Profile } = require("../../models");

// For each value of key, the first row of Model matching where, in order: what
// Model.findOne({ where: { [key]: value, ...where }, order }) returned value by value
const firstRowBy = async (Model, key, values, where = {}, order = [["id", "ASC"]]) => {
  const first = new Map();
  const ids = [...new Set(values)].filter((value) => value !== undefined && value !== null);
  if (!ids.length) return first;
  const rows = await Model.findAll({ where: { [key]: ids, ...where }, order });
  for (const row of rows) if (!first.has(row[key])) first.set(row[key], row);
  return first;
};

// The rows of Model for each value of key, in the given order
const rowsGroupedBy = async (Model, key, values, order) => {
  const groups = new Map();
  const ids = [...new Set(values)].filter((value) => value !== undefined && value !== null);
  if (!ids.length) return groups;
  for (const row of await Model.findAll({ where: { [key]: ids }, order })) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
};

// Each user's first attendance row matching where
const firstAttendanceByUser = (userIds, where) => firstRowBy(Attendance, "user_id", userIds, where);

// Each attendance's breaks, earliest first
const breaksByAttendance = (attendanceIds) => rowsGroupedBy(Break, "attendance_id", attendanceIds, [["break_start_est", "ASC"]]);

// Each attendance's payroll row
const payrollByAttendance = (attendanceIds) => firstRowBy(AttendancePayroll, "attendance_id", attendanceIds);

// Each user's first address (the one they were created with)
const firstAddressByUser = (userIds) => firstRowBy(UserAddress, "user_id", userIds, {}, [["created_at", "ASC"], ["id", "ASC"]]);

// Profile names by user id
const profileNamesByUserId = async (userIds) => {
  const names = new Map();
  const ids = [...new Set(userIds)];
  if (!ids.length) return names;
  const users = await User.findAll({
    where: { id: ids },
    include: [{ model: Profile, as: "user_profile", attributes: ["name"] }],
  });
  for (const user of users) names.set(user.id, user.user_profile?.name);
  return names;
};

module.exports = { firstAttendanceByUser, breaksByAttendance, payrollByAttendance, firstAddressByUser, profileNamesByUserId };
