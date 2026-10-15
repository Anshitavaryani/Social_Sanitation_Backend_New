const { status: httpStatus } = require("http-status");
const catchAsync = require("../../utils/catchAsync");
const responseWrapper = require("../../config/responseWrapper");
const { equipmentService } = require("../../services");

const createEquipment = catchAsync(async (req, res) => {
  await equipmentService.createEquipment(req.body);

  return responseWrapper(
    res,
    "",
    "Equipment Created Successfully.",
    httpStatus.CREATED,
  );
});

const updateEquipment = catchAsync(async (req, res) => {
  await equipmentService.updateEquipment(req.params.id, req.body);

  return responseWrapper(
    res,
    "",
    "Equipment Updated Successfully.",
    httpStatus.OK,
  );
});

const deleteEquipment = catchAsync(async (req, res) => {
  await equipmentService.deleteEquipment(req.params.id);

  return responseWrapper(
    res,
    "",
    "Equipment Deleted Successfully.",
    httpStatus.OK,
  );
});

const getAllEquipments = catchAsync(async (req, res) => {
  const result = await equipmentService.getAllEquipments(req.query);

  return responseWrapper(
    res,
    result,
    "Equipments fetched successfully.",
    httpStatus.OK,
  );
});

const assignEquipment = catchAsync(async (req, res) => {
  await equipmentService.assignEquipment(req.body);

  return responseWrapper(
    res,
    "",
    "Equipment Assigned Successfully.",
    httpStatus.CREATED,
  );
});

const updateAssignment = catchAsync(async (req, res) => {
  await equipmentService.updateAssignment(req.params.id, req.body);

  return responseWrapper(
    res,
    "",
    "Assignment Updated Successfully.",
    httpStatus.OK,
  );
});

const getAllAssignments = catchAsync(async (req, res) => {
  const result = await equipmentService.getAllAssignments(req.query);

  return responseWrapper(
    res,
    result,
    "Assignments fetched successfully.",
    httpStatus.OK,
  );
});

const assignmentOverview = catchAsync(async (req, res) => {
  const result = await equipmentService.assignmentOverview();

  return responseWrapper(
    res,
    result,
    "Overview fetched successfully.",
    httpStatus.OK,
  );
});

const getAssignmentEquipmentHistory = catchAsync(async (req, res) => {
  const { assignmentId } = req.params;

  const response =
    await equipmentService.getAssignmentEquipmentHistory(assignmentId);

  return responseWrapper(
    res,
    response,
    "Equipment assignment history fetched successfully.",
    httpStatus.OK,
  );
});

const getMonthlyEmployeeEquipmentRecords =
  catchAsync(async (req, res) => {
    const response =
      await equipmentService.getMonthlyEmployeeEquipmentRecords(
        req.query,
      );

    return responseWrapper(
      res,
      response,
      "Monthly employee equipment records fetched successfully.",
      httpStatus.OK,
    );
  });

const sendEmployeeEquipmentForm = catchAsync(
  async (req, res) => {
    const response =
      await equipmentService.sendEmployeeEquipmentForm(
        req.params.assignmentId,
      );

    return responseWrapper(
      res,
      response,
      "Equipment form sent successfully.",
      httpStatus.OK,
    );
  },
);

//employee equipment signature

const getMyEquipment = catchAsync(async (req, res) => {
  const result = await equipmentService.getMyEquipment(req.body, req.query);

  return responseWrapper(
    res,
    result,
    "Equipments fetched successfully.",
    httpStatus.OK,
  );
});

const signEquipment = catchAsync(async (req, res) => {
  const response = await equipmentService.signEquipment(
    req.body,
    req.params.assignmentId,
  );

  return responseWrapper(
    res,
    response,
    "Equipment signed successfully.",
    httpStatus.OK,
  );
});

const getEquipmentSignatureHistory = catchAsync(async (req, res) => {
  const response = await equipmentService.getEquipmentSignatureHistory(
    req.body,
    req.params.assignmentId,
  );

  return responseWrapper(
    res,
    response,
    "Equipment signature history fetched successfully.",
    httpStatus.OK,
  );
});

const getEquipmentByEmployeeId = catchAsync(
  async (req, res) => {
    const { employeeId } = req.params;

    const response =
      await equipmentService.getEquipmentByEmployeeId(
        employeeId,
        req.query,
      );

    return responseWrapper(
      res,
      response,
      "Employee equipment fetched successfully",
      httpStatus.OK,
    );
  },
);

module.exports = {
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getAllEquipments,

  assignEquipment,
  updateAssignment,
  getAllAssignments,
  assignmentOverview,

  getAssignmentEquipmentHistory,
  getMonthlyEmployeeEquipmentRecords,
  sendEmployeeEquipmentForm,

  getMyEquipment,
  signEquipment,
  getEquipmentSignatureHistory,
  getEquipmentByEmployeeId
};
