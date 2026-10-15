/** @format */

const httpStatus = require("http-status");
const {
	Product,
	ProductRequest,
	ProductRequestAttachment,
	User,
	Profile,
	ProductAttachment,
} = require("../../models");
const ApiError = require("../../utils/ApiError");

const createProduct = async (reqBody, files) => {
	try {
		const product = await Product.create(reqBody);
		if (!product) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create product"
			);
		}

		if (files?.images?.length) {
			for (let currImage of files.images) {
				await ProductAttachment.create({
					product_id: product.id,
					title: "Product Image",
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				});
			}
		}
		return product;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error creating product"
		);
	}
};

const getAllProducts = async () => {
	try {
		const products = await Product.findAll({
			where: { is_active: true },
			order: [["created_at", "ASC"]],
			include: [
				{
					model: ProductAttachment,
					as: "product_attachments",
				},
			],
		});
		if (!products) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to fetch products"
			);
		}
		return products;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error fetching products"
		);
	}
};

const getProductById = async (id) => {
	try {
		const product = await Product.findByPk(id);
		if (!product) {
			throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
		}
		return product;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error fetching product"
		);
	}
};

const updateProductById = async (id, reqBody, files) => {
	try {
		const { removeImageIds } = reqBody;
		const product = await Product.findByPk(id);
		if (!product) {
			throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
		}

		if (Array.isArray(removeImageIds) && removeImageIds.length > 0) {
			const parsedRemoveImageIds = removeImageIds.map((id) => parseInt(id, 10));
			await ProductAttachment.destroy({
				where: {
					product_id: id,
					id: parsedRemoveImageIds,
					file_type: "Image",
				},
			});
		}

		// ✅ Add new images
		if (files?.images?.length > 0) {
			const imageAttachments = files.images.map((image) => ({
				product_id: id,
				title: "Product Image",
				file_type: "Image",
				file_name: image.filename,
				file_uri: `/uploads/${image.filename}`,
				file_size: image.size,
			}));
			await ProductAttachment.bulkCreate(imageAttachments);
		}
		await product.update(reqBody);
		return product;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error updating product"
		);
	}
};

const deleteProductById = async (body) => {
	try {
		if (!Array.isArray(body.product_id) || body.product_id.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "Invalid product_id");
		}

		// Ensure all IDs are trimmed and filtered
		const userIds = body.product_id
			.map((id) => String(id).trim())
			.filter(Boolean);

		if (userIds.length === 0) {
			throw new ApiError(httpStatus.BAD_REQUEST, "No valid user IDs provided");
		}

		// Find all users with the given IDs
		const users = await Product.findAll({
			where: {
				id: userIds,
			},
		});

		if (users.length === 0) {
			throw new ApiError(httpStatus.NOT_FOUND, "No users found");
		}

		// Send email notifications and delete users
		await Promise.all(
			users.map(async (user) => {
				await user.destroy();
			})
		);
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllRequestsByAdmin = async () => {
	try {
		const requests = await ProductRequest.findAll({
			order: [["created_at", "DESC"]],
			where: { is_active: true },
			include: [
				{
					model: User,
					as: "requested_user",
					attributes: ["id", "email"],
					required: true, 
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
				{
					model: Product,
					as: "requested_product",
					attributes: ["id", "name"],
				},
				{
					model: ProductRequestAttachment,
					as: "product_request_attachments",
				},
			],
		});

		if (!requests) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to fetch requests"
			);
		}
		return requests;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error fetching product requests"
		);
	}
};

const updateRequestStatus = async (id, reqBody) => {
	try {
		const { status } = reqBody;
		const request = await ProductRequest.findByPk(id);
		if (!request) {
			throw new ApiError(httpStatus.NOT_FOUND, "Request not found");
		}

		request.status = status;

		// if (status === "Approved") {
		// 	const product = await Product.findByPk(request.product_id);
		// 	if (product) {
		// 		await product.update({
		// 			quantity: product.quantity + request.requested_quantity,
		// 		});
		// 	}
		// }

		await request.save();
		return request;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error updating request status"
		);
	}
};

const requestStock = async (reqBody, files) => {
	try {
		const { user } = reqBody;

		const product = await Product.findByPk(reqBody.product_id);
		if (!product) {
			throw new ApiError(httpStatus.NOT_FOUND, "Product not found");
		}

		const request = await ProductRequest.create({
			product_id: reqBody.product_id,
			note: reqBody.note,
			employee_id: user.id,
			requested_quantity: reqBody.requested_quantity,
		});

		if (!request) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create stock request"
			);
		}

		if (files?.images?.length) {
			for (let currImage of files.images) {
				await ProductRequestAttachment.create({
					product_request_id: request.id,
					title: "Product Request Image",
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				});
			}
		}

		return request;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error creating stock request"
		);
	}
};

const getAllRequests = async (reqBody) => {
	try {
		const { user } = reqBody;
		const requests = await ProductRequest.findAll({
			where: { employee_id: user.id },
			order: [["created_at", "DESC"]],
			include: [
				{
					model: Product,
					as: "requested_product",
					// attributes: ["id", "name"],
				},
				{
					model: ProductRequestAttachment,
					as: "product_request_attachments",
				},
			],
		});

		if (!requests) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to fetch requests"
			);
		}
		return requests;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message || "Error fetching product requests"
		);
	}
};

module.exports = {
	createProduct,
	getAllProducts,
	getProductById,
	updateProductById,
	deleteProductById,
	requestStock,
	getAllRequests,
	updateRequestStatus,
	getAllRequestsByAdmin,
};
