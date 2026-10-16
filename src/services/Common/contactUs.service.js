const { status: httpStatus } = require("http-status");

const { ContactUs } = require("../../models");
const ApiError = require("../../utils/ApiError");

const createContactUs = async (reqBody) => {
  try {
    const contactUsObj = {
      email: reqBody.email,
      contact_number: reqBody.contact_number,
      address: reqBody.address,
    };

    const contactUsDoc = await ContactUs.create(contactUsObj);
    if (!contactUsDoc) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to create new ContactUs"
      );
    }
    return contactUsDoc ? true : false;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const updateContactUs = async (reqBody, id) => {
  try {
    const contactUsDoc = await ContactUs.findByPk(id);
    if (!contactUsDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Data not found");
    }

    if (
      reqBody.email &&
      typeof reqBody.email !== "undefined" &&
      reqBody.email !== ""
    )
      contactUsDoc["email"] = reqBody.email;
    if (
      reqBody.address &&
      reqBody.address !== "" &&
      typeof reqBody.address !== "undefined"
    )
      contactUsDoc["address"] = reqBody.address;
    if (
      reqBody.contact_number &&
      reqBody.contact_number !== "" &&
      typeof reqBody.contact_number !== "undefined"
    )
      contactUsDoc["contact_number"] = reqBody.contact_number;

    await contactUsDoc.save();
    return contactUsDoc ? contactUsDoc : {};
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getAllContactUs = async () => {
  try {
    const contactUsDoc = await ContactUs.findAll({
      attributes: ["id", "email", "address", "contact_number"],
      where: { is_active: true },
    });
    if (!contactUsDoc) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Data Not Found.");
    }
    return contactUsDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getContactUs = async () => {
  try {
    const contactUsDoc = await ContactUs.findAll({
      attributes: ["id", "email", "address", "contact_number"],
      where: { is_active: true },
    });
    if (!contactUsDoc) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Data Not Found.");
    }
    return contactUsDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const findContactUsById = async (id) => {
  try {
    const contactUsDoc = await ContactUs.findByPk(id, {});
    return contactUsDoc ? contactUsDoc : [];
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteContactUs = async (id) => {
  try {
    const contactUsDoc = await ContactUs.findByPk(id);
    if (!contactUsDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Data not found");
    }
    await contactUsDoc.destroy();
  } catch (error) {
    throw ApiError.from(error);
  }
};

module.exports = {
  createContactUs,
  getAllContactUs,
  findContactUsById,
  updateContactUs,
  deleteContactUs,
  getContactUs
};

