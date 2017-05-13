'use strict';

const {checkedRun, testServerHandler} = require('./util');

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');
const http2 = require('http2');

function runTestSuite(name, protocol, server) {
    const port = 8000;
    const baseHost = `${protocol}://localhost:${port}`;
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
                    `${baseHost}/get?a=1&b=2&a=1`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, 1, 'entries');
                    assert.strictEqual(har.log.entries[0].request.queryString.length, 3, 'query string');
                }
            });
        });
    });
    describe('Sizes', () => {
        it('Properly measure fixed-size responses', (done) => {
            const size = 1000;
            checkedRun({
                done,
                urls: [
                    `${baseHost}/data?size=${size}`
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
                    `${baseHost}/data?size=${size}&chunks=${chunks}`
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
                    `${baseHost}/data?size=${size}&gzip=true`
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
                    `${baseHost}/data?size=${size}&chunks=${chunks}&gzip=true`
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
                    `${baseHost}/get`
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
                    `${baseHost}/generate_204`
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
        it('Properly handle redirections', (done) => {
            const n = 5;
            const size = 1000;
            checkedRun({
                done,
                urls: [
                    `${baseHost}/redirect?n=${n}&size=${size}`
                ],
                check: (events, har) => {
                    assert.strictEqual(har.log.entries.length, n + 1, 'entries');
                    for (let i = 0; i < n; i++) {
                        const {bodySize, headersSize, content, _transferSize} = har.log.entries[i].response;
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

describe('HAR', () => {
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
