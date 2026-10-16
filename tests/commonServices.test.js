// Service/product updates, inspection image cleanup, invoice analytics and the notification toggle.
require("./helpers/env");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { ROOT, mockModule, mockDatabase, loadFromRoot, runHandler } = require("./helpers/mocks");

const { models } = mockDatabase();

const ApiError = loadFromRoot("src/utils/ApiError.js");
const serviceService = loadFromRoot("src/services/Common/service.service.js");
const productService = loadFromRoot("src/services/Common/product.service.js");
const inspectionService = loadFromRoot("src/services/Common/inspection.service.js");
const invoiceService = loadFromRoot("src/services/Common/invoice.service.js");

const isApiError = (status, message) => (err) => {
  assert.ok(err instanceof ApiError, `expected ApiError, got ${err.constructor.name}: ${err.message}`);
  assert.equal(err.statusCode, status);
  if (message) assert.equal(err.message, message);
  return true;
};

test("updateServicePrices without both prices is a 400 ApiError (no undefined res)", async () => {
  for (const body of [{}, { old_price: 10 }, { new_price: 12 }]) {
    await assert.rejects(
      serviceService.updateServicePrices(body),
      isApiError(400, "Both old_price and new_price are required."),
    );
  }
});

test("updateServicePrices moves every service from the old price to the new one", async () => {
  const calls = [];
  models.Service.update = async (values, options) => {
    calls.push([values, options]);
    return [3];
  };
  assert.deepEqual(await serviceService.updateServicePrices({ old_price: 10, new_price: 12 }), [3]);
  assert.deepEqual(calls, [[{ price: 12 }, { where: { price: 10 } }]]);
});

test("images added while editing a service are stored under /images like on create", async () => {
  const created = [];
  models.Service.findByPk = async () => ({ name: "Deep clean", async save() {} });
  models.ServiceAttachment.bulkCreate = async (rows) => created.push(...rows);

  await serviceService.updateService({}, { images: [{ filename: "images-1.jpg", size: 10 }] }, 9);

  assert.equal(created.length, 1);
  assert.equal(created[0].file_uri, "/images");
  assert.equal(created[0].file_name, "images-1.jpg");
});

test("images added while editing a product are stored under /images like on create", async () => {
  const created = [];
  models.Product.findByPk = async () => ({ async update() {} });
  models.Product.rawAttributes = loadFromRoot("src/models/product.model.js").rawAttributes;
  models.ProductAttachment.bulkCreate = async (rows) => created.push(...rows);

  await productService.updateProductById(4, {}, { images: [{ filename: "images-2.png", size: 10 }] });

  assert.equal(created[0].file_uri, "/images");
  assert.equal(created[0].file_name, "images-2.png");
  assert.equal(created[0].product_id, 4);
});

test("deleting an inspection image removes the file from public/uploads/images", async () => {
  const dir = path.join(ROOT, "public/uploads/images");
  fs.mkdirSync(dir, { recursive: true });
  const filename = `test-inspection-${process.pid}-${Date.now()}.png`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, "x");

  let destroyed = false;
  models.InspectionItemImage.findOne = async () => ({
    id: 31,
    image: `/${filename}`,
    uploaded_by: 12,
    uploaded_by_role: "EMPLOYEE",
    item: { inspection: { status: "IN_PROGRESS", employee_id: 12 } },
    destroy: async () => {
      destroyed = true;
    },
  });

  try {
    const result = await inspectionService.deleteInspectionItemImage({ user: { id: 12 } }, 31);
    assert.deepEqual(result, { success: true, data: { id: 31 } });
    assert.equal(destroyed, true);
    assert.equal(fs.existsSync(filePath), false, "image file should be deleted");
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

test("a missing inspection image file does not block deleting the record", async () => {
  let destroyed = false;
  models.InspectionItemImage.findOne = async () => ({
    id: 32,
    image: "/already-gone.png",
    uploaded_by: 12,
    uploaded_by_role: "EMPLOYEE",
    item: { inspection: { status: "IN_PROGRESS", employee_id: 12 } },
    destroy: async () => {
      destroyed = true;
    },
  });
  await inspectionService.deleteInspectionItemImage({ user: { id: 12 } }, 32);
  assert.equal(destroyed, true);
});

test("employees cannot delete someone else's inspection image", async () => {
  models.InspectionItemImage.findOne = async () => ({
    id: 33,
    image: "/x.png",
    uploaded_by: 99,
    uploaded_by_role: "EMPLOYEE",
    item: { inspection: { status: "IN_PROGRESS", employee_id: 12 } },
  });
  await assert.rejects(inspectionService.deleteInspectionItemImage({ user: { id: 12 } }, 33), isApiError(403));
});

test("business analytics now reports overdue invoices and overdue revenue", async () => {
  const invoice = (overrides) => ({
    user_id: 1,
    billing_date: "2026-10-05",
    invoices_user: { user_profile: { name: "Rep" } },
    ...overrides,
  });
  models.Invoice.findAll = async () => [
    invoice({ total_due: 100, payment_status: "PENDING", due_date: "2026-10-01" }), // overdue
    invoice({ total_due: 250, payment_status: "PENDING", due_date: "2099-01-01" }), // unpaid, not due
    invoice({ total_due: 400, payment_status: "PAID", due_date: "2026-10-01" }), // paid, never overdue
  ];
  models.ServiceQuote.findAll = async () => [];

  const result = await invoiceService.getBusinessAnalytics({ month: "2026-10" });
  const overview = result.data.overview;

  assert.equal(overview.overdue_invoices, 1);
  assert.equal(overview.overdue_revenue, 100);
  assert.equal(overview.unpaid_invoices, 2);
  assert.equal(overview.unpaid_revenue, 350);
  assert.equal(overview.paid_revenue, 400);
});

test("notification toggle responds with the matching message (message is declared)", async () => {
  let nextStatus = true;
  mockModule("src/services/index.js", {
    userOpService: { notificationToogle: async () => ({ notification_status: nextStatus }) },
  });
  const controller = loadFromRoot("src/controllers/User/user.controller.js");

  let { res, err } = await runHandler(controller.notificationToogle, { body: { user: { id: 1 } } });
  assert.equal(err, undefined);
  assert.equal(res.body.message, "Notification turned On!");

  nextStatus = false;
  ({ res } = await runHandler(controller.notificationToogle, { body: { user: { id: 1 } } }));
  assert.equal(res.body.message, "Notification turned Off!");
});
