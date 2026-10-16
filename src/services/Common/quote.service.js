/** @format */

const { status: httpStatus } = require("http-status");
const ApiError = require("../../utils/ApiError");
const {
	User,
	Profile,
	QuoteFormQuestion,
	QuoteRequest,
	QuoteFormAnswer,
} = require("../../models");
const { quoteQuestionTypes, quoteRequestStatusTypes } = require("../../config/types");

const createQuestions = async (reqBody) => {
	try {
		if (!reqBody.questions || reqBody.questions.length === 0) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Questions array is required and cannot be empty"
			);
		}

		// Ensure `reqBody.questions` is always an array
		const questionsArray = Array.isArray(reqBody.questions)
			? reqBody.questions
			: [reqBody.questions];

		// Validate each question
		const questionEntries = questionsArray.map((q) => {
			if (!q.question || !q.type) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					"Each question must have a question text and type"
				);
			}
			return {
				question: q.question,
				type: q.type,
			};
		});

		// Insert questions into the database
		const questionDocs = await QuoteFormQuestion.bulkCreate(questionEntries);

		return {
			message: "Questions created successfully",
			questions: questionDocs,
		};
	} catch (error) {
		throw ApiError.from(error);
	}
};

const getAllQuestions = async () => {
	try {
		// Fetch all active forms
		const forms = await QuoteFormQuestion.findAll({
			where: { is_active: true },
		});

		if (!forms || forms.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No forms available.");
		}

		return forms;
	} catch (error) {
		throw ApiError.from(error);
	}
};

const editQuestion = async (reqBody, id) => {
	try {
		// Find the question by ID
		const questionDoc = await QuoteFormQuestion.findByPk(id);
		if (!questionDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Question not found");
		}

		// Update only the fields that are provided in the request
		if (reqBody.question && reqBody.question.trim() !== "") {
			questionDoc.question = reqBody.question;
		}
		if (reqBody.type && Object.values(quoteQuestionTypes).includes(reqBody.type)) {
			questionDoc.type = reqBody.type;
		}

		// Save the updated question
		await questionDoc.save();
		return questionDoc;
	} catch (error) {
		throw ApiError.from(error);
	}
};

const deleteQuestion = async (id) => {
	try {
		const contactUsDoc = await QuoteFormQuestion.findByPk(id);
		if (!contactUsDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Data not found");
		}
		await contactUsDoc.destroy();
	} catch (error) {
		throw ApiError.from(error);
	}
};

const getQuoteRequests = async () => {
	try {
		const quoteRequests = await QuoteRequest.findAll({
			where: { is_active: true },
			order: [["created_at", "DESC"]],
			include: [
				{
					model: QuoteFormAnswer,
					as: "answers",
					attributes: ["id", "answer", "question_id"],
					include: [
						{
							model: QuoteFormQuestion,
							as: "question",
							attributes: ["id", "question", "type"],
						},
					],
				},
				{
					model: User,
					as: "user",
					attributes: ["id", "email"],
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
			],
		});

		return quoteRequests;
	} catch (error) {
		throw ApiError.from(error);
	}
};

const updateStatus = async (reqBody, id) => {
	try {
		const { status, quoted_price } = reqBody;

		if (![quoteRequestStatusTypes.ACCEPTED, quoteRequestStatusTypes.REJECTED].includes(status)) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Invalid status. Use 'accepted' or 'rejected'."
			);
		}

		const quoteRequest = await QuoteRequest.findByPk(id);

		if (!quoteRequest) {
			throw new ApiError(httpStatus.NOT_FOUND, "Quote request not found");
		}

		if (
			status === quoteRequestStatusTypes.ACCEPTED &&
			(quoted_price === undefined || quoted_price === null)
		) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"quoted_price is required when status is 'accepted'"
			);
		}

		await quoteRequest.update({
			status,
			quoted_price: status === quoteRequestStatusTypes.ACCEPTED ? quoted_price : null,
		});

		return {
			success: true,
			message: "Quote status updated successfully",
			data: {
				id: quoteRequest.id,
				status: quoteRequest.status,
				quoted_price: quoteRequest.quoted_price,
			},
		};
	} catch (error) {
		throw ApiError.from(error);
	}
};

// user apis
const submitForm = async (reqBody) => {
	try {
		const { user, answers } = reqBody;

		if (!user || !user.id) {
			throw new ApiError(httpStatus.BAD_REQUEST, "User ID is required");
		}

		// Ensure answers is array
		let parsedAnswers = answers;
		if (typeof parsedAnswers === "string") {
			try {
				parsedAnswers = JSON.parse(parsedAnswers);
			} catch {
				throw new ApiError(httpStatus.BAD_REQUEST, "Invalid answers JSON");
			}
		}

		if (!Array.isArray(parsedAnswers) || parsedAnswers.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Answers array is required");
		}

		// ✅ Step 1: Create parent quote request
		const quoteRequest = await QuoteRequest.create({
			user_id: user.id,
			status: quoteRequestStatusTypes.PENDING,
		});

		// ✅ Step 2: Fetch valid active questions
		const questions = await QuoteFormQuestion.findAll({
			where: { is_active: true },
			attributes: ["id"],
		});

		const validQuestionIds = questions.map((q) => q.id);

		// ✅ Step 3: Validate + prepare answers
		const answerEntries = parsedAnswers.map((item) => {
			if (!item.questionId || item.answer === undefined) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					"Each answer must have questionId and answer"
				);
			}

			if (!validQuestionIds.includes(item.questionId)) {
				throw new ApiError(
					httpStatus.BAD_REQUEST,
					`Invalid question ID: ${item.questionId}`
				);
			}

			return {
				quote_request_id: quoteRequest.id,
				user_id: user.id,
				question_id: item.questionId,
				answer: String(item.answer),
			};
		});

		// ✅ Step 4: Save answers
		await QuoteFormAnswer.bulkCreate(answerEntries);

		return {
			message: "Quote request submitted successfully",
			quote_request_id: quoteRequest.id,
		};
	} catch (error) {
		throw ApiError.from(error);
	}
};

const getQuoteRequestsByUser = async (reqBody) => {
	try {
		const { user } = reqBody;
		const quoteRequests = await QuoteRequest.findAll({
			where: { user_id: user.id, is_active: true },
			order: [["created_at", "DESC"]],
			include: [
				{
					model: QuoteFormAnswer,
					as: "answers",
					attributes: ["id", "answer", "question_id"],
					include: [
						{
							model: QuoteFormQuestion,
							as: "question",
							attributes: ["id", "question", "type"],
						},
					],
				},
			
			],
		});

		return quoteRequests;
	} catch (error) {
		throw ApiError.from(error);
	}
};

module.exports = {
	createQuestions,
	getAllQuestions,
	editQuestion,
	deleteQuestion,
	getQuoteRequests,
	updateStatus,

	submitForm,
	getQuoteRequestsByUser,
};
