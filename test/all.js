var system = require("system");

exports.testMessageGcm = require("./test_message_gcm");
exports.testDelayqueue = require("./test_delayqueue");
exports.testMessageQueue = require("./test_messagequeue");
exports.testMessageDistributorGcm = require("./test_messagedistributor_gcm");

if (require.main == module.id) {
    system.exit(require("test").run.apply(null,
            [exports].concat(system.args.slice(1))));
}
