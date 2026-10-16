/** @format */
const axios = require("axios");
const { randomUUID: uuidv4 } = require("crypto");
const { Payment } = require("../../models");
const config = require("../../config/config");

// Square REST API for payment links (squarePayment.controller.js uses the SDK with the same settings)
const SQUARE_API_VERSION = "2024-10-17";

const paymentLinksUrl = () =>
  `${
    config.square.environment === "production" ? "https://connect.squareup.com" : "https://connect.squareupsandbox.com"
  }/v2/online-checkout/payment-links`;

const squareHeaders = () => ({
  Authorization: `Bearer ${config.square.accessToken}`,
  "Square-Version": SQUARE_API_VERSION,
});

const squareJsonHeaders = () => ({ "Content-Type": "application/json", ...squareHeaders() });

async function generateSquarePaymentLink({
  amount,
  refNo,
  customerEmail,
  user_id,
}) {
  try {
    const squareAmount = Math.max(0.01, Number(amount));
    const squareAmountCents = Math.round(squareAmount * 100);
    const body = {
      idempotency_key: uuidv4(),

      order: {
        location_id: config.square.locationId,
        line_items: [
          {
            name: `Service Quote #${refNo}`,
            quantity: "1",
            base_price_money: {
              amount: squareAmountCents,
              currency: "USD",
            },
          },
        ],

        // ✅ ADD TAX (7.5%)
        taxes: [
          {
            name: "Sales Tax (7.5%)",
            percentage: "7.5",
            scope: "ORDER",
          },
        ],
      },

      checkout_options: {
        allow_tipping: true,
        redirect_url: "https://admin.socialsanitation.com/checkout",
        tip_settings: {
          separate_tip_screen: false,
          enable_custom_tip_amount: true,
          show_tip_buttons: true,
          tip_percentages: [10, 15, 20],
        },
      },

      pre_populate_buyer_email: customerEmail,
    };

    const response = await axios.post(paymentLinksUrl(), body, { headers: squareJsonHeaders() });

    const paymentLink = response.data.payment_link;
    const paymentLinkId = paymentLink.id;
    const paymentUrl = paymentLink.url;
    const orderId = paymentLink.order_id;

    await Payment.create({
      transaction_id: null, // will store payment.id later
      square_order_id: orderId, // ✅ store this separately
      currency: "USD",
      user_id,
      booking_id: null,
      square_payment_link_id: paymentLinkId,
      amount: squareAmount,
      square_customer_id: customerEmail,
      description: `Service Quote #${refNo}`,
      payment_status: "PENDING",
      receipt_url: paymentUrl,
    });

    return {
      paymentUrl,
      paymentLinkId,
      orderId,
    };
  } catch (error) {
    console.error(
      "❌ Payment Link Error:",
      error.response?.data || error.message,
    );
    throw new Error("Failed to generate Square Payment Link");
  }
}

async function deleteSquarePaymentLink(paymentLinkId) {
  await axios.delete(`${paymentLinksUrl()}/${paymentLinkId}`, { headers: squareHeaders() });
}

async function generateContractPaymentLink({
  amount,
  clientName,
  customerEmail,
  user_id,
}) {
  try {
    const body = {
      idempotency_key: uuidv4(),

      order: {
        location_id: config.square.locationId,

        line_items: [
          {
            name: `Contract Payment - ${clientName}`,
            quantity: "1",
            base_price_money: {
              amount: Math.round(amount * 100),
              currency: "USD",
            },
          },
        ],

        taxes: [
          {
            name: "Sales Tax (7.5%)",
            percentage: "7.5",
            scope: "ORDER",
          },
        ],
      },

      checkout_options: {
        allow_tipping: true,
        redirect_url: "https://admin.socialsanitation.com/checkout",
        tip_settings: {
          separate_tip_screen: false,
          enable_custom_tip_amount: true,
          show_tip_buttons: true,
          tip_percentages: [10, 15, 20],
        },
      },

      pre_populate_buyer_email: customerEmail,
    };

    const response = await axios.post(paymentLinksUrl(), body, { headers: squareJsonHeaders() });

    const paymentLink = response.data.payment_link;
    const paymentLinkId = paymentLink.id;
    const paymentUrl = paymentLink.url;
    const orderId = paymentLink.order_id;

    await Payment.create({
      transaction_id: null, // will store payment.id later
      square_order_id: orderId, // ✅ store this separately
      currency: "USD",
      user_id,
      booking_id: null,
      square_payment_link_id: paymentLink.id,
      amount: Number(amount.toFixed(2)),
      square_customer_id: customerEmail,
      description: `Contract Payment - ${clientName}`,
      payment_status: "PENDING",
      receipt_url: paymentLink.url,
    });

    return {
      paymentUrl,
      paymentLinkId,
      orderId,
    };
  } catch (error) {
    console.error(
      "❌ Square Contract Payment Error:",
      error.response?.data || error.message,
    );

    throw new Error("Failed to generate contract payment link");
  }
}


