'use strict';

const {checkedRun, testServerHandler} = require('./util');

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const http2 = require('../node_modules/http2');

function runTestSuite(name, protocol, server) {
    const port = 8000;
    const baseUrl = `${protocol}://localhost:${port}`;
    before('Start web server', (done) => {
        server.on('request', testServerHandler);
        server.listen(port, done);
    });
    after('Stop web server', (done) => {
        server.close(done);
    });
    describe('Misc', () => {
        it('Properly handle repeated keys in query strings', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/get?a=1&b=2&a=1`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    assert.strictEqual(har.log.entries[0].request.queryString.length, 3, 'query string');
                }
            });
        });
        it('Parse application/x-www-form-urlencoded POST', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/generate_post?type=application/x-www-form-urlencode&graceTime=500`
                ],
                graceTime: 1000,
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 2, 'entries');
                    const {postData} = har.log.entries[1].request;
                    assert.strictEqual(postData.mimeType, 'application/x-www-form-urlencoded', 'mimeType');
                    assert.deepEqual(postData.params, [{name: 'name', value: 'value'}], 'params');
                }
            });
        });
        it('Parse multipart/form-data POST', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/generate_post?type=multipart/form-data&graceTime=500`
                ],
                graceTime: 1000,
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 2, 'entries');
                    const {postData} = har.log.entries[1].request;
                    assert(postData.mimeType.startsWith('multipart/form-data', 'mimeType'));
                    assert.deepEqual(postData.params, [], 'params');
                }
            });
        });
        it('Return the response body', (done) => {
            const size = 1000000;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/data?size=${size}`
                ],
                options: {
                    content: true
                },
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    assert.strictEqual(har.log.entries[0].response.content.text, Buffer.alloc(size, 'x').toString(), 'content');
                }
            });
        }).timeout(0); // disable for this one
    });
    describe('Sizes', () => {
        it('Properly measure fixed-size responses', (done) => {
            const size = 1000;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/data?size=${size}`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[0].response;
                    assert.strictEqual(content.size, size, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // larger due to headers
                        assert(_transferSize > size, 'transfer size');
                    } else {
                        assert.strictEqual(bodySize, size, 'body size');
                        assert.strictEqual(content.compression, content.size - bodySize, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure chunked responses', (done) => {
            const size = 1000;
            const chunks = 10;
            const total = size * chunks;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/data?size=${size}&chunks=${chunks}`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[0].response;
                    assert.strictEqual(content.size, total, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // larger due to headers and chunked encoding overhead
                        assert(_transferSize > total, 'transfer size');
                    } else {
                        // larger encoded size due to chunked encoding overhead
                        assert(bodySize > total, 'body size');
                        assert.strictEqual(content.compression, content.size - bodySize, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure fixed-size compressed responses', (done) => {
            const size = 1000;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/data?size=${size}&gzip=true`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[0].response;
                    assert.strictEqual(content.size, size, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // smaller due to compression (despite headers)
                        assert(_transferSize < size, 'transfer size');
                    } else {
                        // smaller encoded size due to compression
                        assert(bodySize < size, 'body size');
                        assert.strictEqual(content.compression, content.size - bodySize, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure compressed chunked responses', (done) => {
            const size = 1000;
            const chunks = 10;
            const total = size * chunks;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/data?size=${size}&chunks=${chunks}&gzip=true`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[0].response;
                    assert.strictEqual(content.size, total, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // smaller due to compression (despite headers and chunked encoding overhead)
                        assert(_transferSize < total, 'transfer size');
                    } else {
                        // smaller encoded size due to compression (despite chunked)
                        assert(bodySize < total, 'body size');
                        assert.strictEqual(content.compression, content.size - bodySize, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure empty responses', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/get`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[0].response;
                    assert.strictEqual(content.size, 0, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // larger due to headers
                        assert(_transferSize > 0, 'transfer size');
                    } else {
                        assert.strictEqual(bodySize, 0, 'body size');
                        assert.strictEqual(content.compression, 0, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure empty responses (204)', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/generate_204`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 2, 'entries');
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[1].response;
                    assert.strictEqual(content.size, 0, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // larger due to headers
                        assert(_transferSize > 0, 'transfer size');
                    } else {
                        assert.strictEqual(bodySize, 0, 'body size');
                        assert.strictEqual(content.compression, 0, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
        it('Properly measure not found responses (404)', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/generate_404`
                ],
                check: (events, har) => {
                    // XXX apparently the CSS is requested twice
                    assert(har.log.entries.length >= 4, 'entries');
                    for (let i = 1; i < 4; i++) {
                        const {url} = har.log.entries[i].request;
                        const {bodySize, headersSize, content, _transferSize} = har.log.entries[i].response;
                        assert.strictEqual(content.size, 0, 'size');
                        if (name === 'http2') {
                            assert.strictEqual(bodySize, -1, 'body size');
                            assert.strictEqual(content.compression, undefined, 'compression');
                            // XXX here _transferSize is erroneously 0
                        } else {
                            if (url.match(/\.png$/)) {
                                // loadingFinished
                                assert(bodySize > 0, 'body size');
                            } else {
                                // loadingFailed
                                assert(bodySize === 0, 'body size');
                                assert.strictEqual(content.compression, 0, 'compression');
                            }
                            assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                        }
                    }
                }
            });
        });
        it('Properly measure POST requests', (done) => {
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/generate_post?type=application/x-www-form-urlencoded&graceTime=500`
                ],
                graceTime: 1000,
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 2, 'entries');
                    const {bodySize} = har.log.entries[1].request;
                    assert.strictEqual(typeof bodySize, 'number', 'bodySize type');
                }
            });
        });
        it('Properly handle redirections', (done) => {
            const n = 5;
            const size = 1000;
            checkedRun({
                done,
                urls: [
                    `${baseUrl}/redirect?n=${n}&size=${size}`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, n + 1, 'entries');
                    for (let i = 0; i < n; i++) {
                        const {bodySize, headersSize, content, _transferSize, redirectURL} = har.log.entries[i].response;
                        assert.strictEqual(redirectURL, `/redirect?n=${n - i - 1}&size=${size}`, 'redirectURL');
                        assert.strictEqual(content.size, 0, 'size');
                        if (name === 'http2') {
                            assert.strictEqual(bodySize, -1, 'body size');
                            assert.strictEqual(content.compression, undefined, 'compression');
                            // larger due to headers
                            assert(_transferSize > 0, 'transfer size');
                        } else {
                            assert.strictEqual(bodySize, 0, 'body size');
                            assert.strictEqual(content.compression, 0, 'compression');
                            assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                        }
                    }
                    const {bodySize, headersSize, content, _transferSize} = har.log.entries[n].response;
                    assert.strictEqual(content.size, size, 'size');
                    if (name === 'http2') {
                        assert.strictEqual(bodySize, -1, 'body size');
                        assert.strictEqual(content.compression, undefined, 'compression');
                        // larger due to headers
                        assert(_transferSize > size, 'transfer size');
                    } else {
                        assert.strictEqual(bodySize, size, 'body size');
                        assert.strictEqual(content.compression, content.size - bodySize, 'compression');
                        assert.strictEqual(_transferSize, bodySize + headersSize, 'transfer size');
                    }
                }
            });
        });
    });
}

describe('HAR (live)', () => {
    describe('HTTP', () => {
        runTestSuite('http', 'http', http.createServer());
    });
    describe('HTTPS', () => {
        runTestSuite('https', 'https', https.createServer({
            key: fs.readFileSync('test/key.pem'),
            cert: fs.readFileSync('test/cert.pem')
        }));
    });
    describe('HTTP2', () => {
        runTestSuite('http2', 'https', http2.createServer({
            key: fs.readFileSync('test/key.pem'),
            cert: fs.readFileSync('test/cert.pem')
        }));
    });
});
