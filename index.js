var util = require('util');
var common = require('./lib/common.js');
var Client = require('./lib/Client.js');

exports.load = function (urls, options) {
    return new Client(util.isArray(urls) ? urls : [urls], options);
};

exports.setVerbose = function (verbose) {
    common.verbose = (typeof verbose === 'undefined' ? true : !!verbose);
};
