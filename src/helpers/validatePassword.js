
const passwordValidator = require('password-validator');
const { PASSWORD } = require('../config/rules');


// The password policy in src/config/rules.js: length, digits, no spaces, blocked values
const schema = new passwordValidator();

schema
    .is().min(PASSWORD.MIN_LENGTH)
    .is().max(PASSWORD.MAX_LENGTH)
    .has().digits(PASSWORD.MIN_DIGITS)
    .has().not().spaces()
    .is().not().oneOf([...PASSWORD.BLOCKED]);



const validatePassword = function (pass) {
    return schema.validate(pass)
};


module.exports = validatePassword;
