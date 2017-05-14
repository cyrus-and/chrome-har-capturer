'use strict';

const HAR = require('./lib/har');
const Loader = require('./lib/loader');
const Replay = require('./lib/replay');

function run(urls, options = {}) {
    return new Loader(urls, options);
}

async function fromLog(url, log) {
    const replay = new Replay(url, log);
    const stats = await replay.load();
    return HAR.create([stats]);
}

module.exports = {run, fromLog};
