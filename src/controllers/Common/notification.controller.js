const httpStatus = require("http-status");

const catchAsync = require("../../utils/catchAsync");
const { notificationService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");
const pick = require("../../utils/pick");

const sendPushNotification = catchAsync(async (req, res) => {
  let response = await notificationService.sendPushNotification(
    req.body.notificationObj,
    req.body.registrationTokens
  );
  return responseWrapper(
    res,
    response,
    "PushNotification sent Successfully.",
    httpStatus.OK
  );
});


const getAllNotificationsOfUser = catchAsync(async (req, res) => {
  const products = await notificationService.getAllNotificationsOfUser(
    req.body
  );
  return responseWrapper(
    res,
    products,
    "Successfully get Notifications",
    httpStatus.OK
  );
});

const markOneNotificationAsRead = catchAsync(async (req, res) => {
  const products = await notificationService.markOneNotificationAsRead(
    req.body
  );
  return responseWrapper(
    res,
    products,
    "Successfully marked one Notifications as read",
    httpStatus.OK
  );
});

const markAllNotificationAsRead = catchAsync(async (req, res) => {
  const products = await notificationService.markAllNotificationAsRead(
    req.body
  );
  return responseWrapper(
    res,
    products,
    "Successfully marked all Notifications as read",
    httpStatus.OK
  );
});

module.exports = {
  sendPushNotification,
  getAllNotificationsOfUser,
  markOneNotificationAsRead,
  markAllNotificationAsRead,

};
