'use strict';

const Stats = require('./stats');

class Replay {
    constructor(url, log) {
        this._url = url;
        this._log = log;
    }

    async load() {
        const stats = new Stats(this._url);
        await new Promise((fulfill, reject) => {
            for (const event of this._log) {
                stats.processEvent(fulfill, reject, event);
            }
        });
        return stats;
    }
}

module.exports = Replay;
