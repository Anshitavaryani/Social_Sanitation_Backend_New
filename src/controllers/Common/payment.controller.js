const { status: httpStatus } = require("http-status");
const { Op } = require("sequelize");
const moment = require("moment");

const { Payment } = require("../../models");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const responseWrapper = require("../../config/responseWrapper");

const getNewPaymentCount = catchAsync(async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const paymentDoc = await Payment.findAll({
            attributes: ['id'],
            where: { created_at: { [Op.between]: [`${today} 00:00:00`, `${today} 23:59:59`] }, payment_status: 'SUCCESS' }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        return responseWrapper(res, paymentDoc.length ? paymentDoc.length : 0, "");

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const getNewPaymentTotal = catchAsync(async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const paymentDoc = await Payment.findAll({
            attributes: ['id', 'amount'],
            where: { created_at: { [Op.between]: [`${today} 00:00:00`, `${today} 23:59:59`] }, payment_status: 'SUCCESS' }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        let totalPayment = paymentDoc.map(obj => obj.amount).reduce((a, b) => a + b, 0);;
        return responseWrapper(res, totalPayment ? totalPayment : 0, "");

    } catch (error) {
        throw new ApiError(error.statusCode ? error.statusCode : httpStatus.INTERNAL_SERVER_ERROR, error.message);
    }
});

const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await Payment.findOne({
      where: { transaction_id: orderId },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        status: "NOT_FOUND",
        message: "Payment not found",
      });
    }

    // If payment is successful → mark quote as PAID
    // if (payment.payment_status === "SUCCESS" && payment.quote_id) {
    //   await ServiceQuote.update(
    //     { payment_status: "PAID" },
    //     { where: { id: payment.quote_id } }
    //   );
    // }

    return res.status(200).json({
      success: true,
      data: {
        payment_status: payment.payment_status,
        amount: payment.amount,
        currency: payment.currency,
        receipt_url: payment.receipt_url,
      },
    });
  } catch (error) {
    console.error("getPaymentStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment status",
    });
  }
};




module.exports = {
    getNewPaymentCount,
    getNewPaymentTotal,
    getPaymentStatus
};
