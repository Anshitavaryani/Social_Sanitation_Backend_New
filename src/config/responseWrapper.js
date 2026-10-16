// Every JSON response: success is true for 2xx and 3xx statuses, false for errors
function responseWrapper(res, data, message, status = 200) {
    return res.status(status).json({
        success: status < 400,
        status: status,
        message : message,
        data: data,
    });
};
module.exports = responseWrapper;