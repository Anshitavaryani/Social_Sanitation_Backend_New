// Admin user service: dashboard counts, draft quotes and the client checklist
// that adminAddUser used to drop (empty "KEEP YOUR EXISTING CHECKLIST CODE HERE" block).
require("./helpers/env");
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mockModule, mockDatabase, loadFromRoot } = require("./helpers/mocks");

const { models, sequelize } = mockDatabase();

const credentialEmails = [];
const realEmailService = loadFromRoot("src/services/Common/email.service.js");
mockModule("src/services/Common/email.service.js", {
  ...realEmailService,
  sendUserCredentials: async (to, password, supportEmail) => {
    credentialEmails.push({ to, password, supportEmail });
    return true;
  },
});

const userService = loadFromRoot("src/services/Admin/user.service.js");
const ApiError = loadFromRoot("src/utils/ApiError.js");

// Records every ClientChecklist / ClientChecklistDetail write
let writes;
beforeEach(() => {
  writes = { checklistCreate: [], checklistUpdate: [], detailDestroy: [], detailCreate: [], addressCreate: [] };
  credentialEmails.length = 0;
  sequelize.transactions.length = 0;

  models.ClientChecklist.findOne = async () => null;
  models.ClientChecklist.create = async (values, options) => {
    writes.checklistCreate.push({ values, options });
    return { id: 77, ...values };
  };
  models.ClientChecklistDetail.destroy = async (options) => {
    writes.detailDestroy.push(options);
    return 0;
  };
  models.ClientChecklistDetail.create = async (values, options) => {
    writes.detailCreate.push({ values, options });
    return values;
  };
  models.UserAddress.create = async (values) => {
    writes.addressCreate.push(values);
    return values;
  };
});

test("dashboard booking counts query the bookings table with their filters", async () => {
  const counted = [];
  models.Booking.count = async ({ where }) => {
    counted.push(where);
    return counted.length * 10;
  };

  assert.equal(await userService.getBookingCount(), 10);
  assert.equal(await userService.getPendingBookingCount(), 20);
  assert.equal(await userService.getCompletedBookingCount(), 30);
  assert.equal(await userService.getDeletedBookingCount(), 40);
  assert.deepEqual(counted, [
    { is_active: true },
    { is_active: true, booking_status: ["PENDING", "ACCEPTED", "ONGOING"] },
    { is_active: true, booking_status: ["SUCCESS"] },
    { is_active: true, booking_status: ["DELETED", "REJECTED"] },
  ]);
});

test("deleting a draft quote that does not exist is a 404 ApiError", async () => {
  models.ServiceQuote.findOne = async () => null;
  await assert.rejects(userService.deleteDraftQuote(123), (err) => {
    assert.ok(err instanceof ApiError, `expected ApiError, got ${err.constructor.name}: ${err.message}`);
    assert.equal(err.statusCode, 404);
    assert.equal(err.message, "Draft not found");
    return true;
  });
});

test("deleting an existing draft quote removes its items and the quote", async () => {
  let destroyed = false;
  const itemDeletes = [];
  models.ServiceQuote.findOne = async () => ({
    id: 5,
    destroy: async () => {
      destroyed = true;
    },
  });
  models.QuoteItem.destroy = async (options) => itemDeletes.push(options);
  await userService.deleteDraftQuote(5);
  assert.deepEqual(itemDeletes, [{ where: { quote_id: 5 } }]);
  assert.equal(destroyed, true);
});

const clientChecklist = (details) => ({
  walkaround_minutes: 30,
  estimated_sqft: 5000,
  service_days: ["MON", "WED"],
  carpet_percentage: 40,
  address: "1 Main St",
  country_id: 233,
  state_id: 3930,
  city_id: 111,
  address_lat: 27.9,
  address_long: -82.4,
  details,
});

