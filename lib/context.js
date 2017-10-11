'use strict';

const CDP = require('chrome-remote-interface');

const BROWSER_TARGET = '/devtools/browser';
const VOID_URL = 'about:blank';

class Context {
    constructor(options) {
        this._cleanup = [];
        this._options = options;
    }

    async create() {
        const {host, port} = this._options;
        // fetch the browser version (since Chrome 62 the browser target URL is
        // generated at runtime and can be obtained via the '/json/version'
        // endpoint, fallback to '/devtools/browser' if not present)
        const {webSocketDebuggerUrl} = await CDP.Version({host, port});
        // connect to the browser target
        const browser = await CDP({
            host, port,
            target: webSocketDebuggerUrl || BROWSER_TARGET
        });
        this._cleanup.unshift(async () => {
            await browser.close();
        });
        // request a new browser context
        const {Target} = browser;
        try {
            const {browserContextId, error} = await Target.createBrowserContext();
            this._cleanup.unshift(async () => {
                await Target.disposeBrowserContext({browserContextId});
            });
            // create a new empty tab
            const {width, height} = this._options;
            const {targetId} = await Target.createTarget({
                url: VOID_URL,
                width, height,
                browserContextId
            });
            this._cleanup.unshift(async () => {
                await Target.closeTarget({targetId});
            });

            const tab = await CDP({
                host, port,
                target: targetId
            });

            this._cleanup.unshift(async () => {
                await tab.close();
            });

            // This seems not working in hidden windows - sadly
            await CDP.Activate({id: targetId, host, port});
            await tab.Target.activateTarget({targetId: targetId});

            // connect to the tab and return the handler
            return tab;
        } catch (e) {
            // Not Supported - We are using non headless browser!
            if (e.response.code === -32000) {
                // Create new tab
                const {id} = await CDP.New({host, port});

                // Set clean up
                this._cleanup.unshift(async () => {
                    await CDP.Close({id: id, host, port});
                });

                // Connec to the tab
                const tab = await CDP({
                    host, port,
                    target: id
                });

                await CDP.Activate({id: id, host, port});

                return tab;
            }
            // If not ours - rethrow
            throw e;
        }

        throw new Error('Unsupported Error from Remote Browser', -32001);
    }

    async destroy() {
        // run cleanup handlers
        for (const handler of this._cleanup) {
            await handler();
        }
    }
}

module.exports = Context;
