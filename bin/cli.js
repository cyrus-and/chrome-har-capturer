#!/usr/bin/env node
'use strict';

const chalk = require('chalk');
const program = require('commander');

const CHC = require('..');

function append(value, array) {
    array.push(value);
    return array;
}

program
    .usage('[options] URL...')
    .option('-t, --host <host>', 'Chrome Debugging Protocol host')
    .option('-p, --port <port>', 'Chrome Debugging Protocol port')
    .option('-x, --width <dip>', 'frame width in DIP')
    .option('-y, --height <dip>', 'frame height in DIP')
    .option('-o, --output <file>', 'write to file instead of stdout')
    .option('-c, --content', 'also capture the requests body')
    .option('-k, --cache', 'allow caching')
    .option('-a, --agent <agent>', 'user agent override')
    .option('-b, --block <URL>', 'URL pattern (*) to block (can be repeated)', append, [])
    .option('-H, --header <header>', 'Additional headers (can be repeated)', append, [])
    .option('-i, --insecure', 'ignore certificate errors')
    .option('-g, --grace <ms>', 'time to wait after the load event')
    .option('-u, --timeout <ms>', 'time to wait before giving up with a URL')
    .option('-r, --retry <number>', 'number of retries on page load failure')
    .option('-e, --retry-delay <ms>', 'time to wait before starting a new attempt')
    .option('-d, --post-data <bytes>', 'maximum POST data size to be returned')
    .option('-l, --parallel <n>', 'load <n> URLs in parallel')
    .parse(process.argv);

if (program.args.length === 0) {
    program.outputHelp();
    process.exit(1);
}

function prettify(url) {
    try {
        const {parse, format} = require('url');
        const urlObject = parse(url);
        urlObject.protocol = chalk.gray(urlObject.protocol.slice(0, -1));
        urlObject.host = chalk.bold(urlObject.host);
        return format(urlObject).replace(/[:/?=#]/g, chalk.gray('$&'));
    } catch (err) {
        // invalid URL delegate error detection
        return url;
    }
}

function log(string) {
    process.stderr.write(string);
}

async function preHook(url, client) {
    const {Network, Security} = client;
    // optionally ignore certificate errors
    if (program.insecure) {
        await Security.enable();
        await Security.setOverrideCertificateErrors({override: true});
        Security.certificateError(({eventId}) => {
            Security.handleCertificateError({eventId, action: 'continue'});
        });
    }
    // optionally set user agent
    const userAgent = program.agent;
    if (typeof userAgent === 'string') {
        await Network.setUserAgentOverride({userAgent});
    }
    // optionally block URLs
    if (program.block) {
        await Network.setBlockedURLs({urls: program.block});
    }
    // optionally add extra headers
    if (program.header) {
        const headers = {};
        // convert to object
        program.header.forEach((header) => {
            const match = header.match(/([^:]+): *(.*)/);
            if (match) {
                const [, name, value] = match;
                headers[name] = value;
            }
        });
        await Network.setExtraHTTPHeaders({headers});
    }
}

function postHook(url, client) {
    return new Promise((fulfill, reject) => {
        // allow the user specified grace time
        setTimeout(fulfill, program.grace || 0);
    });
}

const {host, port, width, height, content, cache, timeout, retry, retryDelay, postData, parallel} = program;
CHC.run(program.args, {
    host, port,
    width, height,
    content,
    cache,
    timeout,
    retry, retryDelay,
    postData,
    parallel,
    preHook, postHook
}).on('load', (url) => {
    log(`- ${prettify(url)} `);
    if (parallel) {
        log(chalk.yellow('…\n'));
    }
}).on('done', (url) => {
    if (parallel) {
        log(`- ${prettify(url)} `);
    }
    log(chalk.green('✓\n'));
}).on('fail', (url, err) => {
    if (parallel) {
        log(`- ${prettify(url)} `);
    }
    log(chalk.red(`✗\n  ${err.message}\n`));
}).on('har', (har) => {
    const fs = require('fs');
    const json = JSON.stringify(har, null, 4);
    const output = program.output
          ? fs.createWriteStream(program.output)
          : process.stdout;
    output.write(json);
    output.write('\n');
});
