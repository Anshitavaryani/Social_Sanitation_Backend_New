// Admin user service: review emails and links, and Twilio's SMS delivery status

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { User, Profile, ReviewLink } = require("../../../models");
const ApiError = require("../../../utils/ApiError");
const { sendReviewEmailWithPDF } = require("../../Common/email.service");

const handleTwilioSmsStatus = async (data) => {
  const { MessageSid, MessageStatus } = data;

  logger.info("SMS status:", MessageSid, MessageStatus);

  // Optional: update DB here

  return true;
};

const sendReviewEmail = async (reqBody) => {
  try {
    const { user_id } = reqBody;

    // ✅ 1. Validate user
    const userDocs = await User.findOne({ where: { id: user_id } });
    if (!userDocs) {
      throw new ApiError(httpStatus.NOT_FOUND, "User not found");
    }

    // ✅ 2. Fetch user's profile for full name
    const userProfile = await Profile.findOne({ where: { user_id } });
    const fullName = userProfile
      ? userProfile.name || "Valued Client"
      : "Valued Client";

    // ✅ 3. Get review links (from ReviewLink table)
    const reviewLinks = await ReviewLink.findOne({
      attributes: [
        "apple_review_link",
        "google_review_link",
        "booking_review_link",
      ],
    });

    if (!reviewLinks) {
      throw new ApiError(httpStatus.NOT_FOUND, "Review links not configured");
    }

    // ✅ 4. Send email
    await sendReviewEmailWithPDF(
      userDocs.email,
      fullName,
      reviewLinks.apple_review_link,
      reviewLinks.google_review_link,
      reviewLinks.booking_review_link,
    );
  } catch (error) {
    logger.error("sendReviewEmail error:", error);
    throw ApiError.orInternal(error);
  }
};

const createOrUpdateReviewLink = async (reqBody) => {
  let result = "";

  const { apple_review_link, google_review_link, booking_review_link } =
    reqBody;

  try {
    // 🔍 Find existing global review link record (only one should exist)
    const existingLink = await ReviewLink.findOne();

    if (existingLink) {
      // ✅ Update existing record
      if (apple_review_link && apple_review_link !== "")
        existingLink.apple_review_link = apple_review_link;
      if (google_review_link && google_review_link !== "")
        existingLink.google_review_link = google_review_link;
      if (booking_review_link && booking_review_link !== "")
        existingLink.booking_review_link = booking_review_link;

      result = await existingLink.save();
    } else {
      // ✅ Create new record (first-time setup)
      const payload = {
        apple_review_link: apple_review_link || null,
        google_review_link: google_review_link || null,
        booking_review_link: booking_review_link || null,
      };

      result = await ReviewLink.create(payload);
    }

    return result;
  } catch (error) {
    throw ApiError.from(error);
  }
};

const getReviewLink = async () => {
  try {
    const quotes = await ReviewLink.findAll({
      where: { is_active: true },
    });

    if (!quotes || quotes.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, "No quotes found for this user");
    }

    return quotes;
  } catch (error) {
    logger.error("getServiceQuotesByUser error:", error);
    throw ApiError.orInternal(error);
  }
};

module.exports = { sendReviewEmail, createOrUpdateReviewLink, getReviewLink, handleTwilioSmsStatus };
