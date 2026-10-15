const { calendarService } = require("../../services/Common");
const responseWrapper = require("../../config/responseWrapper");
const catchAsync = require('../../utils/catchAsync');
const { status: httpStatus } = require('http-status');

const authorize = catchAsync(async (req, res) => {
  const { user } = req.body;

  if (!user || !user.id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "User ID is required for authorization.",
    });
  }

  const authorizationUrl = await calendarService.getAuthorizationUrl(user.id,user.role_id);
  return res.status(httpStatus.OK).json({ authorizationUrl });
});

const adminAuthorize = catchAsync(async (req, res) => {
  const { user } = req.body;

  if (!user || !user.id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "Admin ID is required for authorization.",
    });
  }

  const authorizationUrl = await calendarService.getAuthorizationUrl(user.id, user.role_id);
  return res.status(httpStatus.OK).json({ authorizationUrl });
});

const oauth2callback = catchAsync(async (req, res) => {
  let query = JSON.parse(req.query.state);
  const { id, role_id } = query;
  const { code } = req.query;

  if (!code || !id || !role_id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "Authorization code, id, and role_id are required.",
    });
  }

  let response = await calendarService.authorize(id, role_id, code);
  console.log("Authorization Response:", response, id, role_id, code);

  if (response) {
    if (role_id === 6 || role_id === 7) {
      return res.status(200).json({
        status:"200",
        message: "Authorization successful.",
      });
    } else {
      return res.redirect(`http://localhost:3000/authorization-success/${response}`);
    }
  } else {
    return res.redirect('http://localhost:3000/authorization-failure/');
  }
});


// const oauth2callback = catchAsync(async (req, res) => {
//   let query = JSON.parse(req.query.state);
//   const { id, role_id } = query;
//   const { code } = req.query

//   if (!code || !id || !role_id) {
//     return res.status(httpStatus.BAD_REQUEST).json({
//       message: "Authorization code and id and role_id are required.",
//     });
//   }

//   let response = await calendarService.authorize(id, role_id, code);
//   console.log("1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111", response,id, role_id, code);
//   if(response ){
//     return res.redirect(`http://localhost:3000/authorization-success/${response}`);
//   }else{
//     return res.redirect('http://localhost:3000/authorization-failure/');
//   }
// });

const createCalendarEvent = catchAsync(async (req, res) => {
  const { user } = req.body;

  if (!user || !user.id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "User ID is required to create a calendar event.",
    });
  }

  await calendarService.createCalendarEvent(user.id, req.body);
  return responseWrapper(
    res,
    "",
    "New event created successfully.",
    httpStatus.CREATED
  );
});

const deleteCalendarEvent = catchAsync(async (req, res) => {
  const { user } = req.body;

  if (!user || !user.id) {
    return res.status(httpStatus.BAD_REQUEST).json({
      message: "User ID is required to delete a calendar event.",
    });
  }

  await calendarService.deleteCalendarEvent(user.id, req.body);
  return responseWrapper(
    res,
    "",
    "Event delete successfully.",
    httpStatus.OK
  );
});

const listEvents = catchAsync(async (req, res) => {
  const events = await calendarService.listEvents(req.body);
  return responseWrapper(res, events, "", httpStatus.OK);
});

const getValidateToken = catchAsync(async (req, res) => {
  const response = await calendarService.getValidateToken(req.body);
  return responseWrapper(res, response, "", httpStatus.OK);
});

module.exports = {
  authorize,
  adminAuthorize,
  oauth2callback,
  createCalendarEvent,
  listEvents,
  deleteCalendarEvent,
  getValidateToken,
};
