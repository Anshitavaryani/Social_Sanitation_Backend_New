const { status: httpStatus } = require("http-status");

const catchAsync = require("../utils/catchAsync");
const { roleService } = require("../services");
const { rolesTypes } = require("../config/types");
const responseWrapper = require("../config/responseWrapper");
const ApiError = require("../utils/ApiError");


//we are using only two levels of amdin,admin one and adminlevel two

const isAdminLevelOne = catchAsync(async (req, res, next) => {

    try {
        const roleDoc = await roleService.findRoleById(req.user.role_id);
		console.log(roleDoc,roleDoc.name === rolesTypes.ADM_LEVEL_1,"roldedocc==========?")
        if(roleDoc && (roleDoc.name === rolesTypes.ADM || roleDoc.name === rolesTypes.ADM_LEVEL_1)){
            next();
        }else{
            return responseWrapper(
                res,
                "",
                "You are not authorized to access this api",
                httpStatus.UNAUTHORIZED
            );
        }
    } catch (error) {
        throw new ApiError(
            error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
            error.message
        );
    }
});



module.exports = {
  isAdminLevelOne,
};
