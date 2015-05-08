exports.defaults = {
        production: {
            server: "https://android.googleapis.com/gcm/send",
            connectTimeout: 1000
        },
        testmode: {
            server: "http://localhost",
            apiKey: "apiKey",
            connectTimeout: 1000
        }
};

exports.check = function(options) {
    for each (let prop in ["apiKey"]) {
        if (!options[prop]) {
            throw new Error("gcm." + prop + " is missing from options");
        } else if (typeof(options.apiKey) != "string") {
            throw new Error("gcm." + prop + " has to be a string");
        }
    }
    return true;
};