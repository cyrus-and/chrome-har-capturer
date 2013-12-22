#!/usr/bin/env node

var fs = require('fs');
var chc = require('../');
var colors = require('colors');
var argv = require('optimist')
    .usage('Capture HAR files from a remote Chrome instance\n\n' +
           'Usage: $0 [options] URL...')
    .demand(1) // at least one URL
    .options({
        'host': {
            'alias': 'h',
            'description': 'Remote Debugging Protocol host',
            'default': 'localhost'
        },
        'port': {
            'alias': 'p',
            'description': 'Remote Debugging Protocol port',
            'default': 9222
        },
        'output': {
            'alias': 'o',
            'description': 'Dump to file instead of stdout'
        },
        'verbose': {
            'alias': 'v',
            'description': 'Enable verbose output on stderr',
            'boolean': true
        },
        'messages': {
            'alias': 'm',
            'description': 'Dump raw messages instead of the generated HAR',
            'boolean': true
        }
    })
    .argv;

var output = argv.output;
var urls = argv._;
var c = chc.load(urls, {'host': argv.host,
                        'port': argv.port});

chc.setVerbose(argv.verbose);

c.on('pageEnd', function(url) {
    console.error('DONE'.green + ' ' + url);
});
c.on('pageError', function(url) {
    console.error('FAIL'.red + ' ' + url);
});
c.on('end', function(har, messages) {
    var object = argv.messages ? messages : har;
    var json = JSON.stringify(object, null, 4);
    if (argv.output) {
        fs.writeFileSync(output, json);
    } else {
        console.log(json);
    }
});
c.on('error', function() {
    console.error('Unable to connect to Chrome on ' +
                  argv.host + ':' + argv.port);
    process.exit(1);
});
