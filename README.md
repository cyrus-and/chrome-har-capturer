chrome-har-capturer
===================

Capture HAR files from a remote Chrome instance.

Install
-------

    npm install git://github.com/cyrus-and/chrome-har-capturer.git

Example
-------

Start Google Chrome with the option `--remote-debugging-port=9222` then:

```javascript
var fs = require('fs');
var chc = require('chrome-har-capturer');
var c = chc.load(['https://github.com',
                  'http://reddit.com',
                  'http://www.reddit.com/help/faq']);
c.on('end', function(har) {
    fs.writeFileSync('out.har', JSON.stringify(har));
});
c.on('error', function() {
    console.error('Unable to connect to Chrome');
});
```

will load the supplied URLs serially generating a cumulative HAR file, just like
the Record button in the [Network Panel of Chrome Developer Tools][4].

Resources
---------

- [HAR 1.2 Spec][1]
- [HAR Viewer][2]
- [Chrome Developer Tools: Remote Debugging Protocol v1.0][3]

[1]: http://www.softwareishard.com/blog/har-12-spec/
[2]: http://www.softwareishard.com/blog/har-viewer/
[3]: https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/
[4]: https://developers.google.com/chrome-developer-tools/docs/network
