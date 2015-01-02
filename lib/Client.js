var Chrome = require('chrome-remote-interface');
var events = require('events');
var util = require('util');
var common = require('./common.js');
var Page = require('./Page.js');

var CLEANUP_SCRIPT =
    'var x;' +
    'x=chrome.benchmarking.clearCache; x&&x();' +
    'x=chrome.benchmarking.clearHostResolverCache; x&&x();' +
    'x=chrome.benchmarking.clearPredictorCache; x&&x();' +
    'x=chrome.benchmarking.closeConnections; x&&x();';

var Client = function (urls, options) {
    var self = this;

    self.pages = [];

    Chrome(options, function (chrome) {
        // load the next URL or exit if done
        function loadNextURL() {
            var id = self.pages.length;
            var url = urls[id];
            if (url) {
                if (!url.match(/^http[s]?:/)) {
                    url = 'http://' + url;
                }
                var page = new Page(id, url);
                self.emit('pageStart', url);
                page.start();
                chrome.Runtime.evaluate({'expression': CLEANUP_SCRIPT}, function (error, response) {
                    // error with the communication or with the JavaScript code
                    if (error || (response && response.wasThrown)) {
                        common.dump('Cannot inject JavaScript: ' +
                                    JSON.stringify(response, null, 4));
                        self.emit('error');
                    } else {
                        chrome.Page.navigate({'url': url});
                        self.pages.push(page);
                    }
                });
            }
            return url;
        }

        // start!
        self.emit('connect');
        chrome.Page.enable();
        chrome.Network.enable();
        chrome.Network.setCacheDisabled({'cacheDisabled': true});
        loadNextURL();

        var messages = [];

        chrome.on('event', function (message) {
            messages.push(message);
            if (message.method) {
                var page = self.pages.slice(-1)[0];

                if (message.method == 'Page.domContentEventFired') {
                    common.dump('<-- ' + message.method + ': ' + page.url);
                    page.domLoaded();
                } else if (message.method == 'Page.loadEventFired') {
                    common.dump('<-- ' + message.method + ': ' + page.url);
                    page.end();
                } else if (message.method.match(/^Network./)) {
                    page.processMessage(message);
                } else {
                    common.dump('Unhandled message: ' + message.method);
                }

                // check done with current URL
                if (page.isDone()) {
                    self.emit(page.isOk() ? 'pageEnd' : 'pageError', page.url);
                    if (!loadNextURL()) {
                        common.dump("Emitting 'end' event");
                        chrome.close();
                        self.emit('end', getHAR.call(self), messages);
                    }
                }
            } else {
                common.dump('<-- #' + message.id + ' ' +
                            JSON.stringify(message.result));
            }
        });
    }).on('error', function (error) {
        common.dump("Emitting 'error' event: " + error.message);
        self.emit('error');
    });
};

util.inherits(Client, events.EventEmitter);

function getHAR() {
    var self = this;
    var har = {
        'log': {
            'version' : '1.2',
            'creator' : {
                'name': 'Chrome HAR Capturer',
                'version': '0.3.3'
            },
            'pages': [],
            'entries': []
        }
    };

    // merge pages in one HAR
    for (var i in self.pages) {
        var page = self.pages[i];
        if (page.isOk()) {
            var pageHAR = page.getHAR();
            har.log.pages.push(pageHAR.info);
            Array.prototype.push.apply(har.log.entries, pageHAR.entries);
        }
    }

    return har;
}

module.exports = Client;
