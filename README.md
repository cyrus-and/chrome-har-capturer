chrome-har-capturer    [![Build Status](https://travis-ci.org/cyrus-and/chrome-har-capturer.svg?branch=master)](https://travis-ci.org/cyrus-and/chrome-har-capturer)
===================

Capture HAR files from a [headless] Chrome instance.

Under the hood this module uses [chrome-remote-interface] to instrument Chrome.

[chrome-remote-interface]: https://github.com/cyrus-and/chrome-remote-interface
[headless]: https://www.chromestatus.com/feature/5678767817097216

![Screenshot](http://i.imgur.com/HoDaGr3.png)

Setup
-----

Install this module from NPM:

    npm install chrome-har-capturer

Start Chrome like this:

    google-chrome --remote-debugging-port=9222 --headless

**Important note:** this is a complete rewrite that uses brand new JavaScript
features and takes full advantage of the headless mode of Chrome; the upshot is
that it requires Node.js version 7.6.0+ and can only work in headless mode. It
also introduces breaking changes in the API. If these requirements are
unfeasible stick with version [0.9.5] but consider that it will not be supported
anymore.

[0.9.5]: https://github.com/cyrus-and/chrome-har-capturer/releases/tag/v0.9.5

Command line utility
--------------------

The command line utility can be used to generate HAR files from a list of
URLs. The following options are available:

    -h, --help           output usage information
    -t, --host <host>    Chrome Debugging Protocol host
    -p, --port <port>    Chrome Debugging Protocol port
    -x, --width <dip>    frame width in DIP
    -y, --height <dip>   frame height in DIP
    -o, --output <file>  write to file instead of stdout
    -c, --content        also capture the requests body
    -a, --agent <agent>  user agent override
    -g, --grace <ms>     time to wait after the load event
    -u, --timeout <ms>   time to wait before giving up the URL
    -l, --parallel <n>   load <n> URLs in parallel

Library
-------

Alternatively this module provides a simple [API](#api) that can be used to
write custom applications. See the command line utility [source code] for a
working example.

[source code]: https://github.com/cyrus-and/chrome-har-capturer/blob/master/bin/cli.js

### API

#### run(urls, [options])

Start the loading of a batch of URLs. Returns an event emitter (see below for
the list of supported events).

`urls` is array of URLs.

`options` is an object with the following optional properties:

- `host`: [Chrome Debugging Protocol] host. Defaults to `localhost`;
- `port`: [Chrome Debugging Protocol] port. Defaults to `9222`;
- `width`: frame width in DIP. Defaults to a Chrome-defined value;
- `height`: frame height in DIP. Defaults to a Chrome-defined value;
- `content`: If `true` also capture the requests body. Defaults to `false`;
- `timeout`: Milliseconds to wait before giving up with a URL;
- `parallel`: If `true` load the URLs in parallel (**warning:** this may spoil
  time-based metrics). Defaults to `false`;
- `preHook`: function returning a Promise executed before each page load:
    - `url`: the current URL;
    - `client`: [CDP client instance];
    - `index`: index of `url` in `urls`;
    - `urls`: input URL array.
- `postHook`: function returning a Promise executed after each page load event:
    - `url`: the current URL;
    - `client`: [CDP client instance];
    - `index`: index of `url` in `urls`;
    - `urls`: input URL array.

    If this hook resolves to a value then it is included in the resulting HAR
    object as the value of the `_user` key of the this URL's page object.

[CDP client instance]: https://github.com/cyrus-and/chrome-remote-interface#class-cdp

#### Event: 'load'

    function (url, index, urls) {}

Emitted when Chrome is about to load `url`. `index` is the index of `url` in
`urls`. `urls` is the array passed to `run()`.

#### Event: 'done'

    function (url, index, urls) {}

Emitted when Chrome finished loading `url`. `index` is the index of `url` in
`urls`. `urls` is the array passed to `run()`.

#### Event: fail'

    function (url, err, index, urls) {}

Emitted when Chrome cannot load `url`. The `Error` object `err` contains the
failure reason. Failed URLs will not appear in the resulting HAR object. `index`
is the index of `url` in `urls`. `urls` is the array passed to `run()`.

#### Event: 'har'

    function (har) {}

Emitted when all the URLs have been processed. If all the URLs fails then a
valid empty HAR object is returned. `har` is the resulting HAR object.

Resources
---------

- [HAR 1.2 Spec](http://www.softwareishard.com/blog/har-12-spec/)
- [HAR Viewer](http://www.softwareishard.com/blog/har-viewer/)

[Chrome Debugging Protocol]: https://developer.chrome.com/devtools/docs/debugger-protocol
