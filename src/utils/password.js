// Hashing for every password the app stores, with the cost in src/config/rules.js.
const bcrypt = require("bcryptjs");
const { PASSWORD } = require("../config/rules");

const hashPassword = (plain) => bcrypt.hashSync(plain, bcrypt.genSaltSync(PASSWORD.HASH_ROUNDS));

module.exports = { hashPassword };
