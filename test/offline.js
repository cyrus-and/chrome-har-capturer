'use strict';

const CHC = require('..');

const validate = require('har-validator');

const fs = require('fs');

const log = JSON.parse(fs.readFileSync('test/log.json'));

describe('HAR (offline)', () => {
    it('Parse event log without content', async () => {
        return CHC.fromLog('http://someurl', log).then((har) => {
            return validate.har(har);
        });
    });
    it('Parse event log with content', async () => {
        return CHC.fromLog('http://someurl', log, {
            content: true
        }).then((har) => {
            return validate.har(har);
        });
    });
});
