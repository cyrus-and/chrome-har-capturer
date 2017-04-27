'use strict';

const {checkedRun} = require('./util');

const assert = require('assert');

const httpbin = process.env.HTTPBIN || 'http://127.0.0.1:8000';

describe('HAR', () => {
    it('Properly handle repeated keys in query strings', (done) => {
        checkedRun(done, [
            `${httpbin}/get?a=1&b=2&a=1`
        ], {}, (har) => {
            assert.strictEqual(har.log.entries.length, 1, 'entries');
            assert.strictEqual(har.log.entries[0].request.queryString.length, 3, 'query string');
        });
    });
});
