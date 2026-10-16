/** @format */

const { status: httpStatus } = require("http-status");
const { IMAGE_FILE_URI } = require("../../config/storage");

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

// 	try {

// 	} catch (error) {

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
					file_uri: IMAGE_FILE_URI,
					file_size: currImage.size,
				});
			}
		}

		return serviceDoc;
	} catch (error) {
		throw ApiError.from(error);
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
		throw ApiError.from(error);
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
		throw ApiError.from(error);
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
		throw ApiError.from(error);
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
				file_uri: IMAGE_FILE_URI,
				file_size: image.size,
			}));
			await ServiceAttachment.bulkCreate(imageAttachments);
		}

		return serviceDoc;
	} catch (error) {
		throw ApiError.from(error);
	}
};

const updateServicePrices = async (reqBody) => {
	try {
		const { old_price, new_price } = reqBody;

		if (!old_price || !new_price) {
			throw new ApiError(
				httpStatus.BAD_REQUEST,
				"Both old_price and new_price are required."
			);
		}

		const updatedCount = await Service.update(
			{ price: new_price },
			{ where: { price: old_price } }
		);

		return updatedCount
	} catch (error) {
		throw ApiError.from(error);
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
    throw ApiError.from(error);
  }
};


// 	try {

// 	} catch (error) {

// 	try {

// 	} catch (error) {

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
		throw ApiError.from(error);
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
		throw ApiError.from(error);
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
