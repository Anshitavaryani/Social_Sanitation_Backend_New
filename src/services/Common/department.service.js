const { status: httpStatus } = require('http-status');

const { Department } = require('../../models');
const ApiError = require('../../utils/ApiError');

const createDepartment = async (reqBody) => {
    try {
        const departmentObj = {
            name: reqBody.name
        };
        const departmentDoc = await Department.create(departmentObj);
        if (!departmentDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new Department');
        }
        return departmentDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const updateDepartment = async (reqBody, id) => {
    try {
        const departmentDoc = await Department.findByPk(id);

        if (!departmentDoc) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
        }
        if (reqBody.name && typeof reqBody.name !== 'undefined' && reqBody.name !== '') {
            departmentDoc['name'] = reqBody.name;
        };

        await departmentDoc.save();
        return departmentDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const getAllDeparments = async () => {
    try {
        const departmentDoc = await Department.findAll({ where: { is_active: 1 } });
        if (!departmentDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new Department');
        }
        return departmentDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const findDepartmentById = async (id) => {
    try {
        const departmentDoc = await Department.findByPk(id);
        return departmentDoc ? departmentDoc : [];

    } catch (error) {
        throw ApiError.from(error);
    }
};

const deleteDepartment = async (id) => {
    try {
        const departmentDoc = await Department.findByPk(Number(id));
        if (!departmentDoc) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
        }
        return await departmentDoc.destroy();

    } catch (error) {
        throw ApiError.from(error);
    }
};

module.exports = {
    getAllDeparments,
    createDepartment,
    updateDepartment,
    findDepartmentById,
    deleteDepartment
};