var common = require('./common');

function Page(id, url) {
    var self = this;
    self.id = id;
    self.url = url;
    self.failed = false;
    self.originalRequestId = undefined;
    self.originalRequestMs = undefined;
    self.domContentEventFiredMs = undefined;
    self.loadEventFiredMs = undefined;
    self.objects = {};
}

Page.prototype.isFinished = function () {
    var self = this;
    // a page is considered "finished" either when is failed or when all these
    // three messages arrived: a reply to the original request,
    // Page.domContentEventFired and Page.loadEventFired
    return self.failed || (typeof self.originalRequestMs !== 'undefined' &&
                           typeof self.domContentEventFiredMs !== 'undefined' &&
                           typeof self.loadEventFiredMs !== 'undefined');
};

Page.prototype.isFailed = function () {
    var self = this;
    return self.failed;
};

Page.prototype.processMessage = function (message) {
    var self = this;
    var id;
    switch (message.method) {
    case 'Page.domContentEventFired':
        self.domContentEventFiredMs = message.params.timestamp * 1000;
        break;
    case 'Page.loadEventFired':
        self.loadEventFiredMs = message.params.timestamp * 1000;
        break;
    default:
        if (message.method.match(/^Network\./)) {
            id = message.params.requestId;
            switch (message.method) {
            case 'Network.requestWillBeSent':
                // the first is the original request
                if (typeof self.originalRequestId === 'undefined' &&
                    message.params.initiator.type === 'other') {
                    self.originalRequestMs = message.params.timestamp * 1000;
                    self.originalRequestId = id;
                }
                self.objects[id] = {
                    'requestMessage': message.params,
                    'responseMessage': undefined,
                    'responseLength': 0,
                    'encodedResponseLength': 0,
                    'responseFinishedMs': undefined
                };
                break;
            case 'Network.dataReceived':
                if (id in self.objects) {
                    self.objects[id].responseLength += message.params.dataLength;
                    self.objects[id].encodedResponseLength += message.params.encodedDataLength;
                }
                break;
            case 'Network.responseReceived':
                if (id in self.objects) {
                    self.objects[id].responseMessage = message.params;
                }
                break;
            case 'Network.loadingFinished':
                if (id in this.objects) {
                    this.objects[id].responseFinishedMs = message.params.timestamp * 1000;
                }
                break;
            case 'Network.loadingFailed':
                // failure of the original request aborts the whole page
                if (id === self.originalRequestId) {
                    self.failed = true;
                }
                break;
            }
        }
    }
    // verbose dump
    if (typeof id === 'undefined') {
        common.dump('<-- ' + message.method + ': ' + self.url);
    } else {
        common.dump('<-- ' + '[' + id + '] ' + message.method);
    }
};

module.exports = Page;