async function generateInvoicePaymentLink({
  amount,
  clientName,
  customerEmail,
  user_id,
  invoice_id,
  invoiceRefNo,
  paymentPurpose = "FULL",
}) {
  try {
    const actualAmount = Number(amount || 0);

    if (
      !Number.isFinite(actualAmount) ||
      actualAmount <= 0
    ) {
      throw new Error("Payment amount must be greater than zero");
    }

    const validPurposes = ["FULL", "DEPOSIT", "BALANCE"];

    if (!validPurposes.includes(paymentPurpose)) {
      throw new Error("Invalid payment purpose");
    }

    const squareAmount = Math.round(actualAmount * 100);

    // Reuse only a pending payment for the same invoice AND purpose.
    const existingPayment = await Payment.findOne({
      where: {
        invoice_id,
        payment_status: "PENDING",
        payment_purpose: paymentPurpose,
      },
      order: [["created_at", "DESC"]],
    });

    if (existingPayment) {
      return {
        paymentUrl: existingPayment.receipt_url,
        paymentLinkId: existingPayment.square_payment_link_id,
        orderId: existingPayment.square_order_id,
      };
    }

    const body = {
      idempotency_key: uuidv4(),

      order: {
        location_id: config.square.locationId,

        line_items: [
          {
            name: `Invoice #${invoiceRefNo} - ${clientName} (${paymentPurpose})`,
            quantity: "1",
            base_price_money: {
              amount: squareAmount,
              currency: "USD",
            },
          },
        ],

        taxes: [
          {
            name: "Sales Tax (7.5%)",
            percentage: "7.5",
            scope: "ORDER",
          },
        ],
      },

      checkout_options: {
        allow_tipping: true,
        redirect_url: "https://admin.socialsanitation.com/checkout",
        tip_settings: {
          separate_tip_screen: false,
          enable_custom_tip_amount: true,
          show_custom_tip_amount: true,
          show_tip_buttons: true,
          tip_percentages: [10, 15, 20],
        },
      },

      pre_populate_buyer_email: customerEmail,
    };

    const response = await axios.post(paymentLinksUrl(), body, { headers: squareJsonHeaders() });

    const paymentLink = response.data.payment_link;

    await Payment.create({
      transaction_id: null,
      square_order_id: paymentLink.order_id,
      currency: "USD",
      user_id,
      invoice_id,
      booking_id: null,
      square_payment_link_id: paymentLink.id,
      payment_purpose: paymentPurpose,
      amount: actualAmount,
      square_customer_id: customerEmail,
      description: `Invoice #${invoiceRefNo} - ${paymentPurpose}`,
      payment_status: "PENDING",
      receipt_url: paymentLink.url,
    });

    return {
      paymentUrl: paymentLink.url,
      paymentLinkId: paymentLink.id,
      orderId: paymentLink.order_id,
    };
  } catch (error) {
    console.error(
      "Square Invoice Payment Error:",
      error.response?.data || error.message
    );

    throw new Error("Failed to generate invoice payment link");
  }
}


module.exports = {
  generateSquarePaymentLink,
  deleteSquarePaymentLink,
  generateContractPaymentLink,
  generateInvoicePaymentLink,
};
