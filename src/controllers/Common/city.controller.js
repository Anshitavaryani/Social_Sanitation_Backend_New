const catchAsync = require('../../utils/catchAsync');
const { cityService } = require('../../services');
const pick = require('../../utils/pick');
const { parsePagination } = require('../../utils/pagination');
const responseWrapper = require('../../config/responseWrapper');


const getAllCity = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, []);

    Object.assign(query, parsePagination(query));
    if (!query['sortBy'] || query['sortBy'] === '') {
        query['sortBy'] = 'ASC'
    }

    const response = await cityService.getAllCity(body, query, params);
    return responseWrapper(res, response, '');
});

const getCityById = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, ['id']);

    const response = await cityService.getCityById(body, query, params);
    return responseWrapper(res, response, '');
});

module.exports = {
    getAllCity,
    getCityById
};