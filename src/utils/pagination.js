// Page, page size and row offset of a list request; missing or invalid values fall back to page 1
// and the default page size in src/config/rules.js (or the list's own default from there).
const { PAGINATION } = require("../config/rules");

const positiveInteger = (value, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
};

const parsePagination = ({ page, limit } = {}, defaultLimit = PAGINATION.DEFAULT_PAGE_SIZE) => {
  const currentPage = positiveInteger(page, 1);
  const pageSize = positiveInteger(limit, defaultLimit);
  return { page: currentPage, limit: pageSize, offset: (currentPage - 1) * pageSize };
};

module.exports = { parsePagination };
