// Invoice service: the scheduled jobs that send invoices, generate recurring ones and email due balances

const { status: httpStatus } = require("http-status");
const logger = require("../../../config/logger");
const { docUrl } = require("../../../config/storage");
const { invoiceSenderEmail } = require("../../../config/company");
const { Op } = require("sequelize");
const { dayjs, dateInTz, toCalendarDate, parseDateInZone, DATE_FORMAT } = require("../../../utils/time");
const { Invoice, InvoiceItem, User, Profile, InvoiceRecurring } = require("../../../models");
const { generateInvoicePDF } = require("../pdf.service");
const { sendInvoiceEmailWithPDF } = require("../email.service");
const ApiError = require("../../../utils/ApiError");
const toBoolean = require("../../../utils/toBoolean");
const { splitDeposit } = require("../../../utils/money");
const { INVOICE } = require("../../../config/rules");
const { generateInvoicePaymentLink } = require("../square.service");
const {
  invoicePaymentStageTypes,
  invoiceStatusTypes,
  paymentPurposeTypes,
  recurringInvoiceStatusTypes,
} = require("../../../config/types");
const { getNextInvoiceRef } = require("./invoices");
const { timezone } = require("./shared");

//   try {

//     const invoices = await Invoice.findAll({
//         status: "ACTIVE",
//         is_active: true,

//       },
//     });

//         continue;

//       /* ---------- FETCH ITEMS ---------- */

//       /* ---------- FETCH USER ---------- */

//       /* ---------- GENERATE PAYMENT LINK ---------- */

//       /* ---------- GENERATE PDF ---------- */

//       /* ---------- UPDATE PDF + PAYMENT LINK ---------- */

//       /* ---------- SEND EMAIL ---------- */

//       /* ---------- MARK AS SENT ---------- */

//   } catch (error) {

const sendInvoiceCron = async () => {
  try {
    const todayNY = dateInTz();


    const invoices = await Invoice.findAll({
      where: {
        status: invoiceStatusTypes.ACTIVE,
        is_active: true,
        // Only send invoices whose billing date is today or in the future.
        // Historical invoices must never be emailed by this cron.
        billing_date: {
          [Op.gte]: todayNY,
        },

        scheduled_send_at: {
          [Op.lte]: new Date(),
        },

        last_sent_at: null,
      },
    });

    logger.debug(`Invoices to process: ${invoices.length}`);

    for (const invoice of invoices) {
      /* ---------- PREVENT DUPLICATE SEND ---------- */

      if (
        invoice.last_sent_at &&
        dateInTz(invoice.last_sent_at) === todayNY
      ) {
        continue;
      }

      /* ---------- FETCH ITEMS ---------- */

      const items = await InvoiceItem.findAll({
        where: {
          invoice_id: invoice.id,
        },
        order: [["sort_order", "ASC"]],
      });

      /* ---------- FETCH USER ---------- */

      const user = await User.findByPk(invoice.user_id, {
        include: [
          {
            model: Profile,
            as: "user_profile",
            attributes: ["name"],
          },
        ],
      });

      /* ---------- DETERMINE PAYMENT AMOUNT ---------- */

      let paymentAmount;
      let paymentPurpose;

      if (invoice.deposit_required) {
        // The cron may send only the initial deposit.
        if (invoice.payment_stage !== invoicePaymentStageTypes.DEPOSIT_PENDING) {
          logger.debug(
            `Skipping invoice ${invoice.ref_no}: payment stage is ${invoice.payment_stage}`,
          );
          continue;
        }

        paymentAmount = Number(invoice.deposit_amount || 0);
        paymentPurpose = paymentPurposeTypes.DEPOSIT;
      } else {
        // Existing non-deposit invoices retain full-payment behavior.
        if (invoice.payment_stage && invoice.payment_stage !== invoicePaymentStageTypes.FULL) {
          logger.debug(
            `Skipping invoice ${invoice.ref_no}: payment stage is ${invoice.payment_stage}`,
          );
          continue;
        }

        paymentAmount = Number(invoice.total_due || 0);
        paymentPurpose = paymentPurposeTypes.FULL;
      }

      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
        logger.debug(
          `Skipping invoice ${invoice.ref_no}: invalid payment amount`,
        );
        continue;
      }

      /* ---------- GENERATE PAYMENT LINK ---------- */

      const { paymentUrl } = await generateInvoicePaymentLink({
        amount: paymentAmount,
        clientName: invoice.to_company_name,
        customerEmail: user?.email,
        user_id: invoice.user_id,
        invoice_id: invoice.id,
        invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
        paymentPurpose,
      });

      /* ---------- GENERATE PDF ---------- */

      const serviceParts = invoice.service_dates
        ? invoice.service_dates.split(" - ")
        : ["", ""];

      const pdfPath = await generateInvoicePDF({
        invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
        event_name: invoice.event_name,
        service_start: serviceParts[0],
        service_end: serviceParts[1],
        invoice_date: invoice.date,
        billing_date: invoice.billing_date,
        due_date: invoice.due_date,
        to_company_name: invoice.to_company_name,
        address_1: invoice.address_1,
        address_2: invoice.address_2,
        total_due: invoice.total_due,
        signature: invoice.signature,
        items,
        payment_link: paymentUrl,
      });

      /* ---------- UPDATE PDF + PAYMENT LINK ---------- */

      const fileName = pdfPath.split("/").pop();

      const publicUrl = docUrl(fileName);

      await invoice.update({
        pdf_url: publicUrl,
        payment_url: paymentUrl,
      });

      /* ---------- SEND EMAIL ---------- */

      if (user?.email) {
        const senderEmail = invoiceSenderEmail(user.assigned_to);

        await sendInvoiceEmailWithPDF(user, invoice, pdfPath, senderEmail);
      }

      /* ---------- MARK AS SENT ---------- */

      await invoice.update({
        last_sent_at: new Date(),
      });

      logger.info(`Invoice ${invoice.ref_no} sent successfully.`);
    }
  } catch (error) {
    logger.error("sendInvoiceCron error:", error);
  }
};

