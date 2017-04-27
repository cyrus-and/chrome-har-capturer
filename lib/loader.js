'use strict';

const HAR = require('./har');
const Page = require('./page');

const EventEmitter = require('events');

function run(urls, options = {}) {
    const notifier = new EventEmitter();
    // single page load function
    const handleUrl = async (url, index, urls) => {
        // user-defined handler errors must not be catched
        const page = new Page(url, index, urls, options);
        notifier.emit('load', url, index, urls);
        try {
            await page.load();
        } catch (err) {
            notifier.emit('fail', url, err, index, urls);
            return null;
        }
        notifier.emit('done', url, index, urls);
        return page;
    };
    // continue in the next tick to allow event registration
    process.nextTick(async () => {
        // process the URLs and gather info
        let pages = [];
        if (options.parallel) {
            // TODO set max degree
            // concurrently
            pages = await Promise.all(urls.map(handleUrl));
        } else {
            // sequentially
            for (const [index, url] of urls.entries()) {
                pages.push(await handleUrl(url, index, urls));
            }
        }
        // skip failed pages
        pages = pages.filter((page) => page);
        // build and return the HAR file
        const har = HAR.create(pages);
        notifier.emit('har', har);
    });
    // notify the user using an event emitter
    return notifier;
}

module.exports = {run};
