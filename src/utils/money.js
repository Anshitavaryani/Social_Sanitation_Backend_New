// Money arithmetic and display, written once: rounding to cents, dollars to cents for Square,
// invoice deposits, and amounts shown in PDFs and estimates.
const { status: httpStatus } = require("http-status");
const ApiError = require("./ApiError");

// A dollar amount rounded to cents, as Number(x.toFixed(2)) did everywhere
const roundMoney = (amount) => Number(Number(amount).toFixed(2));

// Whole cents for Square: 19.99 -> 1999 (Math.round absorbs 19.99 * 100 = 1998.9999...)
const toCents = (amount) => Math.round(Number(amount) * 100);

// Cents for an amount sent by a client: a positive number or numeric string with at most two
// decimals; null otherwise
const parseAmountToCents = (amount) => {
  const value = typeof amount === "string" ? amount.trim() : amount;
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = toCents(dollars);
  return Math.abs(dollars * 100 - cents) < 1e-6 ? cents : null;
};

// A deposit percentage must be more than 0 and less than 100
const assertDepositPercent = (percent) => {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Deposit percentage must be greater than 0 and less than 100.");
  }
};

// Deposit and the balance left of an invoice total, each rounded to cents
const splitDeposit = (total, percent) => {
  const deposit = roundMoney((Number(total) * percent) / 100);
  return { deposit, balance: roundMoney(Number(total) - deposit) };
};

// An amount in a PDF: up to 6 decimals without trailing zeros (12.5, 0.035); "0" when missing
const formatAmount = (value) => {
  if (value === null || value === undefined || value === "") return "0";
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(6).replace(/\.?0+$/, "");
};

// A dollar amount with cents for estimates: "$60.00"
const formatUsd = (amount) => `$${Number(amount).toFixed(2)}`;

module.exports = { roundMoney, toCents, parseAmountToCents, assertDepositPercent, splitDeposit, formatAmount, formatUsd };
