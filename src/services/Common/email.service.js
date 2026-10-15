/** @format */
const { status: httpStatus } = require("http-status");
const nodemailer = require("nodemailer");
const config = require("../../config/config");
const logger = require("../../config/logger");
const moment = require("moment");
const {
  forgotPasswordSendOTPFormat,
  emailVerificationFormat,
} = require("../../../public/Email_Template");
const ApiError = require("../../utils/ApiError");
const {
  sendMailViaGraph,
  sendMailViaGraphWithSender,
} = require("../../config/microsoftGraph.helper");
const employeeEquipmentAssignmentFormat = require("../../../public/Email_Template/equipmentReportTemplate");
const inspectionCompletedFormat = require("../../../public/Email_Template/inspectionCompletedFormat");

const transport = nodemailer.createTransport(config.email.smtp);

if (config.env !== "test") {
  transport
    .verify()
    .then(() => logger.info("Connected to email server successfully😊."))
    .catch(() =>
      logger.warn(
        "Unable to connect to email server. Make sure you have configured the SMTP options in .env 🥺",
      ),
    );
}


const sendEmailVerification = async (to, otp) => {
  try {
    await sendMailViaGraph({
      to,
      subject: "Please verify your email",
      html: emailVerificationFormat(otp),
    });

    return true;
  } catch (error) {
    console.error("Email verification error:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send verification email",
    );
  }
};

const sendForgotPasswordOTP = async (to, otp) => {
  try {
    await sendMailViaGraph({
      to,
      subject: "Forget Password Request",
      html: forgotPasswordSendOTPFormat(otp),
    });

    return true;
  } catch (error) {
    console.error("Forgot password email error:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send forgot password email",
    );
  }
};


const sendUserCredentials = async (to, password) => {
  try {
    const supportEmail = "socialsanitation@gmail.com";
    const iosLink =
      "https://apps.apple.com/in/app/social-sanitation-user/id6743349377";
    const androidLink =
      "https://play.google.com/store/apps/details?id=com.socialsanitation.user";

    await sendMailViaGraph({
      to,
      subject: "Welcome to Social Sanitation App: Your Login Credentials",
      html: `
				<p>Dear User,</p>

				<p>
					Welcome to the <strong>Social Sanitation App</strong>! Our admin
					has successfully registered you.
				</p>

				<p>
					<strong>Your login credentials:</strong><br />
					Email Address: ${to}<br />
					Password: ${password}
				</p>

				<p>
					Please remember to keep these details safe and secure. We
					recommend changing your password after your first login.
				</p>

				<p>
					If you have any issues or questions, feel free to contact us at
					<a href="mailto:${supportEmail}">
  ${supportEmail}
</a>.

				</p>

				<p>
					<strong>📲 Download the App:</strong><br />
					• <a href="${iosLink}">iOS App</a><br />
					• <a href="${androidLink}">Android App</a>
				</p>

				<p>
					Best regards,<br />
					<strong>Social Sanitation Team</strong>
				</p>
			`,
    });

    return true;
  } catch (error) {
    console.error("Error sending user credentials email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send user credentials email",
    );
  }
};

const sendUpdatedUserCredentials = async (to, password) => {
  try {
    const supportEmail = "socialsanitation@gmail.com";
    const iosLink =
      "https://apps.apple.com/in/app/social-sanitation-user/id6743349377";
    const androidLink =
      "https://play.google.com/store/apps/details?id=com.socialsanitation.user";

    await sendMailViaGraph({
      to,
      subject: "Your Social Sanitation Login Credentials Have Been Updated",
      html: `
        <p>Dear User,</p>

        <p>
          Your account information has been updated by a Social Sanitation administrator.
        </p>

        <p>
          <strong>Your updated login credentials:</strong><br />
          Email Address: ${to}<br />
          Password: ${password}
        </p>

        <p>
          You can now log in using the above credentials. All future account
          notifications and communications will be sent to this email address.
        </p>

        <p>
          For your security, we recommend changing your password after your
          next login.
        </p>

        <p>
          If you have any questions or need assistance, please contact us at
          <a href="mailto:${supportEmail}">${supportEmail}</a>.
        </p>

        <p>
          <strong>📲 Download the App:</strong><br />
          • <a href="${iosLink}">iOS App</a><br />
          • <a href="${androidLink}">Android App</a>
        </p>

        <p>
          Best regards,<br />
          <strong>Social Sanitation Team</strong>
        </p>
      `,
    });

    return true;
  } catch (error) {
    console.error("Error sending updated user credentials email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send updated user credentials email",
    );
  }
};

