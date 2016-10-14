var common = require('./common');

function Page(id, url, chrome, fetchContent) {
    var self = this;
    self.id = id;
    self.url = url;
    self.chrome = chrome;
    self.fetchContent = fetchContent;
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

Page.prototype.markAsFailed = function () {
    var self = this;
    self.failed = true;
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
                // redirect responses are delivered along the next request
                if (message.params.redirectResponse) {
                    // craft a synthetic response message
                    self.objects[id].responseMessage = {
                        // TODO simulate message response
                        'response': message.params.redirectResponse
                    };
                    // set the redirect response finished when the redirect
                    // request *will be sent* (this may be an approximation)
                    self.objects[id].responseFinished = message.params.timestamp;
                    // since Chrome uses the same request id for all the
                    // redirect requests, it is necessary to disambiguate
                    var newId = id + '_redirect_' + message.params.timestamp;
                    // rename the previous metadata object
                    self.objects[newId] = self.objects[id];
                    delete self.objects[id];
                }
                // initialize this metadata object
                self.objects[id] = {
                    'requestMessage': message.params,
                    'responseMessage': undefined,
                    'responseLength': 0,
                    'encodedResponseLength': 0,
                    'responseFinished': undefined,
                    'responseBody': undefined,
                    'responseBodyIsBase64': undefined
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
            case 'Network.resourceChangedPriority':
                if (id in self.objects) {
                    self.objects[id].changedPriority = message.params;
                }
                break;
            case 'Network.loadingFinished':
                if (id in this.objects) {
                    this.objects[id].responseFinished = message.params.timestamp;
                    // asynchronously fetch the request body (no check is
                    // performed to really ensure that the fetching is over
                    // before finishing this page processing because there is
                    // the PAGE_DELAY timeout anyway; it should not be a problem...)
                    if (self.fetchContent) {
                        self.chrome.Network.getResponseBody({'requestId': id}, function (error, response) {
                            if (!error) {
                                self.objects[id].responseBody = response.body;
                                self.objects[id].responseBodyIsBase64 = response.base64Encoded;
                            }
                        });
                    }
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
