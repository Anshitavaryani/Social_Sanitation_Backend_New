// Baseline: creates any table the models define that this database does not have yet, and
// changes nothing that exists. (npm run migrate used to run sync({ alter: true }), which could
// drop or rewrite columns.) Every later schema change is its own migration in this folder, written
// with queryInterface (addColumn, changeColumn, ...), so it runs once per database and is recorded.
module.exports = {
  async up({ sequelize }) {
    require("../models");
    await sequelize.sync();
  },
};
