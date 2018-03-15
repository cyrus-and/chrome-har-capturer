'use strict';

const HAR = require('./har');
const Live = require('./live');

const EventEmitter = require('events');

class Loader extends EventEmitter {
    constructor(urls, options) {
        super();
        this._urls = urls;
        this._options = options;
        // continue in the next tick to allow event registration
        process.nextTick(() => {
            this._run();
        });
    }

    async _run() {
        // process the URLs and gather info
        const pages = this._options.parallel
              ? await this._runConcurrently()
              : await this._runSequentially();
        // build and return the HAR file
        const har = HAR.create(pages.filter((stats) => !!stats));
        this.emit('har', har);
    }

    async _runSequentially() {
        const pages = [];
        for (const [index, url] of this._urls.entries()) {
            pages.push(await this._handleUrl(url, index));
        }
        return pages;
    }

    async _runConcurrently() {
        const pages = [];
        const degree = Number(this._options.parallel);
        let index = 0;
        const worker = async () => {
            while (index < this._urls.length) {
                const url = this._urls[index];
                const stats = await this._handleUrl(url, index++);
                pages.push(stats);
            }
        };
        // spawn workers
        await Promise.all(new Array(degree).fill().map(worker));
        return pages;
    }

    async _handleUrl(url, index, triesLeft = this._options.retry || 0) {
        const live = new Live({
            url, index,
            urls: this._urls,
            options: this._options
        });
        try {
            this.emit('load', url, index, this._urls);
            const stats = await live.load();
            this.emit('done', url, index, this._urls);
            return stats;
        } catch (err) {
            this.emit('fail', url, err, index, this._urls);
            if (triesLeft > 0) {
                await new Promise((fulfill, reject) => {
                    setTimeout(fulfill, this._options.retryDelay || 0);
                });
                return this._handleUrl(url, index, triesLeft - 1);
            } else {
                return null;
            }
        }
    }
}

module.exports = Loader;
