#!/usr/bin/env node

var fs = require('fs');
var chc = require('../');

if (process.argv.length < 4) {
    console.log('usage:\n\t./chrome-har-capturer.js output.har url...');
    process.exit(1);
} else {
    var output = process.argv[2];
    var urls = process.argv.splice(3);
    var c = chc.load(urls);

    c.on('end', function(har) {
        fs.writeFileSync(output, JSON.stringify(har, null, 4));
    });
    c.on('error', function() {
        console.error('Unable to connect to Chrome');
        process.exit(1);
    });
}
