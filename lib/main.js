var {MessageDistributor} = require("./messagedistributor");

exports.getMessageDistributor = function(namespace, options) {
    return module.singleton("MessageDistributor" + namespace, function() {
        return new MessageDistributor(namespace, options);
    });
};

exports.isPlatformSupported = MessageDistributor.isPlatformSupported;

exports.GCMMessage = require("./gcm/message").Message;
exports.APNSMessage = require("./apns/message").Message;