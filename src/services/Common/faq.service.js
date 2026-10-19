const { status: httpStatus } = require('http-status');


const { Faq } = require('../../models');
const ApiError = require('../../utils/ApiError');


const createFaq = async (reqBody) => {
    try {
        const faqObj = {
            question: reqBody.question,
            answer: reqBody.answer
        };
        const faqDoc = await Faq.create(faqObj);
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create new FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const getAllFaq = async () => {
    try {
        const faqDoc = await Faq.findAll(
            {
                attributes: ['id', 'question', 'answer'],
                where: { is_active: true },
            }
        );
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to get all FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const updateFaq = async (reqBody, id) => {
    try {
        const { question, answer } = reqBody;
        const faqObj = {};

        if (question && typeof question === 'string' && question !== '') faqObj['question'] = question;
        if (answer && typeof answer === 'string' && answer !== '') faqObj['answer'] = answer;

        const faqDoc = await Faq.update(faqObj, { where: { id: id } });
        if (!faqDoc) {
            throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update new FAQ');
        };
        return faqDoc;

    } catch (error) {
        throw ApiError.from(error);
    }
};

const deleteFaq = async (id) => {
    try {
        const faqDoc = await Faq.findOne({ where: { id: id, is_active: true } });
        if (!faqDoc) throw new ApiError(httpStatus.NOT_FOUND, 'Invalid Id');
        await faqDoc.destroy();
        return '';

    } catch (error) {
        throw ApiError.from(error);
    }
};



module.exports = {
    createFaq,
    getAllFaq,
    updateFaq,
    deleteFaq
};