var util = require('util');
var Client = require('./lib/Client.js');

exports.load = function (urls, options) {
    return new Client(util.isArray(urls) ? urls : [urls], options);
};
