const httpStatus = require("http-status");

const catchAsync = require("../utils/catchAsync");
const { roleService } = require("../services");
const { rolesTypes } = require("../config/types");
const responseWrapper = require("../config/responseWrapper");
const ApiError = require("../utils/ApiError");


//we are using only two levels of amdin,admin one and adminlevel two
const isAdmin = catchAsync(async (req, res, next) => {

    try {
        const roleDoc = await roleService.findRoleById(req.user.role_id);
        if(roleDoc && roleDoc.name === rolesTypes.ADM){
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

const isAdminLevelTwo = catchAsync(async (req, res, next) => {

    try {
        const roleDoc = await roleService.findRoleById(req.user.role_id);
        if(roleDoc && (roleDoc.name === rolesTypes.ADM || roleDoc.name === rolesTypes.ADM_LEVEL_1 || roleDoc.name === rolesTypes.ADM_LEVEL_2)){
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

const isEditor = catchAsync(async (req, res, next) => {
	try {
		const roleDoc = await roleService.findRoleById(req.user.id);
		if (
			roleDoc &&
			(roleDoc.name === rolesTypes.SUP_ADM ||
				roleDoc.name === rolesTypes.ADM ||
				roleDoc.name === rolesTypes.SUB_ADM ||
				roleDoc.name === rolesTypes.ENG ||
				roleDoc.name === rolesTypes.EDTR)
		) {
			next();
		} else {
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
	isAdmin,
	isAdminLevelOne,
	isAdminLevelTwo,
	isEditor,
};
