/** @format */

const httpStatus = require("http-status");

const {
	Service,
	ServiceAttachment,
	ServiceReview,
	ServiceChecklist,
	ServiceChecklistMapping,
	ServiceChecklistHeading,
	User,
	Profile,
} = require("../../models");
const ApiError = require("../../utils/ApiError");

// const createService = async (reqBody, files) => {
// 	console.log("files", files);
// 	try {
// 		// Validate abbreviation (must be 3 alphabets)
// 		const abbreviation = reqBody.abbreviation;
// 		if (!/^[A-Za-z]{3}$/.test(abbreviation)) {
// 			throw new ApiError(
// 				httpStatus.BAD_REQUEST,
// 				"Abbreviation must be exactly three alphabets"
// 			);
// 		}

// 		// Create Service Object
// 		const serviceObj = {
// 			name: reqBody.name,
// 			description: reqBody.description,
// 			abbreviation: abbreviation,
// 			price: reqBody.price,
// 		};

// 		// Save Service in DB
// 		const serviceDoc = await Service.create(serviceObj);
// 		if (!serviceDoc) {
// 			throw new ApiError(
// 				httpStatus.INTERNAL_SERVER_ERROR,
// 				"Failed to create new Service"
// 			);
// 		}

// 		// ✅ Fix: Only process checklist if it's provided and valid
// 		if (reqBody.checklist) {
// 			let checklistData = reqBody.checklist;

// 			// If checklist is sent as a string, convert it to an array
// 			if (typeof checklistData === "string") {
// 				try {
// 					checklistData = JSON.parse(checklistData);
// 				} catch (error) {
// 					throw new ApiError(
// 						httpStatus.BAD_REQUEST,
// 						"Invalid checklist format, expected an array."
// 					);
// 				}
// 			}

// 			// Ensure checklistData is an array before processing
// 			if (Array.isArray(checklistData) && checklistData.length > 0) {
// 				for (let task of checklistData) {
// 					await ServiceChecklist.create({
// 						service_id: serviceDoc.id,
// 						task: task,
// 						is_completed: false,
// 					});
// 				}
// 			}
// 		}

// 		// ✅ Handle Image Uploads if images are provided
// 		if (files?.images?.length) {
// 			for (let currImage of files.images) {
// 				await ServiceAttachment.create({
// 					service_id: serviceDoc.id,
// 					title: "Service Image",
// 					file_type: "Image",
// 					file_name: currImage.filename,
// 					file_uri: "/images",
// 					file_size: currImage.size,
// 				});
// 			}
// 		}

// 		return serviceDoc;
// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message
// 		);
// 	}
// };

