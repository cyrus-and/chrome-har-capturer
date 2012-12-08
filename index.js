var Client = require('./lib/Client.js');

exports.load = function (urls, options) {
    return new Client(urls, options);
};
