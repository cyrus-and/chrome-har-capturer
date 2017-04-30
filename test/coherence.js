'use strict';

const {checkedRun} = require('./util');

function runTestSuite(parallel) {
    describe(parallel ? `Concurrently (${parallel})` : 'Sequentially', () => {
        it('Passing an empty URL list should generate an empty HAR object', (done) => {
            checkedRun(done, [], {
                parallel
            }, {
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
                'c',
                'd'
            ], {
                parallel,
                port: 1
            }, {
                nLoad: 4,
                nDone: 0,
                nFail: 4,
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
                'c',
                'd'
            ], {
                parallel
            }, {
                nLoad: 4,
                nDone: 0,
                nFail: 4,
                nPreHook: 4,
                nPostHook: 0,
                nPages: 0,
                nEntries: 0
            });
        });
        it('Should generate a non-empty HAR object with valid URLs', (done) => {
            checkedRun(done, [
                'http://localhost:9222/json/list',
                'a',
                'b',
                'c',
                'd',
                'http://localhost:9222/json/version',
            ], {
                parallel
            }, {
                nLoad: 6,
                nDone: 2,
                nFail: 4,
                nPreHook: 6,
                nPostHook: 2,
                nPages: 2,
                nEntries: 2
            });
        });
        it('Using a small timeout should generate an empty HAR object', (done) => {
            checkedRun(done, [
                'http://localhost:9222/json/list',
                'a',
                'b',
                'c',
                'd',
                'http://localhost:9222/json/version',
            ], {
                parallel,
                timeout: 0
            }, {
                nLoad: 6,
                nDone: 0,
                nFail: 6,
                nPreHook: 6,
                nPostHook: 0,
                nPages: 0,
                nEntries: 0
            });
        });
    });
}

describe('Coherence', () => {
    runTestSuite(false);
    runTestSuite(2); // even
    runTestSuite(3); // with remainder
    runTestSuite(10); // more than URLs
});
