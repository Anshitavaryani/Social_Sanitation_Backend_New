const morgan = require('morgan');
const config = require('./config.js')
const logger = require('./logger.js')

const moment = require('moment');
const fs = require('fs');
const path = require('path');

morgan.token('message', (req, res) => res.locals.errorMessage || '');

const getIpFormat = () => (config.env === 'production' ? ':remote-addr - ' : '');
const successResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms`;
const errorResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms - message: :message`;

const successHandler = morgan(successResponseFormat, {
    skip: (req, res) => res.statusCode >= 400,
    stream: {
        write: (message) => {

            const currentTime = moment().format('YYYY-MM-DD');
            const currentTime1 = moment().format();
            const logMessage = `${currentTime1}<=>${message.trim()}\n`;
            const logsDir = path.join(__dirname, '../../logs');
            const fileName = path.join(logsDir, `${currentTime}.log`);
            fs.access(fileName, fs.constants.F_OK, (err) => {
                if (err) {
                    // If the file does not exist, create it
                    fs.writeFile(fileName, logMessage, (err) => {
                        if (err) {
                            console.error('Error creating file:', err);
                            return;
                        }
                    });
                } else {
                    // If the file already exists, append the log message to it
                    fs.appendFile(fileName, logMessage, (err) => {
                        if (err) {
                            console.error('Error appending to file:', err);
                            return;
                        }
                    });
                }
            });

            logger.info(logMessage);
        }
    },
});


const errorHandler = morgan(errorResponseFormat, {
    skip: (req, res) => res.statusCode < 400,
    stream: {
        write: (message) => {
            const currentTime = moment().format('YYYY-MM-DD');
            const currentTime1 = moment().format();
            const logMessage = `${currentTime1}<=> Error ${message.trim()}\n`;
            const logsDir = path.join(__dirname, '../../logs');
            const fileName = path.join(logsDir, `${currentTime}.log`);
            fs.access(fileName, fs.constants.F_OK, (err) => {
                if (err) {
                    // If the file does not exist, create it
                    fs.writeFile(fileName, logMessage, (err) => {
                        if (err) {
                            console.error('Error creating file:', err);
                            return;
                        }
                    });
                } else {
                    // If the file already exists, append the log message to it
                    fs.appendFile(fileName, logMessage, (err) => {
                        if (err) {
                            console.error('Error appending to file:', err);
                            return;
                        }
                    });
                }
            });
            logger.error(message.trim())
        }
    },
});

module.exports = {
    successHandler,
    errorHandler,
};
