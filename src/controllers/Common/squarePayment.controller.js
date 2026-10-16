/** @format */

const { status: httpStatus } = require("http-status");
const { createHash, randomUUID } = require("crypto");
const { SquareClient, SquareEnvironment, WebhooksHelper } = require("square");
const { Payment, Booking, ServiceQuote, Invoice } = require("../../models");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const responseWrapper = require("../../config/responseWrapper");
const config = require("../../config/config");

const squareEnvironment =
  config.square.environment === "production"
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox;

const client = new SquareClient({
  token: config.square.accessToken,
  environment: squareEnvironment,
});

const getSquareKeys = catchAsync(async (req, res) => {
  try {
    const response = {
      squareAppId: config.square.appId,
      squareLocationId: config.square.locationId,
    };

    return responseWrapper(res, response, "Square keys fetched successfully.");
  } catch (error) {
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
});

const createCustomer = async (userDoc) => {
  try {
    // Define the customer object for Square API
    const customerObj = {
      givenName: userDoc.user_profile.name,
      emailAddress: userDoc.email,
      phoneNumber: userDoc.user_profile.mobile,
      note: `${config.app_name}#${userDoc.id}#${userDoc.role_id}#squareCustomer`,
    };

    let customer = {};

    // Check if `square_customer_id` exists
    if (!userDoc.square_customer_id || userDoc.square_customer_id === "") {
      console.log("Creating new Square customer...");

      // Create a new customer in Square
      const response = await client.customers.create(customerObj);
      customer = response.customer;

      // Save the new `square_customer_id` to the user document
      userDoc.square_customer_id = customer.id;
      await userDoc.save();

      console.log("New Square customer created:", customer?.id);
    } else {
      console.log("Retrieving existing Square customer...");

      // Retrieve existing customer information from Square
      const response = await client.customers.get({
        customerId: userDoc.square_customer_id,
      });
      customer = response.customer;

      console.log("Existing Square customer retrieved:", customer?.id);
    }

    // Return the customer object or `false` if not found
    return customer ? customer : false;
  } catch (error) {
    console.error("Square API Error:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
};

// Amount in cents for a positive dollar amount with at most two decimals, otherwise null
const toCents = (amount) => {
  const value = typeof amount === "string" ? amount.trim() : amount;
  if ((typeof value !== "number" && typeof value !== "string") || value === "") return null;
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return Math.abs(dollars * 100 - cents) < 1e-6 ? cents : null;
};

// Square charges once per idempotency key. When the app sends the same idempotency_key for
// every retry of one payment, a retry after a timeout returns the first charge instead of
// charging again. Without one, every request is a new charge (the previous behaviour).
const paymentIdempotencyKey = (userId, bookingId, clientKey) =>
  clientKey
    ? createHash("sha256").update(`${userId}:${bookingId}:${clientKey}`).digest("base64url") // 43 chars; Square allows 45
    : randomUUID();

// In-app card payment for one of the caller's bookings. The app chooses the amount (bookings
// have no stored price); the payment is recorded as PENDING for admin review.
const createPayment = catchAsync(async (req, res) => {
  try {
    const { user, booking_id, sourceId, amount, idempotency_key } = req.body;

    if (!sourceId || typeof sourceId !== "string") {
      throw new ApiError(httpStatus.BAD_REQUEST, "sourceId is required.");
    }
    const cents = toCents(amount);
    if (cents === null) {
      throw new ApiError(httpStatus.BAD_REQUEST, "amount must be a positive dollar amount with at most 2 decimal places.");
    }
    if (idempotency_key !== undefined && (typeof idempotency_key !== "string" || !idempotency_key.trim() || idempotency_key.length > 100)) {
      throw new ApiError(httpStatus.BAD_REQUEST, "idempotency_key must be a string of up to 100 characters.");
    }
    if (!booking_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, "booking_id is required.");
    }
    const booking = await Booking.findOne({ where: { id: booking_id, is_active: true } });
    if (!booking) {
      throw new ApiError(httpStatus.NOT_FOUND, "Booking not found.");
    }
    if (Number(booking.user_id) !== Number(user.id)) {
      throw new ApiError(httpStatus.FORBIDDEN, "This booking does not belong to you.");
    }

    // Create customer using the provided user information
    const customer = await createCustomer(user);

    // Prepare the payment object
    const paymentObj = {
      idempotencyKey: paymentIdempotencyKey(user.id, booking.id, idempotency_key),
      amountMoney: {
        amount: BigInt(cents),
        currency: "USD",
      },
      sourceId,
      customerId: customer.id,
      note: "Booking Payment",
    };

    // Create payment through Square API
    const paymentResponse = await client.payments.create(paymentObj);
    const paymentIntent = convertBigIntToString(paymentResponse.payment);

    // A retry with the same idempotency key gets the same Square payment back: record it once
    const alreadyRecorded = await Payment.findOne({ where: { transaction_id: paymentIntent.id } });
    if (!alreadyRecorded) {
      await Payment.create({
        transaction_id: paymentIntent.id,
        amount: cents / 100,
        currency: paymentIntent.amountMoney.currency,
        description: "Booking Payment",
        user_id: user.id,
        square_customer_id: customer.id,
        booking_id: booking.id,
      });
    }

    // Prepare and return the response
    const response = {
      paymentId: paymentIntent.id,
      customer: customer.id,
      status: paymentIntent.status,
      receiptUrl: paymentIntent.receiptUrl,
    };

    return responseWrapper(res, response, "");
  } catch (error) {
    console.error("Square API Error:", error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message,
    );
  }
});


// Square signs each webhook with the subscription's signature key. Without the key configured the
// event is processed unverified (previous behaviour) and a warning is logged.
const isAuthenticSquareWebhook = async (req) => {
  const signatureKey = config.square.webhookSignatureKey;
  if (!signatureKey) {
    console.warn("SQUARE_WEBHOOK_SIGNATURE_KEY is not set: Square webhook signature not verified");
    return true;
  }
  const notificationUrl =
    config.square.webhookUrl || `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  return WebhooksHelper.verifySignature({
    requestBody: req.rawBody || "",
    signatureHeader: req.get("x-square-hmacsha256-signature") || "",
    signatureKey,
    notificationUrl,
  });
};

const handlePaymentWebhook = catchAsync(async (req, res) => {
  try {
    console.log("🔥 Webhook HIT");

    if (!(await isAuthenticSquareWebhook(req))) {
      return res.status(httpStatus.UNAUTHORIZED).json({ message: "Invalid webhook signature" });
    }

    const event = req.body;
    const eventType = event.type;

    console.log("Received Square event:", event?.type, event?.event_id);

    if (
      eventType !== "payment.created" &&
      eventType !== "payment.updated"
    ) {
      return res.status(200).json({ message: "Event ignored" });
    }

    const paymentData = event?.data?.object?.payment;

    if (!paymentData) {
      console.error("Missing payment object", event);

      return res.status(200).json({
        message: "Invalid event data ignored",
      });
    }

    const paymentId = paymentData.id;
    let orderId = paymentData.order_id || paymentData.orderId;

    /* ================= FETCH SQUARE PAYMENT DETAILS ================= */

    let paymentResponseData = null;

    if (paymentId && (!orderId || !paymentData.receipt_url)) {
      try {
        const paymentResponse = await client.payments.get({ paymentId });

        paymentResponseData = paymentResponse.payment || null;

        if (!orderId) {
          orderId =
            paymentResponseData?.orderId ||
            paymentResponseData?.order_id ||
            null;
        }
      } catch (err) {
        console.error(
          "Unable to fetch Square payment details:",
          err.message,
        );
      }
    }

    const paymentStatus = paymentData.status;

    const receiptUrl =
      paymentData.receipt_url ||
      paymentData.receiptUrl ||
      paymentResponseData?.receiptUrl ||
      paymentResponseData?.receipt_url ||
      null;

    if (!paymentId || !paymentStatus) {
      console.warn("Missing payment ID or status");

      return res.status(200).json({
        message: "Incomplete payment ignored",
      });
    }

    /* ================= FIND PAYMENT RECORD ================= */

    let paymentRecord = null;

    if (orderId) {
      paymentRecord = await Payment.findOne({
        where: { square_order_id: orderId },
      });
    }

    if (!paymentRecord) {
      paymentRecord = await Payment.findOne({
        where: { transaction_id: paymentId },
      });
    }

    if (!paymentRecord) {
      console.warn("No matching payment record:", {
        paymentId,
        orderId,
      });

      return res.status(200).json({
        message: "Payment record not found",
      });
    }

    /* ================= FAILURE FLOW ================= */

    const FINAL_FAILED_STATUSES = ["FAILED", "CANCELED"];

    if (FINAL_FAILED_STATUSES.includes(paymentStatus)) {
      // Do not overwrite a previously successful payment.
      if (paymentRecord.payment_status !== "SUCCESS") {
        await paymentRecord.update({
          transaction_id: paymentId,
          payment_status: "REJECTED",
          receipt_url: receiptUrl,
        });
      }

      return res.status(200).json({
        message: "Payment failure processed",
      });
    }

    /* ================= WAIT FOR COMPLETED PAYMENT ================= */

    if (paymentStatus !== "COMPLETED") {
      return res.status(200).json({
        message: "Payment not completed yet",
      });
    }

    /* ================= VALIDATE PAYMENT PURPOSE ================= */

    // Do not assume FULL if the purpose is missing.
    const paymentPurpose = String(
      paymentRecord.payment_purpose || "",
    ).toUpperCase();

    if (!["DEPOSIT", "BALANCE", "FULL"].includes(paymentPurpose)) {
      console.error("Unknown or missing payment purpose:", {
        paymentId,
        paymentRecordId: paymentRecord.id,
        paymentPurpose: paymentRecord.payment_purpose,
      });

      return res.status(200).json({
        message: "Unknown payment purpose; payment requires review",
      });
    }

    /* ================= LOAD INVOICE ================= */

    let invoice = null;

    if (paymentRecord.invoice_id) {
      invoice = await Invoice.findByPk(paymentRecord.invoice_id);

      if (!invoice) {
        console.error(
          "Invoice not found for payment:",
          paymentRecord.invoice_id,
        );

        return res.status(200).json({
          message: "Invoice not found",
        });
      }
    }

    /* ================= UPDATE INVOICE PAYMENT STAGE ================= */

    if (invoice) {
      const currentStage = invoice.payment_stage || "FULL";

      if (paymentPurpose === "DEPOSIT") {
        if (!invoice.deposit_required) {
          console.error(
            "Deposit payment received for a non-deposit invoice:",
            {
              invoiceId: invoice.id,
              paymentId,
            },
          );

          return res.status(200).json({
            message:
              "Unexpected deposit payment; payment requires review",
          });
        }

        if (currentStage === "COMPLETED") {
          // Do not regress an already completed invoice.
          console.warn(
            "Deposit payment received for completed invoice:",
            {
              invoiceId: invoice.id,
              paymentId,
            },
          );
        } else if (
          currentStage === "DEPOSIT_PENDING" ||
          currentStage === "DEPOSIT_PAID"
        ) {
          await invoice.update({
            payment_stage: "DEPOSIT_PAID",
            deposit_paid_at: invoice.deposit_paid_at || new Date(),
            payment_status: "NOT_PAID",
          });
        } else {
          console.error("Unexpected stage for deposit payment:", {
            invoiceId: invoice.id,
            paymentId,
            currentStage,
          });

          return res.status(200).json({
            message:
              "Unexpected invoice stage; payment requires review",
          });
        }
      } else if (paymentPurpose === "BALANCE") {
        if (currentStage === "COMPLETED") {
          // Invoice is already complete; leave it unchanged.
        } else if (currentStage === "BALANCE_PENDING") {
          await invoice.update({
            payment_stage: "COMPLETED",
            balance_paid_at: invoice.balance_paid_at || new Date(),
            payment_status: "PAID",
          });
        } else {
          console.error("Unexpected stage for balance payment:", {
            invoiceId: invoice.id,
            paymentId,
            currentStage,
          });

          return res.status(200).json({
            message:
              "Unexpected invoice stage; payment requires review",
          });
        }
      } else if (paymentPurpose === "FULL") {
        if (
          currentStage === "FULL" ||
          !invoice.payment_stage ||
          currentStage === "COMPLETED"
        ) {
          await invoice.update({
            payment_stage: "COMPLETED",
            payment_status: "PAID",
          });
        } else {
          console.error("Unexpected stage for full payment:", {
            invoiceId: invoice.id,
            paymentId,
            currentStage,
          });

          return res.status(200).json({
            message:
              "Unexpected invoice stage; payment requires review",
          });
        }
      }
    }

    /* ================= UPDATE QUOTE ================= */

    if (paymentRecord.quote_id) {
      const quote = await ServiceQuote.findByPk(
        paymentRecord.quote_id,
      );

      if (quote) {
        await quote.update({
          payment_status: "PAID",
          job_status: "BOOKED",
        });
      }
    }

    /* ================= UPDATE BOOKING ================= */

    if (paymentRecord.booking_id) {
      const bookingDoc = await Booking.findByPk(
        paymentRecord.booking_id,
      );

      if (bookingDoc) {
        await bookingDoc.update({
          payment_status: "SUCCESS",
        });
      }
    }

    /* ================= UPDATE PAYMENT RECORD ================= */

    // Duplicate-payment handling intentionally remains unchanged.
    await paymentRecord.update({
      transaction_id: paymentId,
      payment_status: "SUCCESS",
      receipt_url: receiptUrl,
    });

    console.log("✅ Payment processed:", {
      paymentId,
      invoiceId: paymentRecord.invoice_id,
      paymentPurpose,
    });

    return res.status(200).json({
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("❌ Webhook error:", error);

    return res.status(500).send("Webhook processing failed");
  }
});


function convertBigIntToString(obj) {
  for (let key in obj) {
    if (typeof obj[key] === "bigint") {
      obj[key] = obj[key].toString();
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      convertBigIntToString(obj[key]);
    }
  }
  return obj;
}

module.exports = {
  getSquareKeys,
  createPayment,
  handlePaymentWebhook,
};
