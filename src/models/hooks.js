// The hook most models share: a destroyed row also gets is_active = false.
// Sequelize writes updated_at on every save and deleted_at on destroy itself (timestamps and
// paranoid are on), so the hooks this replaces, which also assigned those two, never changed them:
// Sequelize ignores writes to its own timestamp columns on existing rows.
const deactivateOnDestroy = (Model) => {
  Model.beforeDestroy((row) => {
    row.is_active = false;
  });
};

module.exports = { deactivateOnDestroy };
