'use strict';

const CHC = require('..');

const validate = require('har-validator');

const assert = require('assert');
const url = require('url');
const zlib = require('zlib');

function checkedRun(done, urls, options = {}, check) {
    let nLoad = 0;
    let nDone = 0;
    let nFail = 0;
    let nPreHook = 0;
    let nPostHook = 0;
    options.preHook = async (url, client, index, _urls) => {
        // ignore certificate errors (requires Chrome 59) because
        // --ignore-certificate-errors doesn't work in headless mode
        const {Security} = client;
        await Security.enable();
        await Security.setOverrideCertificateErrors({override: true});
        Security.certificateError(({eventId}) => {
            Security.handleCertificateError({eventId, action: 'continue'});
        });

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
            await validate.har(har);
            if (typeof check === 'object') {
                assert.strictEqual(nLoad, check.nLoad, 'load');
                assert.strictEqual(nDone, check.nDone, 'done');
                assert.strictEqual(nFail, check.nFail, 'fail');
                assert.strictEqual(nPreHook, check.nPreHook, 'preHook');
                assert.strictEqual(nPostHook, check.nPostHook, 'postHook');
                assert.strictEqual(har.log.pages.length, check.nPages, 'pages');
                assert.strictEqual(har.log.entries.length, check.nEntries, 'entries');
            } else if (typeof check === 'function') {
                await check(har);
            }
            done();
        } catch (err) {
            if (err.name === 'HARError') {
                console.error(JSON.stringify(har, null, 4));
                console.error(JSON.stringify(err.errors, null, 4));
            }
            done(err);
        }
    });
}

function data(size) {
    return Buffer.alloc(size, 'x');
}

function testServerHandler(request, response) {
    const urlObject = url.parse(request.url, true);
    switch (urlObject.pathname) {
    case '/get':
        {
            response.end();
        }
        break;
    case '/generate_204':
        {
            response.setHeader('content-type', 'text/html');
            response.end('<img src="/204"/>');
        }
        break;
    case '/204':
        {
            response.writeHead(204);
            response.end();
        }
        break;
    case '/data':
        {
            const size = Number(urlObject.query.size);
            const chunks = Number(urlObject.query.chunks);
            const gzip = !!(urlObject.query.gzip);
            const send = (chunk, end) => {
                if (end) {
                    response.end(chunk);
                } else {
                    response.write(chunk);
                }
            };
            // enable compression
            if (gzip) {
                response.setHeader('content-encoding', 'gzip');
                const gzipStream = zlib.createGzip();
                gzipStream.pipe(response);
                response = gzipStream;
            }
            // trasfer-encoding: chunked
            if (chunks) {
                for (let i = 0; i < chunks; i++) {
                    const chunk = data(size);
                    send(chunk, false);
                }
                response.end();
            }
            // set content-length
            else {
                const chunk = data(size);
                send(chunk, true);
            }
        }
        break;
    case '/redirect':
        {
            const n = Number(urlObject.query.n);
            const size = Number(urlObject.query.size);
            if (n) {
                response.writeHead(302, {
                    location: `/redirect?n=${n - 1}&size=${size}`
                });
                response.end();
            } else {
                const chunk = data(size);
                response.end(chunk);
            }
        }
        break;
    }
}

module.exports = {checkedRun, testServerHandler};
