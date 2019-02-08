'use strict';

const CHC = require('..');

const validate = require('har-validator');

const assert = require('assert');
const url = require('url');
const zlib = require('zlib');

function checkedRun({done, urls, options = {}, graceTime = 0, expected, check}) {
    let nLoad = 0;
    let nDone = 0;
    let nFail = 0;
    let nPreHook = 0;
    let nPostHook = 0;
    const events = [];
    options.content = true;
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
        events.push('preHook');
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
        events.push('postHook');
        try {
            assert.strictEqual(typeof url, 'string');
            assert.strictEqual(typeof client.close, 'function');
            assert.strictEqual(_urls[index], url);
            assert.deepStrictEqual(_urls, urls);
        } catch (err) {
            done(err);
        }

        return new Promise((fulfill) => setTimeout(fulfill, graceTime));
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
        // do not swallow unexpected errors
        if (!expected) {
            console.log(err);
        }

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
            // check HAR syntax
            await validate.har(har);
            // custom expected counts
            if (expected) {
                assert.strictEqual(nLoad, expected.nLoad, 'load');
                assert.strictEqual(nDone, expected.nDone, 'done');
                assert.strictEqual(nFail, expected.nFail, 'fail');
                assert.strictEqual(nPreHook, expected.nPreHook, 'preHook');
                assert.strictEqual(nPostHook, expected.nPostHook, 'postHook');
                assert.strictEqual(har.log.pages.length, expected.nPages, 'pages');
                assert.strictEqual(har.log.entries.length, expected.nEntries, 'entries');
            }
            // custom check function
            if (check) {
                await check(events, har);
            }
            // finally done
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
    case '/generate_post':
        {
            const {type, graceTime} = urlObject.query;
            response.setHeader('content-type', 'text/html');
            response.end(`<form id="form" method="POST" action="/post" enctype="${type}"><input name="name" value="value"/></form><script>setTimeout(() => { form.submit(); }, ${graceTime})</script>`);
        }
        break;
    case '/post':
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
    case '/generate_404':
        {
            response.setHeader('content-type', 'text/html');
            response.end(`<script src="/404.js">
                          </script><img src="/404.png"/>
                          <link rel="stylesheet" href="/404.css">`);
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
    default:
        response.writeHead(404);
        response.end();
    }
}

module.exports = {checkedRun, testServerHandler};
