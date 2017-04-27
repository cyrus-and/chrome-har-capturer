chrome-har-capturer
===================

Capture HAR files from a [headless] Chrome instance.

Under the hood this module uses [chrome-remote-interface] to instrument Chrome.

[chrome-remote-interface]: https://github.com/cyrus-and/chrome-remote-interface
[headless]: https://www.chromestatus.com/feature/5678767817097216

<!-- TODO scrot -->

Setup
-----

Install this module from NPM:

    npm install chrome-har-capturer

Start Chrome with the following options:

    google-chrome --remote-debugging-port=9222 --headless

Command line utility
--------------------

    Usage: chrome-har-capturer [options] URL...

    Options:

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
      -l, --parallel       load the URLs in parallel

This module comes with a command line utility that can be used to generate an
HAR file from a list of URLs. For example:

    chrome-har-capturer -o example.har \
        https://github.com \
        http://localhost \
        http://example.com

Write a custom solution
-----------------------

See the command line utility [source code] for a working example.

[source code]: https://github.com/cyrus-and/chrome-har-capturer/blob/master/bin/cli.js

API
---

### run(urls, [options])

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
    - `client`: [CDP client instance].
- `postHook`: function returning a Promise executed after each page load event:
    - `url`: the current URL;
    - `client`: [CDP client instance].

[CDP client instance]: https://github.com/cyrus-and/chrome-remote-interface#class-cdp

### Event: 'load'

    function (url) {}

Emitted when Chrome is about to load `url`.

### Event: 'done'

    function (url) {}

Emitted when Chrome finished loading `url`.

### Event: fail'

    function (url, err) {}

Emitted when Chrome cannot load `url`. The `Error` object `err` contains the
failure reason. Failed URLs will not appear in the resulting HAR object.

### Event: 'har'

    function (har) {}

Emitted when all the URLs have been processed. `har` is the resulting HAR
object.

Resources
---------

- [HAR 1.2 Spec](http://www.softwareishard.com/blog/har-12-spec/)
- [HAR Viewer](http://www.softwareishard.com/blog/har-viewer/)

[Chrome Debugging Protocol]: https://developer.chrome.com/devtools/docs/debugger-protocol
