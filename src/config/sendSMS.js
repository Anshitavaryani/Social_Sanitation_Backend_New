const twilio = require("twilio");
const config = require("./config");

const client = twilio(config.twilio.accountSid, config.twilio.authToken);

const sendSMS = async ({ to, message }) => {
  return client.messages.create({
    body: message,
    from: config.twilio.from,
    to,
    statusCallback: "https://node.socialsanitation.com:3000/api/v1/admin/user/twilio/sms-status",
  });
  
};

module.exports = sendSMS;
