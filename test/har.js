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
});
