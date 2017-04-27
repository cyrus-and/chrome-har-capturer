'use strict';

const CDP = require('chrome-remote-interface');

const BROWSER_TARGET = '/devtools/browser';
const VOID_URL = 'about:blank';

function findTargetById(id) {
    return (targets) => {
        return targets.find((target) => target.id === id);
    };
}

class Context {
    constructor(options) {
        this._cleanup = [];
        this._options = options;
    }

    async create() {
        const {host, port} = this._options;
        // connect to the browser target
        const browser = await CDP({
            host, port,
            target: BROWSER_TARGET
        });
        this._cleanup.unshift(async () => {
            await browser.close();
        });
        // request a new browser context
        const {Target} = browser;
        const {browserContextId} = await Target.createBrowserContext();
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
        // connect to the tab and return the handler
        const tab = await CDP({
            host, port,
            target: findTargetById(targetId)
        });
        this._cleanup.unshift(async () => {
            await tab.close();
        });
        return tab;
    }

    async destroy() {
        // run cleanup handlers
        for (const handler of this._cleanup) {
            await handler();
        }
    }
}

module.exports = Context;
