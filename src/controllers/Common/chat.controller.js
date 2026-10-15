const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { chatService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");
const pick = require("../../utils/pick");

const sendMessage = catchAsync(async (req, res) => {
  let response = await chatService.sendMessage(
    req.body,
    req.files,
    req.headers
  );
  return responseWrapper(
    res,
    response,
    "Mesaage send Successfully.",
    httpStatus.OK
  );
});

const sendNotification = catchAsync(async (req, res) => {
  let response = await chatService.sendNotification(
    req.body,
    req.files,
    req.headers
  );
  return responseWrapper(
    res,
    response,
    "Mesaage send Successfully.",
    httpStatus.OK
  );
});

const getUserMessages = catchAsync(async (req, res) => {
  const response = await chatService.getUserMessages(req.body, req.query);
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const markAdminMessagesAsRead = catchAsync(async (req, res) => {
  await chatService.markAdminMessagesAsRead(req.body, req.params,req.headers);
  return responseWrapper(res, "", "Successfully marked as read", httpStatus.OK);
});

const getChatList = catchAsync(async (req, res) => {
  let response = await chatService.getChatList(req.body);
  return responseWrapper(
    res,
    response,
    "Successfully Fetch Chat Lists",
    httpStatus.OK
  );
});

const getAdminMessages = catchAsync(async (req, res) => {
  const response = await chatService.getAdminMessages(req.body);
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const getUserChatList = catchAsync(async (req, res) => {
  let response = await chatService.getUserChatList(req.body);
  return responseWrapper(
    res,
    response,
    "Successfully Fetch Chat Lists",
    httpStatus.OK
  );
});

const getLastMessage = catchAsync(async (req, res) => {
  const response = await chatService.getLastMessage(req.body, req.params);
  return responseWrapper(res, response, "Success", httpStatus.OK);
});

const markUserMessagesAsRead = catchAsync(async (req, res) => {
  await chatService.markUserMessagesAsRead(req.body);
  return responseWrapper(res, "", "Successfully marked as read", httpStatus.OK);
});

module.exports = {
  sendMessage,
  sendNotification,
  getUserMessages,
  markAdminMessagesAsRead,
  getChatList,
  getAdminMessages,
  getUserChatList,
  getLastMessage,
  markUserMessagesAsRead,
};