const createService = async (reqBody, files) => {
	try {
		const { name, description, service_checklist_ids, abbreviation, price } =
			reqBody;

		const abbreviationName = reqBody.abbreviation;
		if (!/^[A-Za-z]{3}$/.test(abbreviation)) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Abbreviation must be exactly three alphabets"
			);
		}

		const serviceObj = {
			name: name,
			description: description,
			abbreviation: abbreviationName,
			price: price,
		};

		// Save Service in DB
		const serviceDoc = await Service.create(serviceObj);
		if (!serviceDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Service"
			);
		}

		if (
			service_checklist_ids &&
			Array.isArray(service_checklist_ids) &&
			service_checklist_ids.length > 0
		) {
			for (const checklistId of service_checklist_ids) {
				const blogCategoryMapping = {
					service_id: serviceDoc.id,
					service_checklist_id: checklistId,
				};
				await ServiceChecklistMapping.create(blogCategoryMapping);
			}
		}

		// ✅ Handle Image Uploads if images are provided
		if (files?.images?.length) {
			for (let currImage of files.images) {
				await ServiceAttachment.create({
					service_id: serviceDoc.id,
					title: "Service Image",
					file_type: "Image",
					file_name: currImage.filename,
					file_uri: "/images",
					file_size: currImage.size,
				});
			}
		}

		return serviceDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllServices = async () => {
	try {
		const serviceDoc = await Service.findAll({
			where: { is_active: 1 },
			order: [["created_at", "ASC"]],
			include: [
				{
					model: ServiceAttachment,
					as: "service_attachments",
					attributes: [
						"id",
						"file_type",
						"file_name",
						"file_uri",
						"service_id",
						"title",
					],
				},{
					model:ServiceReview,
					as:"service_reviews",
					include: [
				{
					model: User,
					as: "reviews_user",
					attributes: ["id", "email"],
					required: false,
					include: [
						{
							model: Profile,
							as: "user_profile",
							attributes: ["id", "name"],
						},
					],
				},
			],
				}
			],
		});
		if (!serviceDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Service"
			);
		}
		return serviceDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllServicesByAdmin = async () => {
	try {
		const serviceDoc = await Service.findAll({
			where: { is_active: 1 },
			order: [["created_at", "ASC"]],
			include: [
				{
					model: ServiceAttachment,
					as: "service_attachments",
					attributes: [
						"id",
						"file_type",
						"file_name",
						"file_uri",
						"service_id",
						"title",
					],
				},
				// {
				// 	model: ServiceChecklist,
				// 	as: "service_checklist",
				// 	attributes: ["id", "task"],
				// 	through: { attributes: [] },
				// },
			],
		});
		if (!serviceDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Service"
			);
		}
		return serviceDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const findServiceById = async (id) => {
	try {
		const serviceDoc = await Service.findByPk(id, {
			include: [
				{
					model: ServiceAttachment,
					as: "service_attachments",
					attributes: [
						"id",
						"file_type",
						"file_name",
						"file_uri",
						"service_id",
						"title",
					],
				},
				{
					model: ServiceChecklistMapping,
					as: "service_mapping_service_chechklist",
					include: [
						{
							model: ServiceChecklist,
							as: "service_checklist",
							attributes: ["id", "task", "heading_id"],
							include: [
								{
									model: ServiceChecklistHeading,
									as: "checklists",
									attributes: ["id", "title"],
								},
							],
						},
					],
				},
				{
					model: ServiceReview,
					as: "service_reviews",
				},
			],
		});

		if (!serviceDoc) return [];

		const service = serviceDoc.toJSON();

		// Group checklist items by heading
		const checklistGrouped = {};

		service.service_mapping_service_chechklist?.forEach((mapping) => {
			const checklist = mapping.service_checklist;
			if (checklist) {
				const headingId = checklist.heading_id;
				const headingTitle = checklist.checklists?.title || "No Heading";

				if (!checklistGrouped[headingId]) {
					checklistGrouped[headingId] = {
						heading_id: headingId,
						heading_title: headingTitle,
						tasks: [],
					};
				}

				checklistGrouped[headingId].tasks.push({
					id: checklist.id,
					task: checklist.task,
				});
			}
		});

		const formattedResponse = {
			id: service.id,
			name: service.name,
			description: service.description,
			abbreviation: service.abbreviation,
			average_rating: service.average_rating,
			price: service.price,
			rating: service.rating,
			// Keep attachments exactly as is from Sequelize response (no mapping/transformation)
			service_attachments: service.service_attachments || [],
			service_reviews: service.service_reviews || [],
			checklists: Object.values(checklistGrouped), // grouped checklist by heading
		};

		return formattedResponse;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateService = async (reqBody, files, id) => {
	try {
		const {
			name,
			description,
			price,
			abbreviation,
			service_checklist_ids, // Only heading IDs now
			removeImageIds,
		} = reqBody;

		const serviceDoc = await Service.findByPk(id);
		if (!serviceDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
		}

		// ✅ Update basic fields
		if (name && name !== serviceDoc.name) serviceDoc.name = name;
		if (description && description !== serviceDoc.description)
			serviceDoc.description = description;
		if (price && price !== serviceDoc.price) serviceDoc.price = price;
		if (abbreviation && abbreviation !== serviceDoc.abbreviation)
			serviceDoc.abbreviation = abbreviation;
		await serviceDoc.save();

		// ✅ Handle checklist mappings by heading ID
		let newChecklistMap = []; // { checklist_id, heading_id }
		let newHeadingIds = [];

		if (Array.isArray(service_checklist_ids)) {
			for (const headingIdRaw of service_checklist_ids) {
				const headingId = parseInt(headingIdRaw, 10);
				if (isNaN(headingId)) continue;

				const heading = await ServiceChecklistHeading.findByPk(headingId);
				if (!heading) continue;

				newHeadingIds.push(headingId);

				const checklists = await ServiceChecklist.findAll({
					where: { heading_id: headingId },
				});
				checklists.forEach((checklist) => {
					newChecklistMap.push({
						checklist_id: checklist.id,
						heading_id: headingId,
					});
				});
			}
		}

		// ✅ Get current mappings
		const currentMappings = await ServiceChecklistMapping.findAll({
			where: { service_id: id },
		});
		const currentChecklistIds = currentMappings.map(
			(m) => m.service_checklist_id
		);
		const currentHeadingIds = [
			...new Set(currentMappings.map((m) => m.service_checklist_heading_id)),
		];

		// ✅ Remove mappings for headings not included anymore
		const headingIdsToRemove = currentHeadingIds.filter(
			(headingId) => !newHeadingIds.includes(headingId)
		);
		if (headingIdsToRemove.length > 0) {
			await ServiceChecklistMapping.destroy({
				where: {
					service_id: id,
					service_checklist_heading_id: headingIdsToRemove,
				},
			});
		}

		// ✅ Add new mappings (only if checklist_id not already present)
		const checklistsToAdd = newChecklistMap.filter(
			(c) => !currentChecklistIds.includes(c.checklist_id)
		);

		if (checklistsToAdd.length > 0) {
			const newMappings = checklistsToAdd.map((c) => ({
				service_id: id,
				service_checklist_id: c.checklist_id,
				service_checklist_heading_id: c.heading_id,
			}));
			await ServiceChecklistMapping.bulkCreate(newMappings);
		}

		// ✅ Remove images
		if (Array.isArray(removeImageIds) && removeImageIds.length > 0) {
			const parsedRemoveImageIds = removeImageIds.map((id) => parseInt(id, 10));
			await ServiceAttachment.destroy({
				where: {
					service_id: id,
					id: parsedRemoveImageIds,
					file_type: "Image",
				},
			});
		}

		// ✅ Add new images
		if (files?.images?.length > 0) {
			const imageAttachments = files.images.map((image) => ({
				service_id: id,
				title: "Service Image",
				file_type: "Image",
				file_name: image.filename,
				file_uri: `/uploads/${image.filename}`,
				file_size: image.size,
			}));
			await ServiceAttachment.bulkCreate(imageAttachments);
		}

		return serviceDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const updateServicePrices = async (reqBody) => {
	try {
		const { old_price, new_price } = reqBody;

		if (!old_price || !new_price) {
			return res
				.status(400)
				.json({ message: "Both old_price and new_price are required." });
		}

		const updatedCount = await Service.update(
			{ price: new_price },
			{ where: { price: old_price } }
		);

		return updatedCount
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getServicePrices = async () => {
  try {
    const service = await Service.findOne({
      where: { is_active: true },
      attributes: ['price'],
      raw: true,
    });

    return service ? service.price : null;
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message
    );
  }
};


// const findServiceById = async (id) => {
// 	try {
// 		const serviceDoc = await Service.findByPk(id, {
// 			include: [
// 				{
// 					model: ServiceAttachment,
// 					as: "service_attachments",
// 					attributes: [
// 						"id",
// 						"file_type",
// 						"file_name",
// 						"file_uri",
// 						"service_id",
// 						"title",
// 					],
// 				},
// 				{
// 					model: ServiceChecklistMapping,
// 					as: "service_mapping_service_chechklist", // adjust alias if different
// 					include: [
// 						{
// 							model: ServiceChecklist,
// 							as: "service_checklist",
// 							attributes: ["id", "task", "heading_id"],
// 							include: [
// 								{
// 									model: ServiceChecklistHeading,
// 									as: "checklists",
// 									attributes: ["id", "title"],
// 								},
// 							],
// 						},
// 					],
// 				},
// 				// {
// 				// 	model: ServiceChecklist,
// 				// 	as: "service_checklist",
// 				// 	attributes: ["id", "task"],
// 				// 	through: { attributes: [] },
// 				// },
// 				{
// 					model: ServiceReview,
// 					as: "service_reviews",
// 				},
// 			],
// 		});
// 		return serviceDoc ? serviceDoc : [];
// 	} catch (error) {
// 		throw new ApiError(
// 			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
// 			error.message
// 		);
// 	}
// };

// const updateService = async (reqBody, files, id) => {
// 	try {
// 		const {
// 			name,
// 			description,
// 			price,
// 			abbreviation,
// 			service_checklist_ids, // IDs can include headings or individual checklist IDs
// 			removeImageIds,
// 		} = reqBody;

// 		const serviceDoc = await Service.findByPk(id);
// 		if (!serviceDoc) {
// 			throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
// 		}

// 		// ✅ Update basic fields
// 		if (name && name !== serviceDoc.name) serviceDoc.name = name;
// 		if (description && description !== serviceDoc.description) serviceDoc.description = description;
// 		if (price && price !== serviceDoc.price) serviceDoc.price = price;
// 		if (abbreviation && abbreviation !== serviceDoc.abbreviation) serviceDoc.abbreviation = abbreviation;
// 		await serviceDoc.save();

// 		// ✅ Prepare new checklist IDs and map them to headings
// 		let newChecklistMap = []; // Array of { checklist_id, heading_id }

// 		if (Array.isArray(service_checklist_ids)) {
// 			for (const idOrHeading of service_checklist_ids) {
// 				const parsedId = parseInt(idOrHeading, 10);
// 				const isHeading = await ServiceChecklistHeading.findByPk(parsedId);

// 				if (isHeading) {
// 					const checklists = await ServiceChecklist.findAll({ where: { heading_id: parsedId } });
// 					checklists.forEach((checklist) => {
// 						newChecklistMap.push({
// 							checklist_id: checklist.id,
// 							heading_id: checklist.heading_id,
// 						});
// 					});
// 				} else {
// 					const checklist = await ServiceChecklist.findByPk(parsedId);
// 					if (checklist) {
// 						newChecklistMap.push({
// 							checklist_id: checklist.id,
// 							heading_id: checklist.heading_id,
// 						});
// 					}
// 				}
// 			}
// 		}

// 		const newChecklistIds = newChecklistMap.map((c) => c.checklist_id);

// 		// ✅ Get current mappings
// 		const currentMappings = await ServiceChecklistMapping.findAll({ where: { service_id: id } });
// 		const currentChecklistIds = currentMappings.map((m) => m.checklist_id);

// 		const checklistsToAdd = newChecklistMap.filter(
// 			(c) => !currentChecklistIds.includes(c.checklist_id)
// 		);

// 		const checklistsToRemove = currentChecklistIds.filter(
// 			(id) => !newChecklistIds.includes(id)
// 		);

// 		// ✅ Remove old mappings
// 		if (checklistsToRemove.length > 0) {
// 			await ServiceChecklistMapping.destroy({
// 				where: {
// 					service_id: id,
// 					service_checklist_id: checklistsToRemove,
// 				},
// 			});
// 		}

// 		// ✅ Add new mappings
// 		if (checklistsToAdd.length > 0) {
// 			const newMappings = checklistsToAdd.map((c) => ({
// 				service_id: id,
// 				service_checklist_id: c.checklist_id,
// 				service_checklist_heading_id: c.heading_id,
// 			}));
// 			await ServiceChecklistMapping.bulkCreate(newMappings);
// 		}

// 		// ✅ Remove images
// 		if (Array.isArray(removeImageIds) && removeImageIds.length > 0) {
// 			const parsedRemoveImageIds = removeImageIds.map((id) => parseInt(id, 10));
// 			await ServiceAttachment.destroy({
// 				where: {
// 					service_id: id,
// 					id: parsedRemoveImageIds,
// 					file_type: "Image",
// 				},
// 			});
// 		}

// 		// ✅ Add new images
// 		if (files?.images?.length > 0) {
// 			const imageAttachments = files.images.map((image) => ({
// 				service_id: id,
// 				title: "Service Image",
// 				file_type: "Image",
// 				file_name: image.filename,
// 				file_uri: `/uploads/${image.filename}`,
// 				file_size: image.size,
// 			}));
// 			await ServiceAttachment.bulkCreate(imageAttachments);
// 		}

// 		return serviceDoc;
// 	} catch (error) {
// 		throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
// 	}
// };

// const updateService = async (reqBody, files, id) => {
// 	try {
// 		const { name, description, price, abbreviation, service_checklist_ids, removeImageIds } = reqBody;

// 		// 🔹 Fetch the service
// 		const serviceDoc = await Service.findByPk(id);
// 		if (!serviceDoc) {
// 			throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
// 		}

// 		// ✅ Update basic service fields if changed
// 		if (name && name !== serviceDoc.name) serviceDoc.name = name;
// 		if (description && description !== serviceDoc.description) serviceDoc.description = description;
// 		if (price && price !== serviceDoc.price) serviceDoc.price = price;
// 		if (abbreviation && abbreviation !== serviceDoc.abbreviation) serviceDoc.abbreviation = abbreviation;

// 		await serviceDoc.save();

// 		// ✅ Update Service Checklist Relationship (Many-to-Many)
// 		const currentChecklists = await serviceDoc.getService_checklist(); // Ensure alias matches Sequelize model
// 		const currentChecklistIds = currentChecklists.map((checklist) => checklist.id);

// 		const newChecklistIds = Array.isArray(service_checklist_ids)
// 			? service_checklist_ids.map((id) => parseInt(id, 10))
// 			: [];

// 		const checklistsToAdd = newChecklistIds.filter((newId) => !currentChecklistIds.includes(newId));
// 		const checklistsToRemove = currentChecklistIds.filter((currentId) => !newChecklistIds.includes(currentId));

// 		if (checklistsToAdd.length > 0) {
// 			await serviceDoc.addService_checklist(checklistsToAdd);
// 		}
// 		if (checklistsToRemove.length > 0) {
// 			await serviceDoc.removeService_checklist(checklistsToRemove);
// 		}

// 		// ✅ Remove specified images
// 		if (Array.isArray(removeImageIds) && removeImageIds.length > 0) {
// 			const parsedRemoveImageIds = removeImageIds.map((id) => parseInt(id, 10)); // Ensure integers
// 			await ServiceAttachment.destroy({
// 				where: {
// 					service_id: id,
// 					id: parsedRemoveImageIds,
// 					file_type: "Image",
// 				},
// 			});
// 		}

// 		// ✅ Add new images
// 		if (files?.images?.length > 0) {
// 			const imageAttachments = files.images.map((image) => ({
// 				service_id: id,
// 				title: "Service Image",
// 				file_type: "Image",
// 				file_name: image.filename,
// 				file_uri: `/uploads/${image.filename}`, // ✅ Ensure correct file path
// 				file_size: image.size,
// 			}));
// 			await ServiceAttachment.bulkCreate(imageAttachments);
// 		}

// 		return serviceDoc;
// 	} catch (error) {
// 		throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message);
// 	}
// };

const deleteService = async (id) => {
	try {
		const serviceDoc = await Service.findByPk(Number(id));
		if (!serviceDoc) {
			throw new ApiError(httpStatus.NOT_FOUND, "Service not found");
		}
		await ServiceChecklistMapping.destroy({ where: { service_id: id } });
		await ServiceAttachment.destroy({ where: { service_id: id } });
		await serviceDoc.destroy();

		return { success: true, message: "Service deleted successfully" };
	} catch (error) {
		throw new ApiError(
			error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};

const getAllServiceNameByAdmin = async () => {
	try {
		const serviceDoc = await Service.findAll({
			where: { is_active: 1 },
			order: [["created_at", "ASC"]],
			attributes:["id","name","price"]
		});
		if (!serviceDoc) {
			throw new ApiError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Failed to create new Service"
			);
		}
		return serviceDoc;
	} catch (error) {
		throw new ApiError(
			error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR,
			error.message
		);
	}
};


module.exports = {
	createService,
	getAllServices,
	getAllServicesByAdmin,
	findServiceById,
	updateService,
	deleteService,
	updateServicePrices,
	getServicePrices,
	getAllServiceNameByAdmin
};
