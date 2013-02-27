var events = require('events');
var util = require('util');
var http = require('http');
var WebSocket = require('ws');
var common = require('./common.js');
var Page = require('./Page.js');

var Client = function (urls, options) {
    this.urls = urls;
    this.pages = [];
    this.currentPageIndex = -1;
    this.commandId = 1;
    this._connectToChrome(options);

    // ensure that no new messages are processed after ws.close()
    this.done = false;
}

util.inherits(Client, events.EventEmitter);

Client.prototype._connectToChrome = function (options) {
    var capturer = this;

    // defaults
    var options = options || {};
    var host = options.address || 'localhost';
    var port = options.port || 9222;
    var chooseTab = options.chooseTab || function () { return 0; };

    // fetch tab list
    var options = {
        'host': host,
        'port': port,
        'path': '/json'
    };
    var request = http.get(options, function (response) {
        var data = '';
        response.on('data', function (chunk) {
            data += chunk;
        });
        response.on('end', function () {
            var url = 'http://' + host + ':' + port + '/json';
            common.dump('Connected to Chrome: ' + url);
            var tabs = JSON.parse(data);
            var tabIndex = chooseTab(tabs);
            var tabDebuggerUrl = tabs[tabIndex].webSocketDebuggerUrl;
            capturer._connectToWebSocket(tabDebuggerUrl);
        });
    })
    request.on('error', function (error) {
        common.dump("Emitting 'error' event: " + error.message);
        capturer.emit('error');
    });
}

Client.prototype._connectToWebSocket = function (url) {
    var capturer = this;
    this.ws = new WebSocket(url);
    this.ws.on('open', function () {
        common.dump('Connected to WebSocket: ' + url);
        capturer._sendDebuggerCommand('Page.enable');
        capturer._sendDebuggerCommand('Network.enable');
        capturer._sendDebuggerCommand('Network.setCacheDisabled',
                                      {'cacheDisabled': true});

        // start!
        capturer._loadNextURL();
    });
    this.ws.on('message', function (data) {
        var message = JSON.parse(data);
        if (message.method && !capturer.done) {
            var page = capturer.pages[capturer.currentPageIndex];

            // done with current URL
            if (message.method == 'Page.domContentEventFired') {
                common.dump('<-- ' + message.method + ': ' + page.url);
                page.domLoaded();
            } else if (message.method == 'Page.loadEventFired') {
                common.dump('<-- ' + message.method + ': ' + page.url);
                page.end();
                capturer.emit(page.isOk() ? 'pageEnd' : 'pageError', page.url);
                if (!capturer._loadNextURL()) {
                    common.dump("Emitting 'end' event");
                    capturer.ws.close();
                    capturer.emit('end', capturer._getHAR());
                    capturer.done = true;
                }
            } else if (message.method.match(/^Network./)) {
                page.processMessage(message);
            } else {
                common.dump('Unhandled message: ' + message.method);
            }
        } else {
	    common.dump('<-- #' + message.id + ' ' +
			JSON.stringify(message.result));
	}
    });
}

Client.prototype._cleanupBrowserStatus = function () {
    var script =
        'chrome.benchmarking.closeConnections();' +
        'chrome.benchmarking.clearHostResolverCache();';
    this._sendDebuggerCommand('Runtime.evaluate', {'expression': script});
}

Client.prototype._loadNextURL = function () {
    var id = ++this.currentPageIndex;
    var url = this.urls[id];
    if (url) {
        var page = new Page(id, url);
        this.emit('pageStart', url);
        page.start();
        this._cleanupBrowserStatus();
        this._sendDebuggerCommand('Page.navigate', {'url': url});
        this.pages.push(page);
    }
    return url;
}

Client.prototype._getHAR = function () {
    var har = {
        'log': {
            'version' : '1.2',
            'creator' : {
                'name': 'Chrome HAR Capturer',
                'version': '0.2.0'
            },
            'pages': [],
            'entries': []
        }
    };

    // merge pages in one HAR
    for (var i in this.pages) {
        var page = this.pages[i];
        if (page.isOk()) {
            var pageHAR = page.getHAR();
            har.log.pages.push(pageHAR.info);
            Array.prototype.push.apply(har.log.entries, pageHAR.entries);
        }
    }

    return har;
}

Client.prototype._sendDebuggerCommand = function (method, params) {
    common.dump('--> #' + this.commandId + ' ' +
		method + ' ' + (JSON.stringify(params) || ''));
    this.ws.send(
        JSON.stringify({
            'id': this.commandId++,
            'method': method,
            'params': params
        })
    );
}

module.exports = Client;
