'use strict';

const url = require('url');
const querystring = require('querystring');

function create(pages) {
    // HAR template
    const packageInfo = require('../package');
    const har = {
        log: {
            version: '1.2',
            creator: {
                name: 'Chrome HAR Capturer',
                version: packageInfo.version,
                comment: packageInfo.homepage
            },
            pages: [],
            entries: []
        }
    };
    // fill the HAR template each page info
    for (const [pageIndex, stats] of pages.entries()) {
        const pageId = `page_${pageIndex + 1}_${String(Math.random()).slice(2)}`;
        const log = parsePage(String(pageId), stats);
        har.log.pages.push(log.page);
        har.log.entries.push(...log.entries);
    }
    return har;
}

function parsePage(pageId, stats) {
    // page load started at
    const firstRequest = stats.entries.get(stats.firstRequestId).requestParams;
    const wallTimeMs = firstRequest.wallTime * 1000;
    const startedDateTime = new Date(wallTimeMs).toISOString();
    // page timings
    const onContentLoad = stats.domContentEventFiredMs - stats.firstRequestMs;
    const onLoad = stats.loadEventFiredMs - stats.firstRequestMs;
    // process this page load entries
    const entries = [...stats.entries.values()]
          .map((entry) => parseEntry(pageId, entry))
          .filter((entry) => entry);
    // outcome
    return {
        page: {
            id: pageId,
            title: stats.url,
            startedDateTime,
            pageTimings: {
                onContentLoad,
                onLoad
            },
            _user: stats.user
        },
        entries
    };
}

function parseEntry(pageref, entry) {
    // skip requests without response (requestParams is always present)
    if (!entry.responseParams ||
        !entry.responseFinishedS && !entry.responseFailedS) {
        return null;
    }
    // skip entries without timing information (doc says optional)
    if (!entry.responseParams.response.timing) {
        return null;
    }
    // extract common fields
    const {request} = entry.requestParams;
    const {response} = entry.responseParams;
    // entry started
    const wallTimeMs = entry.requestParams.wallTime * 1000;
    const startedDateTime = new Date(wallTimeMs).toISOString();
    // HTTP version or protocol name (e.g., quic)
    const httpVersion = response.protocol || 'unknown';
    // request/response status
    const {method, url} = request;
    const {status, statusText} = response;
    // parse and measure headers
    const headers = parseHeaders(httpVersion, request, response);
    // check for redirections
    const redirectURL = getHeaderValue(response.headers, 'location', '');
    // parse query string
    const queryString = parseQueryString(request.url);
    // parse post data
    const postData = parsePostData(request, headers);
    // compute entry timings
    const {time, timings} = computeTimings(entry);
    // fetch connection information (strip IPv6 [...])
    let serverIPAddress = response.remoteIPAddress;
    if (serverIPAddress) {
        serverIPAddress = serverIPAddress.replace(/^\[(.*)\]$/, '$1');
    }
    const connection = String(response.connectionId);
    // fetch entry initiator
    const _initiator = entry.requestParams.initiator;
    // fetch  resource priority
    const {changedPriority} = entry;
    const newPriority = changedPriority && changedPriority.newPriority;
    const _priority = newPriority || request.initialPriority;
    // parse and measure payloads
    const payload = computePayload(entry, headers);
    const {mimeType} = response;
    const encoding = entry.responseBodyIsBase64 ? 'base64' : undefined;
    // fill entry
    return {
        pageref,
        startedDateTime,
        time,
        request: {
            method,
            url,
            httpVersion,
            cookies: [], // TODO
            headers: headers.request.pairs,
            queryString,
            headersSize: headers.request.size,
            bodySize: payload.request.bodySize,
            postData
        },
        response: {
            status,
            statusText,
            httpVersion,
            cookies: [], // TODO
            headers: headers.response.pairs,
            redirectURL,
            headersSize: headers.response.size,
            bodySize: payload.response.bodySize,
            _transferSize: payload.response.transferSize,
            content: {
                size: entry.responseLength,
                mimeType,
                compression: payload.response.compression,
                text: entry.responseBody,
                encoding
            }
        },
        cache: {},
        _fromDiskCache: response.fromDiskCache,
        timings,
        serverIPAddress,
        connection,
        _initiator,
        _priority
    };
}

function parseHeaders(httpVersion, request, response) {
    // convert headers from map to pairs
    const requestHeaders = response.requestHeaders || request.headers;
    const responseHeaders = response.headers;
    const headers = {
        request: {
            map: requestHeaders,
            pairs: zipNameValue(requestHeaders),
            size: -1
        },
        response: {
            map: responseHeaders,
            pairs: zipNameValue(responseHeaders),
            size: -1
        }
    };
    // estimate the header size (including HTTP status line) according to the
    // protocol (this information not available due to possible compression in
    // newer versions of HTTP)
    if (httpVersion.match(/^http\/[01].[01]$/)) {
        const requestText = getRawRequest(request, headers.request.pairs);
        const responseText = getRawResponse(response, headers.response.pairs);
        headers.request.size = requestText.length;
        headers.response.size = responseText.length;
    }
    return headers;
}

