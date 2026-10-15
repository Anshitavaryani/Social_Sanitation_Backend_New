const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const sendSMS = async ({ to, message }) => {
  console.log("hey reached sendSMS function");
  return client.messages.create({
    body: message,
    from: process.env.TWILIO_FROM,
    to,
    statusCallback: "https://node.socialsanitation.com:3000/api/v1/admin/user/twilio/sms-status",
  });
  
};

module.exports = sendSMS;
