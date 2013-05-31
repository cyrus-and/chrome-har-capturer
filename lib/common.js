exports.verbose = false;

exports.dump = function (message) {
    if (exports.verbose) {
        console.error('# ' + message);
    }
};