const generateRecurringInvoicesCron = async () => {
  try {
    const today = dateInTz();

    const recurringInvoices = await InvoiceRecurring.findAll({
      where: {
        status: recurringInvoiceStatusTypes.ACTIVE,
        next_billing_date: today,
      },
    });

    logger.info(
      `Recurring invoices to generate: ${recurringInvoices.length}`,
    );

    for (const recurring of recurringInvoices) {
      try {

        const invoice = await Invoice.findByPk(recurring.invoice_id, {
          include: [
            {
              model: InvoiceItem,
              as: "service_invoice_item",
              separate: true,
              order: [["sort_order", "ASC"]],
            },
          ],
        });

        if (!invoice) {
          logger.warn(
            `Invoice not found for recurring schedule ${recurring.id}.`,
          );
          continue;
        }

        // ---------- CHECK OCCURRENCE LIMIT ----------

        if (
          recurring.max_occurrences &&
          Number(recurring.occurrences_generated || 0) >=
            Number(recurring.max_occurrences)
        ) {
          logger.info(`Recurring schedule ${recurring.id} reached its maximum occurrences.`);

          await recurring.update({
            status: recurringInvoiceStatusTypes.COMPLETED,
          });

          continue;
        }

        // ---------- CHECK TEMPLATE STATUS ----------

        if (invoice.status !== invoiceStatusTypes.ACTIVE || !invoice.is_active) {
          logger.info(`Recurring schedule ${recurring.id}: template invoice ${invoice.id} is inactive.`);
          continue;
        }

        // ---------- CHECK RECURRING END DATE ----------

        const billingMoment = parseDateInZone(recurring.next_billing_date, timezone);

        if (!billingMoment.isValid()) {
          logger.error(
            `Invalid next billing date for recurring schedule ${recurring.id}:`,
            recurring.next_billing_date,
          );
          continue;
        }

        if (recurring.end_date) {
          const endMoment = parseDateInZone(recurring.end_date, timezone);

          if (
            endMoment.isValid() &&
            billingMoment.isAfter(endMoment, "day")
          ) {
            logger.info(
              `Recurring schedule ${recurring.id} completed.`,
            );

            await recurring.update({
              status: recurringInvoiceStatusTypes.COMPLETED,
            });

            continue;
          }
        }

        // ---------- CALCULATE NEXT BILLING DATE ----------

        let nextBillingMoment = billingMoment.clone();

        switch (recurring.frequency) {
          case "WEEKLY":
            nextBillingMoment = nextBillingMoment.add(1, "week");
            break;

          case "BIWEEKLY":
            nextBillingMoment = nextBillingMoment.add(2, "weeks");
            break;

          case "MONTHLY":
            nextBillingMoment = nextBillingMoment.add(1, "month");
            break;

          case "QUARTERLY":
            nextBillingMoment = nextBillingMoment.add(3, "months");
            break;

          case "YEARLY":
            nextBillingMoment = nextBillingMoment.add(1, "year");
            break;

          default:
            nextBillingMoment = nextBillingMoment.add(1, "month");
        }

        // ---------- CALCULATE NEXT DUE DATE ----------

        const originalBillingMoment = dayjs(
          invoice.billing_date,
          DATE_FORMAT,
          true,
        );

        const originalDueMoment = dayjs(
          invoice.due_date,
          DATE_FORMAT,
          true,
        );

        let dueGap = 0;

        if (
          originalBillingMoment.isValid() &&
          originalDueMoment.isValid()
        ) {
          dueGap = originalDueMoment.diff(
            originalBillingMoment,
            "days",
          );
        }

        const nextDueDate = billingMoment
          .clone()
          .add(dueGap, "days")
          .format(DATE_FORMAT);

        const nextInvoiceDate = billingMoment.format(DATE_FORMAT);

        // ---------- CALCULATE SERVICE DATES ----------

        const serviceParts = invoice.service_dates
          ? invoice.service_dates.split(" - ")
          : ["", ""];

        const originalServiceStart = dayjs(
          serviceParts[0],
          DATE_FORMAT,
          true,
        );

        const originalServiceEnd = dayjs(
          serviceParts[1],
          DATE_FORMAT,
          true,
        );

        let serviceDuration = 0;

        if (
          originalServiceStart.isValid() &&
          originalServiceEnd.isValid()
        ) {
          serviceDuration = Math.max(
            0,
            originalServiceEnd.diff(originalServiceStart, "days"),
          );
        }

        const nextServiceStart = billingMoment.format(DATE_FORMAT);

        const nextServiceEnd = billingMoment
          .clone()
          .add(serviceDuration, "days")
          .format(DATE_FORMAT);

        // ---------- PRESERVE DEPOSIT SETTINGS ----------

        // Handles Sequelize booleans and common DB representations.
        const recurringDepositRequired =
          toBoolean(invoice.deposit_required);

        const rawDepositPercentage = Number(
          invoice.deposit_percentage,
        );

        const recurringDepositPercentage = recurringDepositRequired
          ? Number.isFinite(rawDepositPercentage) &&
            rawDepositPercentage > 0 &&
            rawDepositPercentage <= 100
            ? rawDepositPercentage
            : INVOICE.DEFAULT_DEPOSIT_PERCENT
          : 0;

        const totalDue = Number(invoice.total_due || 0);

        if (!Number.isFinite(totalDue) || totalDue < 0) {
          logger.error(
            `Invalid total_due on recurring template invoice ${invoice.id}.`,
          );
          continue;
        }

        const { deposit: recurringDepositAmount, balance: recurringBalanceAmount } = recurringDepositRequired
          ? splitDeposit(totalDue, recurringDepositPercentage)
          : { deposit: null, balance: null };

        // Shift the balance due date by the same number of days
        // as the gap between the template billing date and balance date.
        let nextBalanceDueDate = null;

        if (recurringDepositRequired) {
          const originalBalanceDueMoment = dayjs(
            invoice.balance_due_date,
            DATE_FORMAT,
            true,
          );

          if (!originalBillingMoment.isValid()) {
            logger.error(
              `Cannot generate deposit invoice from template ${invoice.id}: invalid billing_date.`,
            );
            continue;
          }

          if (!originalBalanceDueMoment.isValid()) {
            logger.error(
              `Cannot generate deposit invoice from template ${invoice.id}: balance_due_date is missing or invalid.`,
            );
            continue;
          }

          const balanceGap = originalBalanceDueMoment.diff(
            originalBillingMoment,
            "days",
          );

          if (balanceGap <= 0) {
            logger.error(
              `Cannot generate deposit invoice from template ${invoice.id}: balance_due_date must be after billing_date.`,
            );
            continue;
          }

          nextBalanceDueDate = billingMoment
            .clone()
            .add(balanceGap, "days")
            .format(DATE_FORMAT);
        }

        // ---------- GENERATE NEXT INVOICE REFERENCE ----------

        const newRefData = await getNextInvoiceRef(invoice.ref_type);
        const newRef = newRefData.ref_no;

        // ---------- CHECK FOR DUPLICATE ----------

        const existingInvoice = await Invoice.findOne({
          where: {
            user_id: invoice.user_id,
            billing_date: billingMoment.format(DATE_FORMAT),
            ref_type: invoice.ref_type,
            status: invoiceStatusTypes.ACTIVE,
            is_active: true,
          },
        });

        if (existingInvoice) {
          logger.info(
            `Invoice already exists for billing date ${nextInvoiceDate}.`,
          );
          continue;
        }

        // ---------- CREATE NEXT INVOICE ----------

        const newInvoice = await Invoice.create({
          user_id: invoice.user_id,
          quote_id: invoice.quote_id,

          ref_type: invoice.ref_type,
          ref_no: newRef,
          event_name: invoice.event_name,

          scheduled_send_at: billingMoment
            .clone()
            .hour(9)
            .minute(0)
            .second(0)
            .millisecond(0)
            .toDate(),

          custom_ref_no: null,

          service_dates: `${nextServiceStart} - ${nextServiceEnd}`,

          billing_date: nextInvoiceDate,
          date: nextInvoiceDate,
          due_date: nextDueDate,

          to_company_name: invoice.to_company_name,
          address_1: invoice.address_1,
          address_2: invoice.address_2,

          // The invoice's total remains the full invoice amount.
          total_due: totalDue,

          signature: invoice.signature,

          // Deposit configuration is copied to each future invoice.
          deposit_required: recurringDepositRequired,
          deposit_percentage: recurringDepositRequired
            ? recurringDepositPercentage
            : invoice.deposit_percentage ?? INVOICE.DEFAULT_DEPOSIT_PERCENT,
          deposit_amount: recurringDepositAmount,
          balance_amount: recurringBalanceAmount,
          balance_due_date: nextBalanceDueDate,

          // Every generated invoice starts with a fresh payment lifecycle.
          payment_stage: recurringDepositRequired
            ? invoicePaymentStageTypes.DEPOSIT_PENDING
            : invoicePaymentStageTypes.FULL,
          deposit_paid_at: null,
          balance_sent_at: null,
          balance_paid_at: null,

          status: invoiceStatusTypes.ACTIVE,
          is_active: true,
        });

        logger.info(
          `Created recurring invoice ${newInvoice.ref_no}. Deposit required: ${recurringDepositRequired}.`,
        );

        // ---------- COPY INVOICE ITEMS ----------

        const newItems = (
          invoice.service_invoice_item || []
        ).map((item) => ({
          invoice_id: newInvoice.id,

          description: item.description,
          frequency: item.frequency,

          quantity: item.quantity,

          calculation_type: item.calculation_type,
          sqft: item.sqft,
          hour: item.hour,

          unit_price: item.unit_price,
          amount: item.amount,
          sort_order: item.sort_order,
        }));

        if (newItems.length > 0) {
          await InvoiceItem.bulkCreate(newItems);
        }


        // ---------- UPDATE RECURRING SCHEDULE ----------

        const finalCount =
          Number(recurring.occurrences_generated || 0) + 1;

        const updateData = {
          occurrences_generated: finalCount,
          next_billing_date: nextBillingMoment.format(DATE_FORMAT),
        };

        if (
          recurring.max_occurrences &&
          finalCount >= Number(recurring.max_occurrences)
        ) {
          updateData.status = recurringInvoiceStatusTypes.COMPLETED;
        }

        if (
          recurring.end_date &&
          nextBillingMoment.isAfter(
            parseDateInZone(recurring.end_date, timezone),
            "day",
          )
        ) {
          updateData.status = recurringInvoiceStatusTypes.COMPLETED;
        }

        await recurring.update(updateData);

        logger.info(
          `Recurring schedule ${recurring.id} updated. Next billing date: ${nextBillingMoment.format(DATE_FORMAT)}`,
        );
      } catch (invoiceError) {
        logger.error(
          `Failed processing recurring schedule ${recurring.id}:`,
          invoiceError,
        );
        // Continue processing other recurring invoices.
      }
    }
  } catch (error) {
    logger.error("generateRecurringInvoicesCron:", error);
  }
};

