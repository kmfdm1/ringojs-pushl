var {MessageDistributor} = require("./messagedistributor");

exports.getMessageDistributor = function(namespace, options) {
    return module.singleton("MessageDistributor" + namespace, function() {
        return new MessageDistributor(namespace, options);
    });
};

exports.GCMMessage = require("./gcm/message").GCMMessage;