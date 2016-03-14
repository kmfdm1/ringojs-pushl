exports.defaults = {
        production: {
            server: "https://updates.push.services.mozilla.com/push/",
            connectTimeout: 1000
        },
        testmode: {
            server: "http://localhost",
            connectTimeout: 1000
        }
};

exports.check = function(options) {
    for (let prop in exports.defaults.production) {
        if (!options[prop]) {
            throw new Error("moz." + prop + " is missing from options");
        }
    }
    return true;
};