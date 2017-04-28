'use strict';

const {checkedRun, createTestServer} = require('./util');

const assert = require('assert');

describe('HAR', () => {
    let testServer;
    before('Start web server', (done) => {
        testServer = createTestServer(done);
    });
    after('Stop web server', (done) => {
        testServer.close(done);
    });

    it('Properly handle repeated keys in query strings', (done) => {
        checkedRun(done, [
            'http://localhost:8000/get?a=1&b=2&a=1'
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            assert.strictEqual(har.log.entries[0].request.queryString.length, 3, 'query string');
        });
    });
    it('Properly measure fixed-size responses', (done) => {
        const size = 1000;
        checkedRun(done, [
            `http://localhost:8000/data?size=${size}`
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            const {bodySize, content} = har.log.entries[0].response;
            assert.strictEqual(bodySize, size, 'body size');
            assert.strictEqual(content.size, size, 'size');
            assert.strictEqual(content.compression, content.size - bodySize, 'compression');
        });
    });
    it('Properly measure chunked responses', (done) => {
        const size = 1000;
        const chunks = 10;
        const total = size * chunks;
        checkedRun(done, [
            `http://localhost:8000/data?size=${size}&chunks=${chunks}`
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            // larger encoded size due to chunked encoding overhead
            const {bodySize, content} = har.log.entries[0].response;
            assert(bodySize > total, 'body size');
            assert.strictEqual(content.size, total, 'size');
            assert.strictEqual(content.compression, content.size - bodySize, 'compression');
        });
    });
    it('Properly measure fixed-size compressed responses', (done) => {
        const size = 1000;
        checkedRun(done, [
            `http://localhost:8000/data?size=${size}&gzip=true`
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            // smaller encoded size due to compression
            const {bodySize, content} = har.log.entries[0].response;
            assert(bodySize < size, 'body size');
            assert.strictEqual(content.size, size, 'size');
            assert.strictEqual(content.compression, content.size - bodySize, 'compression');
        });
    });
    it('Properly measure compressed chunked responses', (done) => {
        const size = 1000;
        const chunks = 10;
        const total = size * chunks;
        checkedRun(done, [
            `http://localhost:8000/data?size=${size}&chunks=${chunks}&gzip=true`
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            // smaller encoded size due to compression (despite chunked)
            const {bodySize, content} = har.log.entries[0].response;
            assert(bodySize < total, 'body size');
            assert.strictEqual(content.size, total, 'size');
            assert.strictEqual(content.compression, content.size - bodySize, 'compression');
        });
    });
});
