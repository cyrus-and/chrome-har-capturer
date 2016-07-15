chrome-har-capturer
===================

Capture HAR files from a remote Chrome instance.

Under the hood this module uses [chrome-remote-interface][cri] to instrument
Chrome.

Usage
-----

Start Chrome with options:

- `--remote-debugging-port=<port>` to enable the
  [Remote Debugging Protocol][rdp] on the port `<port>`;

- `--enable-benchmarking --enable-net-benchmarking` to enable the Javascript
  interface that allows `chrome-har-capturer` to flush the DNS cache and the
  socket pool before loading each URL.

For example:

    google-chrome --remote-debugging-port=9222 \
                  --enable-benchmarking \
                  --enable-net-benchmarking

### Use the bundled utility

    Usage: chrome-har-capturer [options] URL...

    Options:

      -h, --help           output usage information
      -t, --host <host>    Remote Debugging Protocol host
      -p, --port <port>    Remote Debugging Protocol port
      -o, --output <file>  dump to file instead of stdout
      -c, --content        also capture the requests body
      -a, --agent <agent>  user agent override
      -d, --delay <ms>     time to wait after the load event
      -g, --give-up <s>    time to wait before giving up
      -f, --force          continue even without benchmarking extension
      -v, --verbose        enable verbose output on stderr

This module comes with a utility that can be used to generate a cumulative HAR
file from a list of URLs.

Install globally with:

    sudo npm install -g chrome-har-capturer

Load a list of URL with:

    chrome-har-capturer -o out.har \
        https://github.com \
        http://www.reddit.com \
        http://iwillfail \
        http://www.reddit.com/help/faq

### Write a custom application

Install locally with:

    npm install chrome-har-capturer

The following snippet loads an array of URLs serially and generate a cumulative
HAR file, just like the Record button in the
[Network Panel of Chrome Developer Tools][net].

```javascript
var fs = require('fs');
var chc = require('chrome-har-capturer');
var c = chc.load(['https://github.com',
                  'http://www.reddit.com',
                  'http://iwillfail',
                  'http://www.reddit.com/help/faq']);
c.on('connect', function () {
    console.log('Connected to Chrome');
});
c.on('end', function (har) {
    fs.writeFileSync('out.har', JSON.stringify(har));
});
c.on('error', function (err) {
    console.error('Cannot connect to Chrome: ' + err);
});
```

API
---

### load(urls, [options])

Connects to a remote instance of Google Chrome using the
[Remote Debugging Protocol][rdp] and loads a list of URLs serially. Returns an
instance of the `Client` class.

`urls` is either an array or a single URL (note that URLs must contain the
schema, otherwise they will be rejected by Chrome).

`options` is an object with the following optional properties:

- `host`: [Remote Debugging Protocol][rdp] host. Defaults to `localhost`;
- `port`: [Remote Debugging Protocol][rdp] port. Defaults to `9222`;
- `chooseTab`: Callback used to determine which remote tab attach to. Takes the
  JSON array returned by `http://host:port/json` containing the tab list and
  must return the numeric index of a tab. Defaults to a function that returns
  the active one (`function (tabs) { return 0; }`);
- `fetchContent`: If `true` also capture the requests body. Defaults to `false`;
- `userAgent`: String used to override the user agent. Defaults to the
  original value;
- `onLoadDelay`: Milliseconds to wait after the load event is fired before
  stop capturing events. Defaults to `0`;
- `giveUpTime`; Seconds to wait before giving up with the current URL;
- `force`: If `true` continue even without the benchmarking extension support;
  useful to inspect Chrome for Android. Note that in this way the DNS cache and
  socket pool are not flushed. Defaults to `false`.

### setVerbose([verbose])

Enable or disable verbose prints for debugging purposes.

`verbose`: Verbosity flag. Defaults to `true`.

### Class: Client

#### Event: 'connect'

    function () {}

Emitted when a connection to Chrome has been established.

#### Event: 'pageStart'

    function (url) {}

Emitted when Chrome is about to load `url`.

#### Event: 'pageEnd'

    function (url) {}

Emitted when Chrome has finished loading `url`.

#### Event: 'pageError'

    function (url) {}

Emitted when Chrome has failed loading `url`. Failed URLs will not appear in the
cumulative HAR object.

#### Event: 'end'

    function (har) {}

Emitted when every given URL has been loaded. `har` is the cumulative HAR object.

#### Event: 'error'

    function (err) {}

Emitted when `http://host:port/json` can't be reached or if there are unexpected
behaviors with Chrome. `err` in an instance of `Error`.

Resources
---------

- [HAR 1.2 Spec][har]
- [HAR Viewer][harview]
- [Chrome Developer Tools: Remote Debugging Protocol v1.1][rdp]

[cri]: https://github.com/cyrus-and/chrome-remote-interface
[har]: http://www.softwareishard.com/blog/har-12-spec/
[harview]: http://www.softwareishard.com/blog/har-viewer/
[rdp]: https://developer.chrome.com/devtools/docs/protocol/1.1/index
[net]: https://developer.chrome.com/devtools/docs/network#network-panel-overview
