/** @format */

const { status: httpStatus } = require("http-status");
const logger = require("../../config/logger");
const { IMAGE_FILE_URI, docUrl } = require("../../config/storage");
const ApiError = require("../../utils/ApiError");
const { FormSubmission, FormSection, FormAttachment } = require("../../models");
const { generatePDF, generateSpanishPDF } = require("./pdf.service");
const {
  sendFormEmailWithPDF,
  sendFormToAdminWithPDF,
} = require("./email.service");
const path = require("path");

const submitForm = async (reqBody, files) => {
  try {
    let { formData, language } = reqBody;


    // Ensure formData is parsed correctly
    if (typeof formData === "string") {
      formData = JSON.parse(formData);
    }

    if (!formData || typeof formData !== "object") {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid request format");
    }

    // Extract email from personalInfo section
    const userEmail = formData?.personalInfo?.email;
    const signatureBase64Url = formData?.personalInfo?.signature;
    const signatureCompanyBase64Url =
      formData?.floridaAgreement?.companysignature;
    const driverLicenseNumber = formData?.policy?.["Driver's License Number"];

    if (!userEmail) {
      throw new ApiError(httpStatus.BAD_REQUEST, "User email is missing");
    }

    const submissionType =
      language?.toLowerCase() === "spanish" ? "spanish" : "english";
    // Create Submission Entry
    const submission = await FormSubmission.create({
      language: submissionType,
      applicant_email: userEmail.trim().toLowerCase(),
    });


    // ✅ **Loop through formData and store each section separately**
    for (const sectionName in formData) {
      if (Object.hasOwnProperty.call(formData, sectionName)) {
        let sectionData = formData[sectionName];

        // ✅ **Ensure only that section's data is stored**
        await FormSection.create({
          submission_id: submission.id,
          section_name: sectionName,
          data: sectionData, // ✅ Store as JSON Object instead of String
        });

      }
    }

    // ✅ **Store Uploaded Files in `form_attachments`**
    if (files && files.images && files.images.length > 0) {
      for (let i = 0; i < files.images.length; i++) {
        let currImage = files.images[i];

        await FormAttachment.create({
          submission_id: submission.id,
          file_type: "Image",
          file_name: currImage.filename,
          file_uri: IMAGE_FILE_URI,
          file_size: currImage.size,
        });

      }
    }

    let pdfPath;
    if (submissionType === "spanish") {
      pdfPath = await generateSpanishPDF(
        formData,
        signatureBase64Url,
        driverLicenseNumber,
        signatureCompanyBase64Url,
        submission.id,
      );
    } else {
      pdfPath = await generatePDF(
        formData,
        signatureBase64Url,
        driverLicenseNumber,
        signatureCompanyBase64Url,
        submission.id,
      );
    }

    // Save PDF URL in database
    const pdfFileName = path.basename(pdfPath);

    const pdfUrl = docUrl(pdfFileName);

    await submission.update({
      pdf_url: pdfUrl,
    });

    // 🧾 **Generate PDF with form data**

    // 📧 **Send Email with the PDF to user**
    await sendFormEmailWithPDF(userEmail, pdfPath);
    await sendFormToAdminWithPDF(userEmail, pdfPath);

    return {
      message: "Form submitted successfully",
      submission_id: submission.id,
    };
  } catch (error) {
    logger.error("Error in submitForm:", error);
    throw ApiError.from(error);
  }
};

