var url = require('url');
var npmPackage = require('../package.json');

module.exports.create = function (pages) {
    var har = {
        'log': {
            'version': '1.2',
            'creator': {
                'name': 'Chrome HAR Capturer',
                'version': npmPackage.version,
            },
            'pages': [],
            'entries': []
        }
    };
    pages.forEach(function (page) {
        if (!page.isFailed()) {
            var pageHar = fromPage(page);
            har.log.pages.push(pageHar.info);
            Array.prototype.push.apply(har.log.entries, pageHar.entries);
        }
    });
    return har;
};

function fromPage(page) {
    // page timings
    var startedDateTime = new Date(page.originalRequestMs).toISOString();
    var onContentLoad = page.domContentEventFiredMs - page.originalRequestMs;
    var onLoad = page.loadEventFiredMs - page.originalRequestMs;
    // entries
    var entries = [];
    for (var requestId in page.objects) {
        var object = page.objects[requestId];
        // skip incomplete entries, those that have no timing information (since
        // it's optional) or data URI requests
        if (!object.responseMessage || !object.responseFinishedMs ||
            !object.responseMessage.response.timing ||
            object.requestMessage.request.url.match('^data:')) {
            continue;
        }
        // check for redirections
        var redirectUrl = '';
        if (object.requestMessage.redirectResponse) {
            redirectUrl = object.requestMessage.redirectResponse.url;
        }
        // process headers
        var requestHeaders = convertHeaders(object.requestMessage.request.headers);
        var responseHeaders = convertHeaders(object.responseMessage.response.headers);
        // add status line length (12 = "HTTP/1.x" + "  " + "\r\n")
        requestHeaders.size += (object.requestMessage.request.method.length +
                                object.requestMessage.request.url.length + 12);
        responseHeaders.size += (object.responseMessage.response.status.toString().length +
                                 object.responseMessage.response.statusText.length + 12);
        // query string
        var queryString = convertQueryString(object.requestMessage.request.url);
        // object timings
        // - timing.requestTime: seconds
        // - timing.*Start/End: milliseconds from the above
        var timing = object.responseMessage.response.timing;
        if (!timing.requestInMs) {
            timing.requestTime *= 1000; // to ms
            timing.requestInMs = true;
        }
        var dnsTime = timingDelta(timing.dnsStart, timing.dnsEnd);
        var connectTime = timingDelta(timing.connectStart, timing.connectEnd);
        var proxyTime = timingDelta(timing.proxyStart, timing.proxyEnd);
        var sendTime = timingDelta(timing.sendStart, timing.sendEnd);
        var sslTime = timingDelta(timing.sslStart, timing.sslEnd);
        // computed timings
        var waitTime = timing.receiveHeadersEnd - timing.sendEnd;
        var receiveTime = object.responseFinishedMs - (timing.requestTime + timing.receiveHeadersEnd);
        var totalTime = dnsTime + connectTime + sendTime + waitTime + receiveTime + sslTime;
        // connection information
        var serverIPAddress = object.responseMessage.response.remoteIPAddress;
        var connection = object.responseMessage.response.connectionId;
        // fill entry
        entries.push({
            'pageref': page.id.toString(),
            'startedDateTime': new Date(timing.requestTime).toISOString(),
            'time': totalTime,
            'request': {
                'method': object.requestMessage.request.method,
                'url': object.requestMessage.request.url,
                'httpVersion': 'HTTP/1.1', // TODO
                'cookies': [], // TODO
                'headers': requestHeaders.pairs,
                'queryString': queryString,
                'headersSize': requestHeaders.size,
                'bodySize': object.requestMessage.request.headers['Content-Length'] || -1,
            },
            'response': {
                'status': object.responseMessage.response.status,
                'statusText': object.responseMessage.response.statusText,
                'httpVersion': 'HTTP/1.1', // TODO
                'cookies': [], // TODO
                'headers': responseHeaders.pairs,
                'redirectURL': redirectUrl,
                'headersSize': responseHeaders.size,
                'bodySize': object.encodedResponseLength,
                'content': {
                    'size': object.responseLength,
                    'mimeType': object.responseMessage.response.mimeType,
                    'compression': object.responseLength - object.encodedResponseLength, // TODO sometimes negative
                    'text': object.responseBody,
                    'encoding': object.responseBodyIsBase64 ? 'base64' : undefined,
                }
            },
            'cache': {},
            'timings': {
                'blocked': -1, // TODO
                'dns': dnsTime,
                'connect': object.responseMessage.response.connectionReused ? -1 : connectTime,
                'send': sendTime,
                'wait': waitTime,
                'receive': receiveTime,
                'ssl': sslTime
            },
            'serverIPAddress': serverIPAddress,
            'connection': connection.toString()
        });
    }
    // outcome
    return {
        'info': {
            'startedDateTime': startedDateTime,
            'id': page.id.toString(),
            'title': page.url,
            'pageTimings': {
                'onContentLoad': onContentLoad,
                'onLoad': onLoad
            }
        },
        'entries': entries
    };
}

function timingDelta(start, end) {
    return start != -1 && end != -1 ? (end - start) : 0;
}

function convertQueryString(fullUrl) {
    var query = url.parse(fullUrl, true).query;
    var pairs = [];
    for (var name in query) {
        var value = query[name];
        pairs.push({'name': name, 'value': value.toString()});
    }
    return pairs;
}

function convertHeaders(headers) {
    headersObject = {'pairs': [], 'size': undefined};
    if (Object.keys(headers).length) {
        headersObject.size = 2; // trailing "\r\n"
        for (var name in headers) {
            var value = headers[name];
            headersObject.pairs.push({'name': name, 'value': value});
            headersObject.size += name.length + value.length + 4; // ": " + "\r\n"
        }
    }
    return headersObject;
}
