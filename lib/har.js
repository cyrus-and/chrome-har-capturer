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
    var wallTime = page.objects[page.originalRequestId].requestMessage.wallTime;
    var startedDateTime = new Date(wallTime * 1000).toISOString();
    var onContentLoad = page.domContentEventFiredMs - page.originalRequestMs;
    var onLoad = page.loadEventFiredMs - page.originalRequestMs;
    // entries
    var entries = [];
    for (var requestId in page.objects) {
        var object = page.objects[requestId];
        // skip incomplete entries, those that have no timing information (since
        // it's optional) or data URI requests
        if (!object.responseMessage || !object.responseFinished ||
            !object.responseMessage.response.timing ||
            object.requestMessage.request.url.match('^data:')) {
            continue;
        }
        // check for redirections
        var redirectUrl = '';
        if (object.requestMessage.redirectResponse) {
            redirectUrl = object.requestMessage.redirectResponse.url;
        }
        // HTTP version or protocol name (e.g., quic)
        var protocol = object.responseMessage.response.protocol || 'unknown';
        // process headers
        var requestHeaders = convertHeaders(
            object.responseMessage.response.requestHeaders ||
            object.requestMessage.request.headers);
        var responseHeaders = convertHeaders(object.responseMessage.response.headers);
        // estimaate the header size according to the protocol
        if (protocol.match(/http\/[01].[01]/)) {
            // add status line length (12 = "HTTP/1.x" + "  " + "\r\n")
            requestHeaders.size += (object.requestMessage.request.method.length +
                                    object.requestMessage.request.url.length + 12);
            responseHeaders.size += (object.responseMessage.response.status.toString().length +
                                     object.responseMessage.response.statusText.length + 12);
        } else {
            // information not available due to possible compression newer
            // versions of HTTP
            requestHeaders.size = -1;
            responseHeaders.size = -1;
        }
        // query string
        var queryString = convertQueryString(object.requestMessage.request.url);
        // object timings
        // https://chromium.googlesource.com/chromium/blink.git/+/master/Source/devtools/front_end/sdk/HAREntry.js
        var timing = object.responseMessage.response.timing;
        var duration = object.responseFinished - timing.requestTime;
        var blockedTime = firstNonNegative([timing.dnsStart, timing.connectStart, timing.sendStart]);
        var dnsTime = -1;
        if (timing.dnsStart >= 0) {
            dnsTime = firstNonNegative([timing.connectStart, timing.sendStart]) - timing.dnsStart;
        }
        var connectTime = -1;
        if (timing.connectStart >= 0) {
            connectTime = timing.sendStart - timing.connectStart;
        }
        var sendTime = timing.sendEnd - timing.sendStart;
        var waitTime = timing.receiveHeadersEnd - timing.sendEnd;
        var receiveTime = toMilliseconds(duration) - timing.receiveHeadersEnd;
        var sslTime = -1;
        if (timing.sslStart >= 0 && timing.sslEnd >= 0) {
            sslTime = timing.sslEnd - timing.sslStart;
        }

        // priority
        var initialPriority = object.requestMessage.request.initialPriority;
        var updatedPriority = object.changedPriority && object.changedPriority.newPriority;

        // connection information
        var serverIPAddress = object.responseMessage.response.remoteIPAddress;
        var connection = object.responseMessage.response.connectionId;
        // sizes
        var bodySize = responseHeaders.size === -1 ? -1 :
            object.encodedResponseLength - responseHeaders.size;
        var compression = bodySize === -1 ? undefined :
            object.responseLength - bodySize;
        // fill entry
        entries.push({
            'pageref': page.id.toString(),
            'startedDateTime': new Date(object.requestMessage.wallTime * 1000).toISOString(),
            'time': toMilliseconds(duration),
            'request': {
                'method': object.requestMessage.request.method,
                'url': object.requestMessage.request.url,
                'httpVersion': protocol,
                '_priority': updatedPriority || initialPriority,
                'cookies': [], // TODO
                'headers': requestHeaders.pairs,
                'queryString': queryString,
                'headersSize': requestHeaders.size,
                'bodySize': object.requestMessage.request.headers['Content-Length'] || -1,
            },
            'response': {
                'status': object.responseMessage.response.status,
                'statusText': object.responseMessage.response.statusText,
                'httpVersion': protocol,
                'cookies': [], // TODO
                'headers': responseHeaders.pairs,
                'redirectURL': redirectUrl,
                'headersSize': responseHeaders.size,
                'bodySize': bodySize,
                '_transferSize': object.encodedResponseLength,
                'content': {
                    'size': object.responseLength,
                    'mimeType': object.responseMessage.response.mimeType,
                    'compression': compression,
                    'text': object.responseBody,
                    'encoding': object.responseBodyIsBase64 ? 'base64' : undefined,
                }
            },
            'cache': {},
            'timings': {
                'blocked': blockedTime,
                'dns': dnsTime,
                'connect': connectTime,
                'send': sendTime,
                'wait': waitTime,
                'receive': receiveTime,
                'ssl': sslTime
            },
            'serverIPAddress': serverIPAddress,
            'connection': connection.toString(),
            '_initiator': object.requestMessage.initiator
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

function firstNonNegative(values) {
    for (var i = 0; i < values.length; i++) {
        if (values[i] >= 0) {
            return values[i];
        }
    }

    return -1;
}

function toMilliseconds(time) {
    return time === -1 ? -1 : time * 1000;
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
