const { status: httpStatus } = require("http-status");
const { paymentStatusTypes } = require("../../config/types");
const { Op } = require("sequelize");
const { dayBoundsUtc } = require("../../utils/time");

const { Payment } = require("../../models");
const catchAsync = require("../../utils/catchAsync");
const ApiError = require("../../utils/ApiError");
const responseWrapper = require("../../config/responseWrapper");

const getNewPaymentCount = catchAsync(async (req, res) => {
    try {
        const { start, end } = dayBoundsUtc();
        const paymentDoc = await Payment.findAll({
            attributes: ['id'],
            where: { created_at: { [Op.between]: [start, end] }, payment_status: paymentStatusTypes.SUCCESS }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        return responseWrapper(res, paymentDoc.length ? paymentDoc.length : 0, "");

    } catch (error) {
        throw ApiError.from(error);
    }
});

const getNewPaymentTotal = catchAsync(async (req, res) => {
    try {
        const { start, end } = dayBoundsUtc();
        const paymentDoc = await Payment.findAll({
            attributes: ['id', 'amount'],
            where: { created_at: { [Op.between]: [start, end] }, payment_status: paymentStatusTypes.SUCCESS }
        })
        if (!paymentDoc) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to Fetch Count');
        let totalPayment = paymentDoc.map(obj => obj.amount).reduce((a, b) => a + b, 0);;
        return responseWrapper(res, totalPayment ? totalPayment : 0, "");

    } catch (error) {
        throw ApiError.from(error);
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
