'use strict';

const Loader = require('./lib/loader');

function run(urls, options = {}) {
    return new Loader(urls, options);
}

module.exports = {run};