const sendInvoiceBalance = async (invoice_id) => {
  try {
    const invoice = await Invoice.findByPk(invoice_id, {
      include: [
        {
          model: InvoiceItem,
          as: "service_invoice_item",
          separate: true,
          order: [["sort_order", "ASC"]],
        },
      ],
    });

    if (!invoice) {
      throw new ApiError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    if (!invoice.deposit_required) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "This invoice does not use the deposit payment option.",
      );
    }

    if (invoice.payment_stage !== invoicePaymentStageTypes.DEPOSIT_PAID) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The deposit must be paid before sending the remaining balance.",
      );
    }

    if (invoice.balance_sent_at) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The remaining balance has already been sent.",
      );
    }

    const balanceAmount = Number(invoice.balance_amount || 0);

    if (!Number.isFinite(balanceAmount) || balanceAmount <= 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No remaining balance is due.",
      );
    }

    const user = await User.findByPk(invoice.user_id, {
      include: [
        {
          model: Profile,
          as: "user_profile",
          attributes: ["name"],
        },
      ],
    });

    if (!user) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "Invoice user not found.",
      );
    }

    if (!user.email) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "The invoice user does not have an email address.",
      );
    }

    // Generate a Square link for the remaining balance only.
    const { paymentUrl } = await generateInvoicePaymentLink({
      amount: balanceAmount,
      clientName: invoice.to_company_name,
      customerEmail: user.email,
      user_id: invoice.user_id,
      invoice_id: invoice.id,
      invoiceRefNo: invoice.custom_ref_no || invoice.ref_no,
      paymentPurpose: paymentPurposeTypes.BALANCE,
    });

    if (!paymentUrl) {
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        "Failed to generate the remaining balance payment link.",
      );
    }

    const serviceParts = invoice.service_dates
      ? invoice.service_dates.split(" - ")
      : ["", ""];

    const pdfPath = await generateInvoicePDF({
      invoice_ref_no: invoice.custom_ref_no || invoice.ref_no,
      event_name: invoice.event_name,
      service_start: serviceParts[0],
      service_end: serviceParts[1],
      invoice_date: invoice.date,
      billing_date: invoice.billing_date,
      due_date: invoice.due_date,
      to_company_name: invoice.to_company_name,
      address_1: invoice.address_1,
      address_2: invoice.address_2,
      total_due: invoice.total_due,
      amount_due_now: balanceAmount,
      signature: invoice.signature,
      items: invoice.service_invoice_item || [],
      payment_link: paymentUrl,
    });

    const fileName = pdfPath.split("/").pop();
    const publicUrl = docUrl(fileName);

    // Save the generated link and PDF, but do not mark the balance as sent yet.
    await invoice.update({
      payment_url: paymentUrl,
      pdf_url: publicUrl,
    });

    const senderEmail = invoiceSenderEmail(user.assigned_to);

    // If this fails, payment_stage remains DEPOSIT_PAID and balance_sent_at
    // remains null, allowing the cron to retry on a later run.
    await sendInvoiceEmailWithPDF(user, invoice, pdfPath, senderEmail);

    // Mark the balance as sent only after the email service succeeds.
    await invoice.update({
      payment_stage: invoicePaymentStageTypes.BALANCE_PENDING,
      balance_sent_at: new Date(),
      last_sent_at: new Date(),
    });

    return {
      success: true,
      message: "Remaining balance invoice sent successfully",
      data: {
        invoice_id: invoice.id,
        total_due: Number(invoice.total_due),
        deposit_amount: Number(invoice.deposit_amount),
        balance_amount: balanceAmount,
        payment_stage: invoicePaymentStageTypes.BALANCE_PENDING,
        balance_sent_at: invoice.balance_sent_at,
        payment_url: paymentUrl,
      },
    };
  } catch (error) {
    throw ApiError.from(error);
  }
};

