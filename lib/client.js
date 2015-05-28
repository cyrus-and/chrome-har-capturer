var events = require('events');
var util = require('util');
var Chrome = require('chrome-remote-interface');
var common = require('./common.js');
var Page = require('./page.js');
var har = require('./har.js');

var NEUTRAL_URL = 'about:blank';

var CLEANUP_SCRIPT =
    'chrome.benchmarking.clearCache();' +
    'chrome.benchmarking.clearHostResolverCache();' +
    'chrome.benchmarking.clearPredictorCache();' +
    'chrome.benchmarking.closeConnections();';

var PAGE_DELAY = 10000;

function Client(urls, options) {
    var self = this;
    var pages = [];
    options = options || {};
    // start the instrumentation
    Chrome(options, function (chrome) {
        function loadUrl(index) {
            if (index < urls.length) {
                var url = urls[index];
                var page = new Page(index, url, chrome, options.fetchContent);
                pages[index] = page;
                // load a neutral page before the user provided URL since
                // there's no way to stop pending loadings using the protocol
                chrome.Page.navigate({'url': NEUTRAL_URL}, function (error, response) {
                    if (error) {
                        // probably never emitted...
                        self.emit('error', new Error('Cannot load URL'));
                        chrome.close();
                    }
                });
                // wait its completion before starting with the next user-defined URL
                var neutralFrameid;

                function endLoadUrlAfterTimeout(value) {
                    chrome.removeAllListeners('event');
                    loadUrl(value);
                }
                //Function to end the current page load
                function endLoadUrl(){
                    common.dump('--- End: ' + url);
                    self.emit(page.isFailed() ? 'pageError' : 'pageEnd', url);
                    // start the next URL after a certain delay
                    // so to "purge" any spurious requests
                    setTimeout(function () {
                        endLoadUrlAfterTimeout(index + 1);
                    }, PAGE_DELAY);
                }

                chrome.on('event', function (message) {
                    switch (message.method) {
                    case 'Page.frameNavigated':
                        // save the frame id of the neutral URL
                        var frame = message.params.frame;
                        if (frame.url === NEUTRAL_URL) {
                            neutralFrameid = frame.id;
                        }
                        break;
                    case 'Page.frameStoppedLoading':
                        // load the next URL when done
                        if (message.params.frameId === neutralFrameid) {
                            chrome.removeAllListeners('event');
                            // inject the JavaScript code and load this URL
                            common.dump('--- Start: ' + url);
                            self.emit('pageStart', url);
                            chrome.Runtime.evaluate({'expression': CLEANUP_SCRIPT}, function (error, response) {
                                // error with the communication or with the JavaScript code
                                if (error || (response && response.wasThrown)) {
                                    var errorDetails = JSON.stringify(response, null, 4);
                                    var errorMessage = 'Cannot inject JavaScript: ' + errorDetails;
                                    common.dump(errorMessage);
                                    self.emit('error', new Error(errorMessage));
                                    chrome.close();
                                } else {
                                    chrome.Page.navigate({'url': url}, function (error, response) {
                                        if (error) {
                                            self.emit('error', new Error('Cannot load URL'));
                                            chrome.close();
                                        }
                                    });
                                }
                            });
                            // then process events
                            chrome.on('event', function (message) {
                                page.processMessage(message);
                                // check if done with the current URL
                                if (page.isFinished()) {
                                    common.dump('--- End: ' + url);
                                    self.emit(page.isFailed() ? 'pageError' : 'pageEnd', url);
                                    endLoadUrl();
                                }
                            });
                        }
                        break;
                    }
                });
            } else {
                // no more URLs to process
                chrome.close();
                self.emit('end', har.create(pages));
            }
        }
        self.emit('connect');
        // preliminary global setup
        chrome.Page.enable();
        chrome.Network.enable();
        chrome.Network.setCacheDisabled({'cacheDisabled': true});
        // start!
        chrome.once('ready', function () {
            loadUrl(0);
        });
    }).on('error', function (err) {
        common.dump("Emitting 'error' event: " + err.message);
        self.emit('error', err);
    });
}

util.inherits(Client, events.EventEmitter);

module.exports = Client;