function computeTimings(entry) {
    // https://chromium.googlesource.com/chromium/blink.git/+/master/Source/devtools/front_end/sdk/HAREntry.js
    // fetch the original timing object and compute duration
    const timing = entry.responseParams.response.timing;
    const finishedTimestamp = entry.responseFinishedS || entry.responseFailedS;
    const time = toMilliseconds(finishedTimestamp - timing.requestTime);
    // compute individual components
    const blocked = firstNonNegative([
        timing.dnsStart, timing.connectStart, timing.sendStart
    ]);
    let dns = -1;
    if (timing.dnsStart >= 0) {
        const start = firstNonNegative([timing.connectStart, timing.sendStart]);
        dns = start - timing.dnsStart;
    }
    let connect = -1;
    if (timing.connectStart >= 0) {
        connect = timing.sendStart - timing.connectStart;
    }
    const send = timing.sendEnd - timing.sendStart;
    const wait = timing.receiveHeadersEnd - timing.sendEnd;
    const receive = time - timing.receiveHeadersEnd;
    let ssl = -1;
    if (timing.sslStart >= 0 && timing.sslEnd >= 0) {
        ssl = timing.sslEnd - timing.sslStart;
    }
    return {
        time,
        timings: {blocked, dns, connect, send, wait, receive, ssl}
    };
}

function computePayload(entry, headers) {
    // From Chrome:
    //  - responseHeaders.size: size of the headers if available (otherwise
    //    -1, e.g., HTTP/2)
    //  - entry.responseLength: actual *decoded* body size
    //  - entry.encodedResponseLength: total on-the-wire data
    //
    // To HAR:
    //  - headersSize: size of the headers if available (otherwise -1, e.g.,
    //    HTTP/2)
    //  - bodySize: *encoded* body size
    //  - _transferSize: total on-the-wire data
    //  - content.size: *decoded* body size
    //  - content.compression: *decoded* body size - *encoded* body size
    let bodySize;
    let compression;
    let transferSize = entry.encodedResponseLength;
    if (headers.response.size === -1) {
        // if the headers size is not available (e.g., newer versions of
        // HTTP) then there is no way (?) to figure out the encoded body
        // size (see #27)
        bodySize = -1;
        compression = undefined;
    } else if (entry.responseFailedS) {
        // for failed requests (`Network.loadingFailed`) the transferSize is
        // just the header size, since that evend does not hold the
        // `encodedDataLength` field, this is performed manually (however this
        // cannot be done for HTTP/2 which is handled by the above if)
        bodySize = 0;
        compression = 0;
        transferSize = headers.response.size;
    } else {
        // otherwise the encoded body size can be obtained as follows
        bodySize = entry.encodedResponseLength - headers.response.size;
        compression = entry.responseLength - bodySize;
    }
    return {
        request: {
            // trivial case for request
            bodySize: parseInt(getHeaderValue(headers.request.map, 'content-length', -1), 10)
        },
        response: {
            bodySize,
            transferSize,
            compression
        }
    };
}

function zipNameValue(map) {
    const pairs = [];
    for (const [name, value] of Object.entries(map)) {
        // insert multiple pairs if the key is repeated
        const values = Array.isArray(value) ? value : [value];
        for (const value of values) {
            pairs.push({name, value});
        }
    }
    return pairs;
}

function getRawRequest(request, headerPairs) {
    const {method, url, protocol} = request;
    const lines = [`${method} ${url} ${protocol}`];
    for (const {name, value} of headerPairs) {
        lines.push(`${name}: ${value}`);
    }
    lines.push('', '');
    return lines.join('\r\n');
}

function getRawResponse(response, headerPairs) {
    const {status, statusText, protocol} = response;
    const lines = [`${protocol} ${status} ${statusText}`];
    for (const {name, value} of headerPairs) {
        lines.push(`${name}: ${value}`);
    }
    lines.push('', '');
    return lines.join('\r\n');
}

function getHeaderValue(headers, name, fallback) {
    const pattern = new RegExp(`^${name}$`, 'i');
    const key = Object.keys(headers).find((name) => {
        return name.match(pattern);
    });
    return key === undefined ? fallback : headers[key];
}

function parseQueryString(requestUrl) {
    const {query} = url.parse(requestUrl, true);
    const pairs = zipNameValue(query);
    return pairs;
}

function parsePostData(request, headers) {
    const {postData} = request;
    if (!postData) {
        return undefined;
    }
    const mimeType = getHeaderValue(headers.request.map, 'content-type');
    const params = (mimeType === 'application/x-www-form-urlencoded'
                    ? zipNameValue(querystring.parse(postData)) : []);
    return {
        mimeType,
        params,
        text: postData
    };
}

function firstNonNegative(values) {
    const value = values.find((value) => value >= 0);
    return value === undefined ? -1 : value;
}

function toMilliseconds(time) {
    return time === -1 ? -1 : time * 1000;
}

module.exports = {create};
