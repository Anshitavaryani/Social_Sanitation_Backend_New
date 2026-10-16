const catchAsync = require('../../utils/catchAsync');
const { countryService } = require('../../services');
const pick = require('../../utils/pick');
const { parsePagination } = require('../../utils/pagination');
const responseWrapper = require('../../config/responseWrapper');

const getAllCountry = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, []);

    Object.assign(query, parsePagination(query));
    if (!query['sortBy'] || query['sortBy'] === '') {
        query['sortBy'] = 'ASC'
    }

    const response = await countryService.getAllCountry(body, query, params);
    return responseWrapper(res, response, '');
});

const getCountryId = catchAsync(async (req, res) => {

    const body = pick(req.body, []);
    const query = pick(req.query, ['sortBy', 'limit', 'page']);
    const params = pick(req.params, ['id']);

    const response = await countryService.getCountryId(body, query, params);
    return responseWrapper(res, response, '');
});

module.exports = {
    getAllCountry,
    getCountryId
};