const sendAdminCredentials = async (to, password) => {
  try {
    await sendMailViaGraph({
      to,
      subject: "Welcome to Social Sanitation App: Your Login Credentials",
      html: `
				<p>Dear User,</p>

				<p>
					Welcome to <strong>Social Sanitation App</strong>! You have been
					successfully registered by our admin. Please find your login
					credentials below:
				</p>

				<p>
					<strong>Email Address:</strong> ${to}<br />
					<strong>Temporary Password:</strong> ${password}
				</p>

				<p>
					For security reasons, we highly recommend changing your password
					after your first login. If you did not create this account, you
					can safely ignore this email.
				</p>

				<p>
					Best regards,<br />
					<strong>Social Sanitation Team</strong>
				</p>
			`,
    });

    return true;
  } catch (error) {
    console.error("Error sending admin credentials email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send admin credentials email",
    );
  }
};

const sendEmailToAdmin = async (user, bookingDoc, serviceDoc) => {
  try {
    const adminEmail = "socialsanitation@gmail.com";
    const subject = "New Booking Notification - Social Sanitation App";

    const date = new Date(bookingDoc.date).toDateString();

    const formatTimeTo12Hour = (timeStr) => {
      if (!timeStr) return "";
      const [hour, minute] = timeStr.split(":");
      const d = new Date();
      d.setHours(hour, minute);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    };

    const formattedTime = formatTimeTo12Hour(bookingDoc.time);

    const html = `
			<p>Dear Admin,</p>

			<p>
				A new booking has been made by a user. Please review the details
				below and take the necessary action.
			</p>

			<p>
				<strong>User Information</strong><br />
				Name: ${user?.user_profile?.name || "N/A"}<br />
				Email: ${user.email}
			</p>

			<p>
				<strong>Booking Details</strong><br />
				Service Name: ${serviceDoc.name}<br />
				Date: ${date}<br />
				Time: ${formattedTime}
			</p>

			<p>
				For more details and to take action, please visit:<br />
				<a href="https://admin.socialsanitation.com/">
					https://admin.socialsanitation.com/
				</a>
			</p>

			<p>
				Best regards,<br />
				<strong>Social Sanitation App Team</strong>
			</p>
		`;

    await sendMailViaGraph({
      to: adminEmail,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("Error sending admin booking email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send booking notification to admin",
    );
  }
};

// TODO:REMOVED THIS MAIL
const sendEmailToUser = async (user, bookingDoc, serviceDoc) => {
  try {
    const subject = "Booking Confirmation - Social Sanitation App";

    // Format date
    const date = new Date(bookingDoc.date).toDateString();

    // Format time to 12-hour
    const formatTimeTo12Hour = (timeStr) => {
      if (!timeStr) return "";
      const [hour, minute] = timeStr.split(":");
      const d = new Date();
      d.setHours(hour, minute);
      return d.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    };

    const formattedTime = formatTimeTo12Hour(bookingDoc.time);

    const html = `
			<p>Dear Client,</p>

			<p>
				Thank you for booking with <strong>Social Sanitation App</strong>!
				Your booking details are as follows:
			</p>

			<p>
				<strong>Booking Details</strong><br />
				Service Name: ${serviceDoc.name}<br />
				Date: ${date}<br />
				Time: ${formattedTime}
			</p>

			<p>
				We will get back to you shortly. If you have any questions,
				please contact us at
				<a href="mailto:socialsanitation@gmail.com">
					socialsanitation@gmail.com
				</a>.
			</p>

			<p>
				Best regards,<br />
				<strong>Social Sanitation App Team</strong>
			</p>
		`;

    await sendMailViaGraph({
      to: user.email,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("Error sending booking confirmation email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send booking confirmation email",
    );
  }
};

// TODO:REMOVED THIS MAIL
const sendPaymentSuccessEmail = async (user, amount, receiptUrl) => {
  const subject = "Payment Successful - Social Sanitation";

  const html = `
		<p>Dear ${user.user_name || "Client"},</p>

		<p>
			🎉 Your payment has been <strong>successfully completed</strong>.
		</p>

		<p>
			<strong>Amount Paid:</strong> $${amount}
		</p>

		${
      receiptUrl
        ? `
		<p>
			<strong>View Receipt:</strong><br/>
			<a href="${receiptUrl}" target="_blank">
				View Your Receipt
			</a>
		</p>`
        : ""
    }

		<p>
			Thank you for choosing <strong>Social Sanitation</strong>.
		</p>

		<p>
			Best regards,<br/>
			<strong>Social Sanitation Team</strong>
		</p>
	`;

  await sendMailViaGraph({
    to: user.email,
    subject,
    html,
  });
};

// TODO:REMOVED THIS MAIL
const sendRejectedBookingEmail = async (email) => {
  try {
    const subject = "Booking Rejected - Social Sanitation App";

    const html = `
			<p>Dear User,</p>

			<p>
				We regret to inform you that your booking with
				<strong>Social Sanitation App</strong> has been rejected because it
				was not confirmed in time.
			</p>

			<p>
				We apologize for any inconvenience caused.
			</p>

			<p>
				Best regards,<br />
				<strong>Social Sanitation App Team</strong>
			</p>
		`;

    await sendMailViaGraph({
      to: email,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("Error sending rejected booking email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send rejected booking email",
    );
  }
};

// TODO:REMOVED THIS MAIL
const sendUserDeletionEmail = async (userEmail) => {
  try {
    await sendMailViaGraph({
      to: userEmail,
      subject: "Important: Account Deletion Notification",
      html: `
				<p>Dear User,</p>

				<p>
					We are reaching out to inform you that your account associated
					with our system has been deleted by an administrator.
				</p>

				<p>
					If you have any questions or believe this action was taken in
					error, please contact our support team at
					<a href="mailto:socialsanitation@gmail.com">
						socialsanitation@gmail.com
					</a>.
				</p>

				<p>
					Thank you for your attention to this matter.
				</p>

				<p>
					Warm regards,<br />
					<strong>Social Sanitation App Team</strong>
				</p>
			`,
    });

    return true;
  } catch (error) {
    console.error("Error sending user deletion email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send account deletion email",
    );
  }
};

const sendLeaveStatusEmail = async (userEmail, status) => {
  try {
    await sendMailViaGraph({
      to: userEmail,
      subject: `Leave Request ${status}`,
      html: `
				<p>Dear User,</p>

				<p>
					Your leave request has been
					<strong>${status.toLowerCase()}</strong> by the admin.
				</p>

				<p>
					If you have any concerns or need further clarification, feel
					free to reach out.
				</p>

				<p>
					Best regards,<br />
					<strong>Social Sanitation App Team</strong>
				</p>
			`,
    });

    return true;
  } catch (error) {
    console.error("Error sending leave status email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send leave status email",
    );
  }
};

const sendEmailWithPDF = async (
  toEmail,
  pdfPath,
  clientName,
  ccEmail = null,
) => {
  try {
    await sendMailViaGraph({
      to: toEmail,
      cc: ccEmail,
      subject: "Quotation for Your Requested Services",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <p>Hi ${clientName || "there"},</p>

          <p>
            Thank you for requesting a service quote. Please find the
            attached PDF with the complete details.
          </p>

          <p>
            If you have any questions, feel free to reply to this email.
          </p>

          <p style="margin-top: 20px;">
            Best regards,<br />
            <strong>Social Sanitation App Team</strong>
          </p>
        </div>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending email with PDF:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send quotation email",
    );
  }
};

const sendServiceRequestEmailWithPDF = async (toEmail, pdfPath, refNo) => {
  try {
    await sendMailViaGraph({
      to: toEmail,
      subject: `Service Request - ${refNo}`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#333; line-height:1.7;">
          <p>Hi,</p>

          <p>
            Thank you for choosing <strong>Social Sanitation</strong>.
          </p>

          <p>
            Please find your <strong>Service Request (${refNo})</strong> attached.
          </p>

          <p>
            <strong>A separate email from DocuSign has also been sent to you.</strong>
            Please review and electronically sign the document using the DocuSign email.
          </p>

          <p>
            After signing, you will automatically receive another email containing the fully signed copy for your records.
          </p>

          <p>
            If you have any questions, please contact us.
          </p>

          <br/>

          <p>
            Thank you,<br/>
            <strong>Social Sanitation Team</strong>
          </p>
        </div>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending Service Request email:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send Service Request email",
    );
  }
};

const sendSignedServiceRequestEmailWithPDF = async (
  toEmail,
  pdfPath,
  refNo,
) => {
  try {
    await sendMailViaGraph({
      to: toEmail,
      subject: `Signed Service Request - ${refNo}`,
      html: `
        <div style="font-family: Arial, sans-serif; color:#333; line-height:1.7;">
          <p>Hi,</p>

          <p>
            Your <strong>Service Request (${refNo})</strong> has been successfully signed.
          </p>

          <p>
            Please find the fully executed signed Service Request attached for your records.
          </p>

          <p>
            Thank you for choosing Social Sanitation. We appreciate your business.
          </p>

          <p>
            If you have any questions, please contact us.
          </p>

          <br/>

          <p>
            Thank you,<br/>
            <strong>Social Sanitation Team</strong>
          </p>
        </div>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending signed Service Request email:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send signed Service Request email",
    );
  }
};

// TODO:REMOVED THIS MAIL
const sendInvoiceEmailWithPDF = async (user, invoice, pdfPath, senderEmail) => {
  try {
    let formattedStart = "";
    let formattedEnd = "";

    if (invoice.service_dates) {
      const [start, end] = invoice.service_dates.split(" - ");

      formattedStart = start
        ? moment(start, "YYYY-MM-DD").format("MM/DD/YYYY")
        : "";

      formattedEnd = end ? moment(end, "YYYY-MM-DD").format("MM/DD/YYYY") : "";
    }

    await sendMailViaGraphWithSender({
      to: user.email,
      from: senderEmail,
      subject: `INVOICE ${invoice.custom_ref_no || invoice.ref_no} is available for payment.`,
      html: `
				<div style="font-family: Arial, sans-serif; color: #333;">
					<p>Hey, ${user.user_profile?.name || "Client"},</p>

					<p>
						The invoice for services completed in 
					<strong>${formattedStart} - ${formattedEnd}</strong>
						is prepared and available for payment.
					</p>

					<p>
						Invoice <strong>${invoice.custom_ref_no || invoice.ref_no} </strong> is attached to this email.
					</p>

					<p>Have a great day!</p>

					<br/>
					<p><strong>Social Sanitation Sales Team</strong></p>
				</div>
			`,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending email with PDF:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send invoice email",
    );
  }
};

const sendReviewEmailWithPDF = async (
  toEmail,
  userName = "",
  google_review_link = "#",
  apple_review_link = "#",
  booking_review_link = "#",
) => {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 10px; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="https://admin.socialsanitation.com/static/media/image.9ca7d2fa78ea8b9aa2c1.png" width="150" alt="Social Sanitation Logo" />
        </div>

        <p>Hi <strong>${userName || "Valued Customer"}</strong>,</p>

        <p>
          Thank you for booking our cleaning service with
          <strong>Social Sanitation Commercial Cleaning Solutions</strong>.
        </p>

        <p>
          We hope we’ve met all of your expectations! Please leave us a short
          message about your experience with us today.
        </p>

        <p>
          You can include your representative’s name, any commercial or
          residential services, and attach any available images of our completed
          services.
        </p>

        <div style="margin-top: 30px; text-align: center;">
          <a href="${google_review_link}" style="background-color:#28a745;color:#fff;text-decoration:none;padding:10px 20px;border-radius:5px;margin:5px;">Google Review</a>
          <a href="${apple_review_link}" style="background-color:#007aff;color:#fff;text-decoration:none;padding:10px 20px;border-radius:5px;margin:5px;">Apple Review</a>
          <a href="${booking_review_link}" style="background-color:#495057;color:#fff;text-decoration:none;padding:10px 20px;border-radius:5px;margin:5px;">Booking Review</a>
        </div>

        <p style="margin-top: 30px;">
          Thank you in advance — have a great day ahead!
        </p>

        <div style="text-align: center; margin-top: 30px;">
          <img src="https://admin.socialsanitation.com/static/media/image.9ca7d2fa78ea8b9aa2c1.png" width="120" alt="Company Logo" />
        </div>
      </div>
    `;

    await sendMailViaGraph({
      to: toEmail,
      subject: "We’d love your feedback on your recent service!",
      html,
    });

    return true;
  } catch (error) {
    console.error("Error sending review email:", error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send review email",
    );
  }
};

const sendFormEmailWithPDF = async (toEmail, pdfPath) => {
  try {
    await sendMailViaGraph({
      to: toEmail,
      subject: "Your Hiring Form Submission Received",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <p>Hi there,</p>
          <p>
            Thank you for submitting your hiring form. We have successfully
            received your responses and will get back to you shortly.
          </p>
          <p>Please find attached a PDF copy of your submission for your records.</p>
          <p>If you have any questions, feel free to reply to this email.</p>
          <p style="margin-top: 20px;">
            Best regards,<br><strong>Social Sanitation App Team</strong>
          </p>
        </div>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending email with PDF:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const sendFormToAdminWithPDF = async (userEmail, pdfPath) => {
  try {
    await sendMailViaGraph({
      to: "socialsanitation@gmail.com",
      subject: "New Hiring Form Submission Received",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333;">
          <p>Hello Admin,</p>
          <p>
            A new hiring form has been submitted by:
            <strong>${userEmail}</strong>.
          </p>
          <p>Please find attached a PDF containing the applicant's responses.</p>
          <p style="margin-top: 20px;">
            Regards,<br><strong>Social Sanitation App System</strong>
          </p>
        </div>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Error sending admin email with PDF:", error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message);
  }
};

const sendGroupedAttendanceEmail = async ({
  booking,
  employees,
  status,
  bookingAddress,
}) => {
  try {
    const adminEmail = "socialsanitation@gmail.com";

    const firstName = employees[0].name.split(" ")[0];

    const subject =
      status === "ABSENT"
        ? `Urgent Attendance Alert - Absent for ${firstName} at ${booking.booking_name}`
        : `Attendance Alert - Late for ${firstName} at ${booking.booking_name}`;

    const employeeLines = employees
      .map((e) => `• ${e.name} (${e.status})`)
      .join("<br/>");

    const locationName = [
      bookingAddress?.address,
      bookingAddress?.user_city?.name,
      bookingAddress?.user_state?.name,
      bookingAddress?.user_country?.name,
    ]
      .filter(Boolean)
      .join(", ");

    const html = `
      <p>Dear Admin,</p>

      <p><strong>Attendance Issue Detected:</strong></p>

      <p>${employeeLines}</p>

      <p><strong>Booking:</strong> ${booking.booking_name}</p>
      <p><strong>Location:</strong> ${locationName}</p>

      <p>Please take necessary action.</p>

      <br/>
      <p>Regards,<br/>Social Sanitation Team</p>
    `;

    await sendMailViaGraph({
      to: adminEmail,
      subject,
      html,
    });

    return true;
  } catch (error) {
    console.error("❌ Email error:", error);
  }
};

const sendClockOutDistanceEmail = async ({
  bookingId,
  date,
  employee,
  userLat,
  userLng,
}) => {
  const adminEmail = "socialsanitation@gmail.com";

  const html = `
    <p>Dear Admin,</p>
    <p>
      <strong>${employee.name}</strong> clocked out away from the service
      location.
    </p>
    <p>
      <strong>Booking ID:</strong> ${bookingId}<br/>
      <strong>Date:</strong> ${new Date(date).toDateString()}<br/>
      <strong>Clock-out Location:</strong>
      ${employee.clockOutLat}, ${employee.clockOutLng}<br/>
      <strong>Expected Location:</strong>
      ${userLat}, ${userLng}
    </p>
  `;

  await sendMailViaGraph({
    to: adminEmail,
    subject: `Clock-Out Irregularity – ${employee.name}`,
    html,
  });
};

const sendAutoClockOutEmail = async ({ date, employees }) => {
  const adminEmail = "socialsanitation@gmail.com";

  const html = `
    <p>Dear Admin,</p>
    <p>Employees who did not clock out on <strong>${date}</strong>:</p>
    <ul>
      ${
        employees.length
          ? employees.map((e) => `<li>${e}</li>`).join("")
          : "<li>No employees found</li>"
      }
    </ul>
  `;

  await sendMailViaGraph({
    to: adminEmail,
    subject: `Employees Who Did Not Clock Out – ${date}`,
    html,
  });
};

// TODO:REMOVED THIS MAIL
const sendEmailWithAttachment = async ({
  to,
  signedFileName,
  savePath,
  documentType,
}) => {
  try {
    let subject = "";
    let html = "";

    if (documentType === "contract") {
      subject = "Signed Contract Agreement";
      html = `
        Your contract agreement has been successfully signed.
        <br/><br/>
        Please find the signed contract attached.
      `;
    } else {
      subject = "Signed Service Estimate";
      html = `
        Your service estimate has been signed.
        <br/><br/>
        Please find the signed document attached.
      `;
    }

    await sendMailViaGraph({
      to,
      subject,
      html,
      attachments: [savePath],
    });

    return true;
  } catch (error) {
    console.error("Email sending error:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send signed email",
    );
  }
};

// TODO:REMOVED THIS MAIL
const sendContractReviewEmail = async (email, pdfPath, clientName) => {
  try {
    await sendMailViaGraph({
      to: email,
      subject: "Contract Agreement Ready for Signature",
      html: `
        <p>Hello ${clientName},</p>

        <p>Your <strong>Contract Agreement</strong> has been prepared by Social Sanitation.</p>

        <p>Please review the attached contract for your records.</p>

        <p><strong>A separate DocuSign email has also been sent to you.</strong> Please open that email to review and electronically sign your contract.</p>

        <p>If you do not see the DocuSign email, please check your Spam/Junk folder.</p>

        <br/>

        <p>Thank you,<br/>
        <strong>Social Sanitation Commercial Cleaning Solutions</strong></p>
      `,
      attachments: [pdfPath],
    });

    return true;
  } catch (error) {
    console.error("Contract review email failed:", error);

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || "Failed to send contract review email",
    );
  }
};


const sendTwoWeekScheduleEmail = async ({ to, name, bookings }) => {
  try {
    const subject = "Your 2-Week Work Schedule";

    const rows = bookings
      .map(
        (b) => `
				<tr>
					<td>${b.booking_name}</td>
					<td>${b.date}</td>
					<td>${b.time}</td>
					<td>
						${b.address}
						${
              b.map_link
                ? `<br/><a href="${b.map_link}" target="_blank">📍 View Map</a>`
                : ""
            }
					</td>
					<td>${b.notes}</td>
				</tr>
			`,
      )
      .join("");

    const html = `
			<h2>Hello ${name},</h2>

			<p>Here is your schedule for the next 2 weeks:</p>

			<table border="1" cellpadding="10" cellspacing="0" style="border-collapse: collapse; width: 100%;">
				<thead style="background:#f5f5f5;">
					<tr>
						<th>Booking</th>
						<th>Date</th>
						<th>Time</th>
						<th>Address</th>
						<th>Notes</th>
					</tr>
				</thead>
				<tbody>
					${rows}
				</tbody>
			</table>

			<br/>
			<p>Please contact admin if you have any questions.</p>
		`;

    await sendMailViaGraph({
      to,
      subject,
      html,
    });

    return true;
  } catch (error) {
    throw error;
  }
};

const sendEmployeeEquipmentFormEmail = async ({ to, name, assignment }) => {
  try {
    const subject = `Equipment Assignment Record - ${
      assignment.equipment?.name || "Equipment"
    }`;

    const html = employeeEquipmentAssignmentFormat({
      name,
      assignment,
    });

    await sendMailViaGraph({
      to,
      subject,
      html,
    });

    return true;
  } catch (error) {
    throw error;
  }
};

const sendInspectionCompletedEmail = async ({ to, name, inspection }) => {
  try {
    const subject = `Inspection Report - ${inspection.name}`;

    const html = inspectionCompletedFormat({
      name,
      inspection,
    });

    await sendMailViaGraph({
      to,
      subject,
      html,
    });

    return true;
  } catch (error) {
    throw error;
  }
};

module.exports = {
  sendForgotPasswordOTP,
  sendUpdatedUserCredentials,
  sendEmailVerification,
  sendUserCredentials,
  sendAdminCredentials,
  sendEmailToAdmin,
  sendEmailToUser,
  sendRejectedBookingEmail,
  sendUserDeletionEmail,
  sendLeaveStatusEmail,
  sendEmailWithPDF,
  sendServiceRequestEmailWithPDF,
  sendSignedServiceRequestEmailWithPDF,
  sendFormEmailWithPDF,
  sendFormToAdminWithPDF,
  sendGroupedAttendanceEmail,
  sendClockOutDistanceEmail,
  sendAutoClockOutEmail,
  sendReviewEmailWithPDF,
  sendInvoiceEmailWithPDF,
  sendEmailWithAttachment,
  sendContractReviewEmail,
  sendTwoWeekScheduleEmail,
  sendPaymentSuccessEmail,
  sendEmployeeEquipmentFormEmail,
  sendInspectionCompletedEmail,
};