test("adminAddUser saves a new client's checklist with default areas and emails the client support address", async () => {
  models.User.findOne = async () => null;
  models.User.create = async (values) => ({ id: 501, ...values });
  models.Profile.create = async (values) => ({ id: 1, ...values });

  const user = await userService.adminAddUser({
    name: "Acme Corp",
    email: " Owner@Acme.com ",
    role_id: 6,
    client_type: "commercial",
    checklist: clientChecklist([]),
  });

  assert.equal(user.id, 501);
  assert.equal(writes.checklistCreate.length, 1);
  const saved = writes.checklistCreate[0].values;
  assert.equal(saved.user_id, 501);
  assert.equal(saved.estimated_sqft, 5000);
  assert.equal(saved.country_id, 233);
  assert.equal(saved.carpet_percentage, 40);
  assert.equal(saved.tile_percentage, 0, "missing percentages default to 0");

  // No details sent -> the 7 default commercial areas
  assert.equal(writes.detailCreate.length, 7);
  assert.ok(writes.detailCreate.every((d) => d.values.checklist_id === 77));
  assert.equal(writes.detailCreate[1].values.service_area, "Restrooms");

  assert.deepEqual(credentialEmails.map((e) => [e.to, e.supportEmail]), [
    ["owner@acme.com", "clean.quote@socialsanitation.com"],
  ]);
});

test("adminAddUser keeps the details the admin entered", async () => {
  models.User.findOne = async () => null;
  models.User.create = async (values) => ({ id: 502, ...values });
  models.Profile.create = async (values) => ({ id: 2, ...values });

  await userService.adminAddUser({
    name: "Home Owner",
    email: "home@example.com",
    role_id: 6,
    client_type: "residential",
    checklist: clientChecklist([{ service_area: "Bathrooms", stalls: "2", sinks: 3, special_requests: "Eco products" }]),
  });

  assert.equal(writes.detailCreate.length, 1);
  assert.deepEqual(
    { ...writes.detailCreate[0].values },
    {
      checklist_id: 77,
      service_area: "Bathrooms",
      flooring_type: null,
      special_requests: "Eco products",
      num_desks_trash_cans: 0,
      stalls: 2,
      sinks: 3,
      restrooms: 0,
    },
  );
});

test("adminAddUser without a checklist creates no checklist and uses the general support address", async () => {
  models.User.findOne = async () => null;
  models.User.create = async (values) => ({ id: 503, ...values });
  models.Profile.create = async (values) => ({ id: 3, ...values });

  await userService.adminAddUser({ name: "Office Admin", email: "office@example.com", role_id: 2 });

  assert.equal(writes.checklistCreate.length, 0);
  assert.equal(credentialEmails[0].supportEmail, "socialsanitation@gmail.com");
});

test("adminAddUser rejects an email that is already registered", async () => {
  models.User.findOne = async () => ({ id: 1 });
  await assert.rejects(
    userService.adminAddUser({ name: "Dup", email: "dup@example.com", role_id: 6 }),
    (err) => err.statusCode === 400 && err.message === "Email already exists",
  );
  assert.equal(credentialEmails.length, 0);
});

const editableClient = () => {
  const user = {
    id: 600,
    role_id: 6,
    email: "client@example.com",
    updates: [],
    async update(values) {
      this.updates.push(values);
    },
    async reload() {},
  };
  return user;
};

test("adminEditUser still creates a missing checklist inside its transaction (refactor regression)", async () => {
  const user = editableClient();
  models.User.findByPk = async () => user;
  models.Profile.findOne = async () => null;

  const result = await userService.adminEditUser(
    { client_type: "commercial", checklist: clientChecklist([{ service_area: "Lobby", restrooms: "4" }]) },
    600,
  );

  const tx = sequelize.transactions[0];
  assert.equal(tx.committed, true);
  assert.equal(writes.checklistCreate[0].values.user_id, 600);
  assert.equal(writes.checklistCreate[0].options.transaction, tx);
  assert.deepEqual(writes.detailDestroy, [{ where: { checklist_id: 77 }, transaction: tx }]);
  assert.equal(writes.detailCreate[0].values.restrooms, 4);
  assert.equal(writes.detailCreate[0].options.transaction, tx);
  assert.equal(result.checklist.id, 77);
});

test("adminEditUser updates an existing checklist instead of creating a second one", async () => {
  const user = editableClient();
  const existing = {
    id: 88,
    updated: null,
    async update(values) {
      this.updated = values;
    },
  };
  models.User.findByPk = async () => user;
  models.Profile.findOne = async () => null;
  models.ClientChecklist.findOne = async ({ where }) => (where.user_id === 600 ? existing : null);

  const result = await userService.adminEditUser({ checklist: clientChecklist([]) }, 600);

  assert.equal(writes.checklistCreate.length, 0);
  assert.equal(existing.updated.estimated_sqft, 5000);
  assert.equal(existing.updated.country_id, 233);
  assert.ok(writes.detailCreate.every((d) => d.values.checklist_id === 88));
  assert.equal(result.checklist, existing);
});
