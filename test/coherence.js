'use strict';

const {checkedRun} = require('./util');

const assert = require('assert');

function runTestSuite(parallel) {
    describe(parallel ? `Concurrently (${parallel})` : 'Sequentially', () => {
        it('Passing an empty URL list should generate an empty HAR object', (done) => {
            checkedRun({
                done,
                urls: [],
                options: {
                    parallel
                },
                expected: {
                    nLoad: 0,
                    nDone: 0,
                    nFail: 0,
                    nPreHook: 0,
                    nPostHook: 0,
                    nPages: 0,
                    nEntries: 0
                }
            });
        });
        it('Using wrong connection parameters should generate an empty HAR object and notify URL errors', (done) => {
            checkedRun({
                done,
                urls: [
                    'a',
                    'b',
                    'c',
                    'd'
                ],
                options: {
                    parallel,
                    port: 1
                },
                expected: {
                    nLoad: 4,
                    nDone: 0,
                    nFail: 4,
                    nPreHook: 0,
                    nPostHook: 0,
                    nPages: 0,
                    nEntries: 0
                }
            });
        });
        it('Using wrong URLs should generate an empty HAR object and notify URL errors', (done) => {
            checkedRun({
                done,
                urls: [
                    'a',
                    'b',
                    'c',
                    'd'
                ],
                options: {
                    parallel
                },
                expected: {
                    nLoad: 4,
                    nDone: 0,
                    nFail: 4,
                    nPreHook: 4,
                    nPostHook: 0,
                    nPages: 0,
                    nEntries: 0
                }
            });
        });
        it('Should generate a non-empty HAR object with valid URLs', (done) => {
            checkedRun({
                done,
                urls: [
                    'http://localhost:9222/json/list',
                    'a',
                    'b',
                    'c',
                    'd',
                    'http://localhost:9222/json/version'
                ],
                options: {
                    parallel
                },
                expected: {
                    nLoad: 6,
                    nDone: 2,
                    nFail: 4,
                    nPreHook: 6,
                    nPostHook: 2,
                    nPages: 2,
                    nEntries: 2
                }
            });
        });
        // XXX this only makes sense when the '--no-exit' option is used: if the
        // implementation fails to clean the timeout then mocha *never*
        // (2147483647) terminates yet this test passes
        it('Using a huge timeout should not matter if all the URLs fails or succeeds', (done) => {
            checkedRun({
                done,
                urls: [
                    'http://localhost:9222/json/list',
                    'a',
                    'b',
                    'c',
                    'd',
                    'http://localhost:9222/json/version'
                ],
                options: {
                    parallel,
                    timeout: 2147483647
                },
                expected: {
                    nLoad: 6,
                    nDone: 2,
                    nFail: 4,
                    nPreHook: 6,
                    nPostHook: 2,
                    nPages: 2,
                    nEntries: 2
                }
            });
        });
        it('Using a small timeout should generate an empty HAR object', (done) => {
            checkedRun({
                done,
                urls: [
                    'http://localhost:9222/json/list',
                    'a',
                    'b',
                    'c',
                    'd',
                    'http://localhost:9222/json/version'
                ],
                options: {
                    parallel,
                    timeout: 0
                },
                expected: {
                    nLoad: 6,
                    nDone: 0,
                    nFail: 6,
                    nPreHook: 6,
                    nPostHook: 0,
                    nPages: 0,
                    nEntries: 0
                }
            });
        });
        it('The order of hooks should be coherent with the concurrency setting', (done) => {
            checkedRun({
                done,
                urls: [
                    'http://localhost:9222/json/version',
                    'http://localhost:9222/json/version',
                    'http://localhost:9222/json/version',
                    'http://localhost:9222/json/version',
                    'http://localhost:9222/json/version',
                    'http://localhost:9222/json/version',
                ],
                options: {
                    parallel
                },
                expected: {
                    nLoad: 6,
                    nDone: 6,
                    nFail: 0,
                    nPreHook: 6,
                    nPostHook: 6,
                    nPages: 6,
                    nEntries: 6
                },
                check: (events, har) => {
                    // the event array must start with 'degree' occurrences of
                    // 'preHook' followed by a 'postHook'
                    if (events.length) {
                        const degree = parallel || 1;
                        const firstPostHookIndex = events.indexOf('postHook');
                        assert.strictEqual(firstPostHookIndex, Math.min(degree, 6), 'postHook');
                        const allPreHooks = events.slice(0, firstPostHookIndex).every((event) => event === 'preHook');
                        assert(allPreHooks, 'preHook');
                    }
                }
            });
        });
        it('Abort on failure should work for sequential mode only', (done) => {
            checkedRun({
                done,
                urls: [
                    'http://localhost:9222/json/version',
                    'a',
                    'b',
                    'c',
                    'd',
                    'http://localhost:9222/json/version',
                ],
                options: {
                    parallel,
                    abortOnFailure: true,
                },
                expected: {
                    nLoad: parallel ? 6 : 2,
                    nDone: parallel ? 2 : 1,
                    nFail: parallel ? 4 : 1,
                    nPreHook: parallel ? 6 : 2,
                    nPostHook: parallel ? 2 : 1,
                    nPages: parallel ? 2 : 1,
                    nEntries: parallel ? 2 : 1
                }
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
