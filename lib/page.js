'use strict';

const Context = require('./context');

class Timer {
    constructor(milliseconds) {
        this._milliseconds = milliseconds;
    }

    start() {
        this.cancel();
        return new Promise((fulfill, reject) => {
            if (typeof this._milliseconds === 'undefined') {
                // wait indefinitely
                return;
            }
            this._id = setTimeout(fulfill, this._milliseconds);
        });
    }

    cancel() {
        clearTimeout(this._id);
    }
}

class Page {
    constructor({url, index, urls, options}) {
        this._url = url;
        this._index = index;
        this._urls = urls;
        this._options = options;
    }

    async load() {
        // reset page load variables
        this.info = {
            url: this._url,
            firstRequestId: undefined,
            firstRequestMs: undefined,
            domContentEventFiredMs: undefined,
            loadEventFiredMs: undefined,
            entries: new Map(),
            user: undefined
        };
        // create a fresh new context for this URL
        const context = new Context(this._options);
        const client = await context.create();
        // hooks
        const {preHook, postHook} = this._options;
        const hookArgs = [this._url, client, this._index, this._urls];
        // optionally run the user-defined hook
        if (typeof preHook === 'function') {
            await preHook.apply(null, hookArgs);
        }
        // create (but not start) the page timer
        const timer = new Timer(this._options.timeout);
        // handle proper page load and postHook or related errors
        const pageLoad = async () => {
            try {
                // start the page load and waits for its termination
                await this._loadPage(client);
                // optionally run the user-defined hook
                if (typeof postHook === 'function') {
                    this.info.user = await postHook.apply(null, hookArgs);
                }
            } finally {
                // no-matter-what cleanup functions
                await context.destroy();
                timer.cancel();
            }
        };
        // handle Chrome disconnection
        const disconnection = async () => {
            await new Promise((fulfill, reject) => {
                client.once('disconnect', fulfill);
            });
            timer.cancel();
            throw new Error('Disconnected');
        };
        // handle page timeout
        const timeout = async () => {
            await timer.start();
            await context.destroy();
            throw new Error('Timed out');
        };
        // wait for the first event to happen
        await Promise.race([
            pageLoad(),
            disconnection(),
            timeout()
        ]);
    }

    async _loadPage(client) {
        // enable domains
        const {Page, Network} = client;
        await Network.enable();
        await Page.enable();
        // register events synchronously
        const termination = new Promise((fulfill, reject) => {
            this._processEvents(client, fulfill, reject);
        });
        // start the page load
        const navigation = Page.navigate({url: this._url});
        // events will determine termination
        await Promise.all([termination, navigation]);
    }

    _processEvents(client, fulfill, reject) {
        const {info} = this;
        const {Page, Network} = client;

        Page.domContentEventFired(({timestamp}) => {
            info.domContentEventFiredMs = timestamp * 1000;
            // check termination condition
            this._checkFinished(fulfill);
        });

        Page.loadEventFired(({timestamp}) => {
            info.loadEventFiredMs = timestamp * 1000;
            // check termination condition
            this._checkFinished(fulfill);
        });

        Network.requestWillBeSent((params) => {
            const {requestId, initiator, timestamp, redirectResponse} = params;
            // skip data URI
            if (params.request.url.match('^data:')) {
                return;
            }
            // the first is the first request
            if (!info.firstRequestId && initiator.type === 'other') {
                info.firstRequestMs = timestamp * 1000;
                info.firstRequestId = requestId;
            }
            // redirect responses are delivered along the next request
            if (redirectResponse) {
                const redirectEntry = info.entries.get(requestId);
                // craft a synthetic response params
                redirectEntry.responseParams = {
                    response: redirectResponse
                };
                // set the redirect response finished when the redirect
                // request *will be sent* (this may be an approximation)
                redirectEntry.responseFinishedS = timestamp;
                redirectEntry.encodedResponseLength = redirectResponse.encodedDataLength;
                // since Chrome uses the same request id for all the
                // redirect requests, it is necessary to disambiguate
                const newId = requestId + '_redirect_' + timestamp;
                // rename the previous metadata entry
                info.entries.set(newId, redirectEntry);
                info.entries.delete(requestId);
            }
            // initialize this entry
            info.entries.set(requestId, {
                requestParams: params,
                responseParams: undefined,
                responseLength: 0, // built incrementally
                encodedResponseLength: undefined,
                responseFinishedS: undefined,
                responseBody: undefined,
                responseBodyIsBase64: undefined,
                newPriority: undefined
            });
            // check termination condition
            this._checkFinished(fulfill);
        });

        Network.dataReceived(({requestId, dataLength}) => {
            const entry = info.entries.get(requestId);
            if (!entry) {
                return;
            }
            entry.responseLength += dataLength;
        });

        Network.responseReceived((params) => {
            const entry = info.entries.get(params.requestId);
            if (!entry) {
                return;
            }
            entry.responseParams = params;
        });

        Network.resourceChangedPriority(({requestId, newPriority}) => {
            const entry = info.entries.get(requestId);
            if (!entry) {
                return;
            }
            entry.newPriority = newPriority;
        });

        Network.loadingFinished(async ({requestId, timestamp, encodedDataLength}) => {
            const entry = info.entries.get(requestId);
            if (!entry) {
                return;
            }
            entry.encodedResponseLength = encodedDataLength;
            entry.responseFinishedS = timestamp;
            // optionally fetch the entry content
            if (this._options.content) {
                try {
                    const params = await Network.getResponseBody({requestId});
                    const {body, base64Encoded} = params;
                    entry.responseBody = body;
                    entry.responseBodyIsBase64 = base64Encoded;
                } catch (err) {
                    reject(err);
                    return;
                }
            }
        });

        Network.loadingFailed(({requestId, errorText, canceled}) => {
            if (requestId === info.firstRequestId) {
                const message = errorText || canceled && 'Canceled';
                reject(new Error(message));
            }
        });
    }

    _checkFinished(fulfill) {
        const {info} = this;
        // a page is considered 'finished' when all these three messages
        // arrived: a reply to the first request, Page.domContentEventFired and
        // Page.loadEventFired
        if (info.firstRequestMs &&
            info.domContentEventFiredMs &&
            info.loadEventFiredMs) {
            fulfill();
        }
    }
}

module.exports = Page;
