// Route access levels. Every route declares exactly one of these as its first middleware
// (tests/routeAccess.test.js enforces it):
//
//   publicRoute   no token (sign-in, sign-up, public content, webhooks)
//   requireAuth   any signed-in admin or app user (x-access-token)
//   requireAppUser  app-user token only, with a matching role_id header (verifyAuthJWTToken in
//                 userAuth.middleware.js)
//   requireAdmin  admin-panel token only; requireAdminRole(...ids) narrows it to some admin roles
//
// Admin tokens are signed with the hex-decoded JWT secret; app-user tokens with the secret
// string and are also stored in user_tokens (deleted on logout). Failures return 401 (no,
// invalid or expired token, or a deactivated account) or 403 (wrong kind of account).
//
// File uploads are parsed here, after the token is accepted (upload.middleware.js).
const jwt = require("jsonwebtoken");
const { status: httpStatus } = require("http-status");

const config = require("../config/config");
const ApiError = require("../utils/ApiError");
const catchAsync = require("../utils/catchAsync");
const { tokenTypes } = require("../config/types");
const { Admin, User, UserToken, Profile } = require("../models");
const { parseUploads } = require("./upload.middleware");

const TOKEN_HEADER = "x-access-token";

const unauthorized = (message) => new ApiError(httpStatus.UNAUTHORIZED, message);
const forbidden = (message) => new ApiError(httpStatus.FORBIDDEN, message);

const MISSING_TOKEN = "Authentication required. Send the access token in the x-access-token header.";
const EXPIRED_TOKEN = "Your session has expired. Please log in again.";
const INVALID_TOKEN = "Invalid access token. Please log in again.";

const verify = (token, key, options) => {
  try {
    return { payload: jwt.verify(token, key, options) };
  } catch (error) {
    return { error };
  }
};

const verifyAdminToken = (token) =>
  verify(token, Buffer.from(config.jwt.secret, "hex"), { algorithms: ["HS256"] });

const verifyUserToken = (token) => verify(token, config.jwt.secret);

const tokenError = (error) =>
  unauthorized(error && error.name === "TokenExpiredError" ? EXPIRED_TOKEN : INVALID_TOKEN);

// Signed-in admin for a verified admin token payload, or an ApiError
const loadAdmin = async (payload) => {
  if (payload.is_backlisted) return { error: unauthorized(INVALID_TOKEN) };
  const admin = await Admin.findOne({ where: { id: payload.id, is_active: true } });
  if (!admin) return { error: unauthorized("This admin account is not active. Please log in again.") };
  return { admin };
};

// Signed-in app user for a verified user token payload, or an ApiError. With roleId, the session
// and the user must also have that role.
const loadUser = async (token, payload, roleId) => {
  const role = roleId === undefined ? {} : { role_id: roleId };
  const tokenDoc = await UserToken.findOne({
    where: {
      token,
      user_id: payload.sub,
      token_type: tokenTypes.ACCESS,
      is_active: true,
      ...role,
    },
  });
  if (!tokenDoc) return { error: unauthorized("Your session has ended. Please log in again.") };

  const user = await User.findOne({
    where: { id: tokenDoc.user_id, is_active: 1, ...role },
    include: [
      {
        model: Profile,
        as: "user_profile",
        attributes: ["name", "dialing_code", "mobile", "is_active", "created_at"],
      },
    ],
  });
  if (!user) return { error: unauthorized("This account is not active. Please log in again.") };
  return { user, tokenDoc };
};

// The request shape app-user routes read: req.body.user is the User row
const attachUser = (req, { user, tokenDoc }) => {
  req.body.user = user;
  req.body.tokenDoc = tokenDoc;
  req.body.ip_address = req.ip;
  req.body.user_type = "USER";
};

// Same request shape as the original validateJWTtoken: req.user and req.body.user are the token payload
const attachAdmin = (req, payload, admin) => {
  req.user = payload;
  req.admin = admin;
  req.body.user = payload;
  req.body.user_type = "ADMIN";
};

const requireAdmin = catchAsync(async (req, res, next) => {
  const token = req.header(TOKEN_HEADER);
  if (!token) throw unauthorized(MISSING_TOKEN);

  const { payload, error } = verifyAdminToken(token);
  if (error) {
    if (error.name !== "TokenExpiredError" && !verifyUserToken(token).error) {
      throw forbidden("This endpoint is for admin accounts only.");
    }
    throw tokenError(error);
  }

  const loaded = await loadAdmin(payload);
  if (loaded.error) throw loaded.error;

  await parseUploads(req, res);
  attachAdmin(req, payload, loaded.admin);
  next();
});

// requireAdmin, limited to the given admin role ids
const requireAdminRole = (...roleIds) => {
  const allowed = roleIds.map(Number);
  return [
    requireAdmin,
    (req, res, next) => {
      if (!allowed.includes(Number(req.user.role_id))) {
        return next(forbidden("Your admin role is not allowed to do this."));
      }
      next();
    },
  ];
};

// Any signed-in admin or app user. Same request shape as the original verifyAnyAuthJWTToken:
// req.body.user is the Admin row or the User row.
const requireAuth = catchAsync(async (req, res, next) => {
  const token = req.header(TOKEN_HEADER);
  if (!token) throw unauthorized(MISSING_TOKEN);

  const asAdmin = verifyAdminToken(token);
  if (!asAdmin.error) {
    const loaded = await loadAdmin(asAdmin.payload);
    if (loaded.error) throw loaded.error;
    await parseUploads(req, res);
    req.user = asAdmin.payload;
    req.admin = loaded.admin;
    req.body.user = loaded.admin;
    req.body.user_type = "ADMIN";
    return next();
  }

  const asUser = verifyUserToken(token);
  if (asUser.error) {
    throw tokenError(asAdmin.error.name === "TokenExpiredError" ? asAdmin.error : asUser.error);
  }

  const loaded = await loadUser(token, asUser.payload);
  if (loaded.error) throw loaded.error;
  await parseUploads(req, res);
  attachUser(req, loaded);
  next();
});

// App-user token only (an admin token gets 401). The role_id header the apps send must match the
// session's and the user's role.
const requireAppUser = catchAsync(async (req, res, next) => {
  const token = req.header(TOKEN_HEADER);
  if (!token) throw unauthorized(MISSING_TOKEN);
  const { payload, error } = verifyUserToken(token);
  if (error) throw tokenError(error);
  const roleId = req.headers.role_id;
  if (!roleId) throw unauthorized("Send the role_id header with the access token.");
  const loaded = await loadUser(token, payload, roleId);
  if (loaded.error) throw loaded.error;
  await parseUploads(req, res);
  attachUser(req, loaded);
  next();
});

// Explicitly public: no token needed
const publicRoute = catchAsync(async (req, res, next) => {
  await parseUploads(req, res);
  next();
});

module.exports = {
  publicRoute,
  requireAuth,
  requireAppUser,
  requireAdmin,
  requireAdminRole,
};
