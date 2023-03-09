'use strict';

const CHC = require('..');

const validate = require('har-validator');

const fs = require('fs');

const log = JSON.parse(fs.readFileSync('test/log.json'));

const timingLog = JSON.parse(fs.readFileSync('test/timingLog.json'));

const validatePageTime = (har, thresholdTimeMs) => {
    const domEvent = har.log.pages[0].pageTimings.onContentLoad;
    const loadEvent = har.log.pages[0].pageTimings.onLoad;
    if (thresholdTimeMs <= domEvent || thresholdTimeMs <= loadEvent) {
        throw {message: `Page timings did not meet required thresholds. Threshold: ${thresholdTimeMs}, load was ${loadEvent}, domEvent was ${domEvent}`};
    }
};

const validateEntryTime = (har, url, thresholdTimeMs) => {
    const httpRequestEntry = har.log.entries.find((entry) => entry.time !== -1 && entry.request.url === url);
    if (thresholdTimeMs <= httpRequestEntry.time) {
        throw {message: `Entry timings did not meet required thresholds. Threshold was ${thresholdTimeMs}, event time was ${httpRequestEntry.time}, entry url${url}`};
    }
};

const allResultsTrue = (results) => {
    // check if each result is true, if not, reject
    return new Promise(function (resolve, reject) {
        results.forEach(result => {
            if (!result) {
                reject({message: 'Not all params are true'});
            }
        });
        resolve(results);
    });
};

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
    it('Parse event log with incomplete content', async () => {
        const incompleteLog = log.filter(({method}) => method !== 'Network.getResponseBody');
        return CHC.fromLog('http://someurl', incompleteLog, {
            content: true
        }).then((har) => {
            return false;
        }).catch((err) => {
            return true;
        });
    });

    // Testing the efficacy of using a requestContinued event vs using natural timings.
    // The timingLog.json file has artificially exaggerated natural start times (subtracted 300 seconds) for the page and a single test entry.
    it('Parse timestamps with no requestContinued messages', async () => {
        const filteredLog = timingLog.filter(entry => entry.method !== 'Custom.requestContinued');
        return CHC.fromLog('https://www.apple.com/', filteredLog, { content: true })
            .then((har) => {
                return validate.har(har);
            });
    });
    it('Parse timestamps with requestContinued messages', async () => {
        const testTag = 'https://www.apple.com/ac/globalnav/7/en_US/images/be15095f-5a20-57d0-ad14-cf4c638e223a/globalnav_links_iphone_image__ko7x4isga4ia_large.svg';
        return CHC.fromLog('https://www.apple.com/', timingLog, { content: true })
            .then((har) => {
                return validate.har(har) && validatePageTime(har, 300000) && validateEntryTime(har, testTag, 300000);
            });
    });

    // Testing to ensure only the first instances of page events are considered.
    // The timingLog.json file has subsequent page events which are artificially exaggerated by 300 seconds in timing.
    it('Only accept the first Page.loadEventFired and Page.domContentEventFired', async () => {
        const filteredLog = timingLog.filter(entry => entry.method !== 'Custom.requestContinued');
        // Counteracting the artificial padding of the page start times.
        timingLog[0].params.timestamp += 300;
        timingLog[0].params.wallTime += 300;
        return CHC.fromLog('https://www.apple.com/', filteredLog, { content: true })
            .then((har) => {
                return validate.har(har) && validatePageTime(har, 300000);
            });
    });

    it('Parse event log with Network.requestWillBeSentExtraInfo will append extra headers', async () => {
        return CHC.fromLog('http://someurl', log, {
            content: true
        }).then((har) => {
            const secGpc = har.log.entries[0].request.headers.some((header) => header.name === 'sec-gpc' && header.value === '1');
            return Promise.all([validate.har(har), allResultsTrue([secGpc])]);
        });
    });

    it('Parse event log with Network.requestWillBeSentExtraInfo will overwrite original headers with new headers case-insensitive', async () => {
        return CHC.fromLog('http://someurl', log, {
            content: true
        }).then((har) => {
            const valueOverwritten = har.log.entries[0].request.headers.some((header) => header.name === 'User-Agent' && header.value === 'overwritePreexistingUserAgentWithDifferentCase');
            const noDupe = !har.log.entries[0].request.headers.some((header) => header.name === 'user-agent');
            return Promise.all([validate.har(har), allResultsTrue([valueOverwritten, noDupe])]);
        });
    });
});
