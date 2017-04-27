'use strict';

const CHC = require('..');

const validate = require('har-validator');

const assert = require('assert');

function checkedRun(done, urls, options, check) {
    let nLoad = 0;
    let nDone = 0;
    let nFail = 0;
    let nPreHook = 0;
    let nPostHook = 0;
    if (options) {
        options.preHook = (url, client, index, _urls) => {
            nPreHook++;
            try {
                assert.strictEqual(typeof url, 'string');
                assert.strictEqual(typeof client.close, 'function');
                assert.strictEqual(urls[index], url);
                assert.deepStrictEqual(_urls, urls);
            } catch (err) {
                done(err);
            }
        };
        options.postHook = (url, client, index, _urls) => {
            nPostHook++;
            try {
                assert.strictEqual(typeof url, 'string');
                assert.strictEqual(typeof client.close, 'function');
                assert.strictEqual(_urls[index], url);
                assert.deepStrictEqual(_urls, urls);
            } catch (err) {
                done(err);
            }
        };
    }
    CHC.run(
        urls,
        options
    ).on('load', (url, index, _urls) => {
        nLoad++;
        try {
            assert.strictEqual(typeof url, 'string');
            assert.strictEqual(_urls[index], url);
            assert.deepStrictEqual(_urls, urls);
        } catch (err) {
            done(err);
        }
    }).on('done', (url, index, _urls) => {
        nDone++;
        try {
            assert.strictEqual(typeof url, 'string');
            assert.strictEqual(_urls[index], url);
            assert.deepStrictEqual(_urls, urls);
        } catch (err) {
            done(err);
        }
    }).on('fail', (url, err, index, _urls) => {
        nFail++;
        try {
            assert.strictEqual(typeof url, 'string');
            assert(err instanceof Error);
            assert.strictEqual(_urls[index], url);
            assert.deepStrictEqual(_urls, urls);
        } catch (err) {
            done(err);
        }
    }).on('har', async (har) => {
        try {
            if (check) {
                assert.strictEqual(nLoad, check.nLoad, 'load');
                assert.strictEqual(nDone, check.nDone, 'done');
                assert.strictEqual(nFail, check.nFail, 'fail');
                assert.strictEqual(nPreHook, check.nPreHook, 'preHook');
                assert.strictEqual(nPostHook, check.nPostHook, 'postHook');
                assert.strictEqual(har.log.pages.length, check.nPages, 'pages');
                assert.strictEqual(har.log.entries.length, check.nEntries, 'entries');
            }
            await validate.har(har);
            done();
        } catch (err) {
            done(err);
        }
    });
}

describe('Coherence', () => {
    it('Passing an empty URL list should generate an empty HAR object', (done) => {
        checkedRun(done, [], {}, {
            nLoad: 0,
            nDone: 0,
            nFail: 0,
            nPreHook: 0,
            nPostHook: 0,
            nPages: 0,
            nEntries: 0
        });
    });
    it('Using wrong connection parameters should generate an empty HAR object and notify URL errors', (done) => {
        checkedRun(done, [
            'a',
            'b',
            'c'
        ], {
            port: 1
        }, {
            nLoad: 3,
            nDone: 0,
            nFail: 3,
            nPreHook: 0,
            nPostHook: 0,
            nPages: 0,
            nEntries: 0
        });
    });
    it('Using wrong URLs should generate an empty HAR object and notify URL errors', (done) => {
        checkedRun(done, [
            'a',
            'b',
            'c'
        ], {}, {
            nLoad: 3,
            nDone: 0,
            nFail: 3,
            nPreHook: 3,
            nPostHook: 0,
            nPages: 0,
            nEntries: 0
        });
    });
    it('Should generate a non-empty HAR object valid URLs', (done) => {
        checkedRun(done, [
            'http://localhost:9222/json/list',
            'a',
            'b',
            'c',
            'http://localhost:9222/json/version',
        ], {}, {
            nLoad: 5,
            nDone: 2,
            nFail: 3,
            nPreHook: 5,
            nPostHook: 2,
            nPages: 2,
            nEntries: 2
        });
    });
});
