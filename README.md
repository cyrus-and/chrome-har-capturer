# chrome-har-capturer

[![CI status](https://github.com/cyrus-and/chrome-har-capturer/actions/workflows/ci.yml/badge.svg)](https://github.com/cyrus-and/chrome-har-capturer/actions?query=workflow:CI)

Capture HAR files from a Chrome instance.

Under the hood this module uses [chrome-remote-interface] to instrument Chrome.

![Screenshot](http://i.imgur.com/HoDaGr3.png)

## Setup

Install this module from NPM:

```
npm install chrome-har-capturer
```

Start Chrome like this:

```
google-chrome --remote-debugging-port=9222 --headless
```

## Command line utility

The command line utility can be used to generate HAR files from a list of URLs. The following options are available:

    -h, --help               output usage information
    -t, --host <host>        Chrome Debugging Protocol host
    -p, --port <port>        Chrome Debugging Protocol port
    -x, --width <dip>        frame width in DIP
    -y, --height <dip>       frame height in DIP
    -o, --output <file>      write to file instead of stdout
    -c, --content            also capture the requests body
    -k, --cache              allow caching
    -a, --agent <agent>      user agent override
    -b, --block <URL>        URL pattern (*) to block (can be repeated)
    -H, --header <header>    Additional headers (can be repeated)
    -i, --insecure           ignore certificate errors
    -g, --grace <ms>         time to wait after the load event
    -u, --timeout <ms>       time to wait before giving up with a URL
    -r, --retry <number>     number of retries on page load failure
    -e, --retry-delay <ms>   time to wait before starting a new attempt
    -f, --abort-on-failure   stop after the first failure (incompatible with parallel mode)
    -d, --post-data <bytes>  maximum POST data size to be returned
    -l, --parallel <n>       load <n> URLs in parallel

## Library

Alternatively this module provides a simple [API](#api) that can be used to write custom applications. See the command line utility [source code][] for a working example.

[source code]: https://github.com/cyrus-and/chrome-har-capturer/blob/master/bin/cli.js

### API

#### run(urls, [options])

Start the loading of a batch of URLs. Returns an event emitter (see below for the list of supported events).

`urls` is array of URLs.

`options` is an object with the following optional properties:

- `host`: [Chrome Debugging Protocol][] host. Defaults to `localhost`;
- `port`: [Chrome Debugging Protocol][] port. Defaults to `9222`;
- `width`: frame width in DIP. Defaults to a Chrome-defined value;
- `height`: frame height in DIP. Defaults to a Chrome-defined value;
- `content`: if `true` also capture the requests body. Defaults to `false`;
- `cache`: if `true` allow caching. Defaults to `false`;
- `timeout`: milliseconds to wait before giving up with a URL;
- `retry`: number of retries on page load failure. Defaults to `0`;
- `retryDelay`: time to wait before starting a new attempt. Defaults to `0`;
- `abortOnFailure`: stop after the first failure (incompatible with parallel mode);
- `postData`: maximum POST data size (in bytes) to be returned. Defaults to unlimited;
- `parallel`: if `true` load the URLs in parallel (**warning:** this may spoil time-based metrics). Defaults to `false`;
- `preHook`: function returning a Promise executed before each page load:
    - `url`: the current URL;
    - `client`: [CDP client instance][];
    - `index`: index of `url` in `urls`;
    - `urls`: input URL array.
- `postHook`: function returning a Promise executed after each page load event:
    - `url`: the current URL;
    - `client`: [CDP client instance][];
    - `index`: index of `url` in `urls`;
    - `urls`: input URL array.

    If this hook resolves to a value then it is included in the resulting HAR object as the value of the `_user` key of the this URL's page object.

[CDP client instance]: https://github.com/cyrus-and/chrome-remote-interface#class-cdp

##### Event: 'load'

```js
function (url, index, urls) {}
```

Emitted when Chrome is about to load `url`. `index` is the index of `url` in `urls`. `urls` is the array passed to `run()`.

##### Event: 'done'

```js
function (url, index, urls) {}
```

Emitted when Chrome finished loading `url`. `index` is the index of `url` in `urls`. `urls` is the array passed to `run()`.

##### Event: fail'

```js
function (url, err, index, urls) {}
```

Emitted when Chrome cannot load `url`. The `Error` object `err` contains the failure reason. Failed URLs will not appear in the resulting HAR object. `index` is the index of `url` in `urls`. `urls` is the array passed to `run()`.

##### Event: 'har'

```js
function (har) {}
```

Emitted when all the URLs have been processed. If all the URLs fails then a valid empty HAR object is returned. `har` is the resulting HAR object.

#### fromLog(url, log, [options])

Generate a single-page HAR from an array of raw events that comes from the [Chrome Debugging Protocol][] (e.g., from [chrome-remote-interface][]). Returns a Promise that fulfills to the generated HAR.

`url` is the page URL;

`log` is the array of events in the form:

```js
{
    method: '...',
    params: {...}
}
```

Events to be provided are:

- `Page.domContentEventFired`;
- `Page.loadEventFired`;
- `Network.requestWillBeSent`;
- `Network.dataReceived`;
- `Network.responseReceived`;
- `Network.resourceChangedPriority`;
- `Network.loadingFinished`;
- `Network.loadingFailed`.

Additional events for WebSockets are:

 - `Network.webSocketWillSendHandshakeRequest`;
 - `Network.webSocketHandshakeResponseReceived`;
 - `Network.webSocketClosed`;
 - `Network.webSocketFrameSent`;
 - `Network.webSocketFrameReceived`.

`options` is an object with the following optional properties:
- `content`: if `true` also expect the requests body. Defaults to `false`.

When `content` is `true` synthetic events in the following form are also expected:

```js
{
    method: 'Network.getResponseBody',
    params: {
        requestId: '...',
        body: '...',
        base64Encoded: true/false
    }
}
```

These events contain the reply of the [`Network.getResponseBody`][] method, this is needed because Chrome does not return the body content via events, instead it must be requested manually and the reply must be appended to the other events in the log.

[`Network.getResponseBody`]: https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-getResponseBody

## Resources

- [HAR 1.2 Spec](http://www.softwareishard.com/blog/har-12-spec/)
- [HAR Viewer](http://www.softwareishard.com/blog/har-viewer/)
- [HAR Analyzer](https://toolbox.googleapps.com/apps/har_analyzer/)

[Chrome Debugging Protocol]: https://developer.chrome.com/devtools/docs/debugger-protocol
[chrome-remote-interface]: https://github.com/cyrus-and/chrome-remote-interface
