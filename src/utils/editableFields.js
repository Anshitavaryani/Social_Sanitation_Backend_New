// The columns an admin edit may change: every column of the model except its id, is_active (each
// of these records has its own delete endpoint), the timestamps, and the links named in except
// (which client or template a record belongs to).
const PROTECTED = ["id", "is_active", "created_at", "updated_at", "deleted_at"];

const editableFields = (Model, except = []) =>
  Object.keys(Model.rawAttributes).filter((name) => !PROTECTED.includes(name) && !except.includes(name));

module.exports = { editableFields };
