/** @format */

const { status: httpStatus } = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { groupChatService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");

const sendGroupMessage = catchAsync(async (req, res) => {
  const response = await groupChatService.sendGroupMessage(req.body, req.files);

  return responseWrapper(
    res,
    response,
    "Message sent successfully.",
    httpStatus.OK,
  );
});

const getMyGroups = catchAsync(async (req, res) => {
  const response = await groupChatService.getMyGroups(req.body);
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const getGroupMessages = catchAsync(async (req, res) => {
  const response = await groupChatService.getGroupMessages(
    req.params.id,
    req.body,
  );
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const updateGroupName = catchAsync(async (req, res) => {
  const response = await groupChatService.updateGroupName(req.body);
  return responseWrapper(
    res,
    response,
    "Group name updated successfully.",
    httpStatus.OK,
  );
});

const getGroupParticipants = catchAsync(async (req, res) => {
  const response = await groupChatService.getGroupParticipants(req.params.id);

  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const deleteGroup = catchAsync(async (req, res) => {
  const response = await groupChatService.deleteGroup(req.params.id, req.body);
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const createTeam = catchAsync(async (req, res) => {
  const response = await groupChatService.createTeam(req.body);

  return responseWrapper(
    res,
    response,
    "Team created successfully.",
    httpStatus.CREATED,
  );
});

const getMyTeams = catchAsync(async (req, res) => {
  const response = await groupChatService.getMyTeams(req.body);

  return responseWrapper(
    res,
    response,
    "Teams fetched successfully.",
    httpStatus.OK,
  );
});

const addTeamMembers = catchAsync(async (req, res) => {
  const response = await groupChatService.addTeamMembers(req.body);

  return responseWrapper(
    res,
    response,
    "Team members updated successfully.",
    httpStatus.OK,
  );
});

const removeTeamMember = catchAsync(async (req, res) => {
  const response = await groupChatService.removeTeamMember(req.body);

  return responseWrapper(
    res,
    response,
    "Team member removed successfully.",
    httpStatus.OK,
  );
});

const deleteTeam = catchAsync(async (req, res) => {
  const response = await groupChatService.deleteTeam(req.body);

  return responseWrapper(
    res,
    response,
    "Team deleted successfully.",
    httpStatus.OK,
  );
});


const getAvailableTeamParticipants = catchAsync(async (req, res) => {
  const response =
    await groupChatService.getAvailableTeamParticipants();

  return responseWrapper(
    res,
    response,
    "Team participants fetched successfully.",
    httpStatus.OK,
  );
});


module.exports = {
  sendGroupMessage,
  getMyGroups,
  getGroupMessages,
  updateGroupName,
  getGroupParticipants,
  deleteGroup,

  createTeam,
  getMyTeams,
  addTeamMembers,
  removeTeamMember,
  deleteTeam,
  getAvailableTeamParticipants
};