const getAllForm = async () => {
  try {
    const formDoc = await FormSubmission.findAll({
      where: { is_active: true },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: FormSection,
          as: "details_form_submission",
        },
      ],
    });
    if (!formDoc) {
      throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, "Data Not Found.");
    }
    return formDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getFormById = async (id) => {
  try {
    const formDoc = await FormSubmission.findOne({
      where: { id: id },
      include: [
        {
          model: FormSection,
          as: "details_form_submission",
        },
      ],
    });
    if (!formDoc) {
      throw new ApiError(httpStatus.NOT_FOUND, "Data Not Found.");
    }
    return formDoc;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const deleteForm = async (ids) => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Please provide at least one form ID",
      );
    }

    const formIds = ids
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    if (formIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Invalid form IDs");
    }

    const forms = await FormSubmission.findAll({
      where: {
        id: formIds,
      },
    });

    if (forms.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No forms found");
    }

    for (const form of forms) {
      await form.destroy();
    }

    return {
      success: true,
      message: "Forms deleted successfully",
      deleted_count: forms.length,
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getHiringFormsByEmail = async (email, name) => {
  try {
    /*
     * ==========================================
     * VALIDATION
     * ==========================================
     */

    if ((!email || !String(email).trim()) && (!name || !String(name).trim())) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Email or name is required");
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    const normalizedName = name ? String(name).trim().toLowerCase() : null;

    /*
     * ==========================================
     * GET ACTIVE HIRING FORMS
     * ==========================================
     *
     * We include personalInfo because the
     * applicant name is stored inside its JSON.
     */

    const submissions = await FormSubmission.findAll({
      where: {
        is_active: true,
      },

      include: [
        {
          model: FormSection,
          as: "details_form_submission",

          where: {
            section_name: "personalInfo",
          },

          required: false,
        },
      ],

      order: [["created_at", "DESC"]],
    });

    /*
     * ==========================================
     * FILTER BY EMAIL OR NAME
     * ==========================================
     */

    const filteredSubmissions = submissions.filter((submission) => {
      let personalInfo = {};

      const personalInfoSection = submission.details_form_submission?.find(
        (section) => section.section_name === "personalInfo",
      );

      if (personalInfoSection?.data) {
        try {
          personalInfo =
            typeof personalInfoSection.data === "string"
              ? JSON.parse(personalInfoSection.data)
              : personalInfoSection.data;
        } catch (error) {
          logger.error(
            `Failed to parse personalInfo for submission ${submission.id}:`,
            error,
          );
        }
      }

      /*
       * -------------------------------
       * EMAIL MATCH
       * -------------------------------
       */

      const applicantEmail = String(
        submission.applicant_email || personalInfo.email || "",
      )
        .trim()
        .toLowerCase();

      const emailMatches =
        normalizedEmail && applicantEmail === normalizedEmail;

      /*
       * -------------------------------
       * NAME MATCH
       * -------------------------------
       */

      const firstName = personalInfo.firstName || "";

      const middleName = personalInfo.middleName || "";

      const lastName = personalInfo.lastName || "";

      const fullName = [firstName, middleName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const nameMatches =
        normalizedName && fullName.toLowerCase().includes(normalizedName);

      /*
       * -------------------------------
       * EITHER EMAIL OR NAME
       * -------------------------------
       */

      return emailMatches || nameMatches;
    });

    /*
     * ==========================================
     * BUILD RESPONSE
     * ==========================================
     */

    const data = filteredSubmissions.map((submission) => {
      let personalInfo = {};

      const personalInfoSection = submission.details_form_submission?.find(
        (section) => section.section_name === "personalInfo",
      );

      if (personalInfoSection?.data) {
        try {
          personalInfo =
            typeof personalInfoSection.data === "string"
              ? JSON.parse(personalInfoSection.data)
              : personalInfoSection.data;
        } catch (error) {
          logger.error(
            `Failed to parse personalInfo for submission ${submission.id}:`,
            error,
          );
        }
      }

      const {
        firstName = "",
        middleName = "",
        lastName = "",
        email: formEmail = "",
        phone = "",
        streetAddress = "",
        aptSuite = "",
        city = "",
        state = "",
        country = "",
        zipCode = "",
      } = personalInfo;

      const fullName = [firstName, middleName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const fullAddress = [
        streetAddress,
        aptSuite,
        city,
        state,
        country,
        zipCode,
      ]
        .filter(Boolean)
        .join(", ");

      return {
        submission_id: submission.id,

        submitted_at: submission.created_at,

        language: submission.language,

        name: fullName,

        first_name: firstName,

        middle_name: middleName,

        last_name: lastName,

        email: formEmail || submission.applicant_email,

        phone,

        address: streetAddress,

        apt_suite: aptSuite,

        city,

        state,
        country,

        zip_code: zipCode,

        full_address: fullAddress,

        pdf_url: submission.pdf_url,
      };
    });

    return data;
  } catch (error) {
    logger.error("Error in getHiringFormsByEmail:", error);

    if (error instanceof ApiError) {
      throw error;
    }

    throw ApiError.orInternal(error);
  }
};

module.exports = {
  submitForm,
  getAllForm,
  getFormById,
  deleteForm,
  getHiringFormsByEmail,
};