const sendDueBalancesCron = async () => {
  try {
    const nowNY = dayjs().tz(timezone);
    const todayNY = nowNY.format(DATE_FORMAT);

    // The balance email must never be sent before 9:00 AM New York time.
    if (nowNY.hour() < 9) {
      logger.debug("Balance cron skipped: it is before 9:00 AM New York time.");
      return;
    }

    const invoices = await Invoice.findAll({
      where: {
        status: invoiceStatusTypes.ACTIVE,
        is_active: true,
        deposit_required: true,
        payment_stage: invoicePaymentStageTypes.DEPOSIT_PAID,
        balance_sent_at: null,

        // The selected balance due date must have arrived.
        balance_due_date: {
          [Op.lte]: todayNY,
        },
      },
    });

    logger.debug(
      `Balances eligible to send after 9 AM: ${invoices.length}`,
    );

    for (const invoice of invoices) {
      try {
        // Recheck the current database state before sending.
        const currentInvoice = await Invoice.findByPk(invoice.id);

        if (
          !currentInvoice ||
          !currentInvoice.is_active ||
          currentInvoice.status !== invoiceStatusTypes.ACTIVE ||
          !currentInvoice.deposit_required ||
          currentInvoice.payment_stage !== invoicePaymentStageTypes.DEPOSIT_PAID ||
          currentInvoice.balance_sent_at ||
          !currentInvoice.balance_due_date ||
          toCalendarDate(currentInvoice.balance_due_date) > todayNY
        ) {
          continue;
        }

        await sendInvoiceBalance(currentInvoice.id);

        logger.info(
          `Balance sent for invoice ${currentInvoice.ref_no}`,
        );
      } catch (err) {
        logger.error(
          `Balance failed for invoice ${invoice.ref_no}:`,
          err.message,
        );
      }
    }
  } catch (error) {
    logger.error("sendDueBalancesCron error:", error);
  }
};

module.exports = { sendInvoiceCron, sendInvoiceBalance, generateRecurringInvoicesCron, sendDueBalancesCron };
