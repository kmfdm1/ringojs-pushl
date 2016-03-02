var arrays = require("ringo/utils/arrays");
var objects = require("ringo/utils/objects");
var {ApnsPayloadBuilder} = com.relayrides.pushy.apns.util;
var {EventEmitter} = require("ringo/events");

var Message = exports.Message = function(data, options) {
    var options = options || {};
    if (!data) {
        throw new Error("Unable to construct APNSMessage without data");
    }
    EventEmitter.call(this);
    if (data instanceof ApnsPayloadBuilder) {
        this.payload = data;
    } else {
        this.payload = new ApnsPayloadBuilder();
        if (data && typeof(data) != "object") {
            this.payload.addCustomProperty("message", data);
        } else if (data) {
            for (let prop in data) {
                switch (prop) {
                case "alertBody":
                    this.payload.setAlertBody(data.alertBody);
                    break;
                case "alertTitle":
                    this.payload.setAlertTitle(data.alertTitle); // title only shows on apple-watch atm
                    break;
                case "badgenumber":
                    this.payload.setBadgeNumber(parseInt(data.badgenumber,10));
                    break;
                case "categoryName":
                    this.payload.setCategoryName(data.category);
                    break;
                case "launchImageFileName":
                    this.payload.setLaunchImageFileName(data.launchImageFileName);
                    break;
                case "localizedActionButtonKey":
                    this.payload.setLocalizedActionButtonKey(data.localizedActionButtonKey);
                    break;
                case "localizedAlertMessage":
                    this.payload.setLocalizedAlertMessage(data.localizedAlertMessage.key, data.localizedAlertMessage.arguments);
                    break;
                case "localizedAlertTitle":
                    this.payload.setLocalizedAlertMessage(data.localizedAlertTitle.key, data.localizedAlertTitle.arguments);
                    break;
                case "soundFileName":
                    this.payload.setSoundFileName(data.soundFileName);
                    break;
                default:
                    this.payload.addCustomProperty(prop, data[prop]);
                    break;
                }
            }
        }
    }
    
    this.options = options;
    if (options.soundFileName) {
        this.payload.setSoundFileName(options.soundFileName);
    }
    if (options.contentAvailable) {
        this.payload.setContentAvailable(true);
    }
    if (options.showActionButton) {
        this.payload.setShowActionButton(true);
    }
    this.recipients = [];
    if (options.time_to_live != undefined) {
        this.setTtl(options.time_to_live);
    }
    if (options.recipients != undefined) {
        this.addRecipients(options.recipients);
    }
    this.delay = options.delay || 0;
    this.createtime = new Date();
    return this;
};

Message.prototype.isSendable = function() {
    return this.recipients.length > 0;
};

Message.prototype.getServiceType = function() {
    return "apns";
}

Message.prototype.getDelay = function() {
    // add random amount of seconds to the delay to avoid flooding
    return this.delay > 0 ? this.delay + Math.round(Math.random() * 10) : 0;
};

Message.prototype.getPayload = function() {
    return this.payload;
};

/**
 * add the recipients in the given array to this APNSMessage's recipients
 * avoiding duplicates.
 * @param recipients array of recipients
 */
Message.prototype.addRecipients = function(recipients) {
    if (!Array.isArray(recipients)) {
        throw new Error("addRecipients expects an array ");
    } else if (recipients.length < 1) {
        throw new Error("addRecipeints called with empty array");
    }
    this.recipients = arrays.union(this.recipients, recipients);
    return this;
};

/**
 * set the time to live for this APNSMessage. if the ttl has been reached and the
 * APNSMessage has not been sent to APNS-Servers it will not be sent. Otherwise the
 * createtime of this APNSMessage-object will be taken to adjust the ttl for the
 * difference betweene actual sending and the creation.
 * @param ttl number of seconds after which there won't be a retry to deliver it to the client
 */
Message.prototype.setTtl = function(ttl) {
    if (isNaN(ttl) || typeof(ttl) != "number") {
        throw new Error("time_to_live has to be a number");
    }
    if (ttl < 1) {
        throw new Error("time_to_live must be a positive number greater than zero");
    }
    if (ttl > 2419200) {
        throw new Error("time_to_live must be lower than 2419200 (4 weeks)");
    }
    this.ttl = ttl;
    return this;
};

/**
 * Returns the time-to-live of this APNSMessage calculated by considering it's createtime
 */
Message.prototype.getTtl = function() {
    if (isNaN(this.ttl)) {
        return undefined;
    }
    var now = new Date();
    var diff = Math.round((now.getTime() - this.createtime.getTime()) / 1000);
    var ttl = this.ttl - diff;
    if (ttl < 1) {
        return undefined;
    }
    return ttl;
};

/**
 * Creates a APNSMessage carrying the same data as the origin.
 *  
 * The delay of the APNSMessage will be set to double the amount of seconds of the 
 * origin message, but at least one second. (as demanded by google)
 * 
 * Afterwards the remaining time_to_live will be calculated as follows:
 * origin.ttl - timediffInSeconds(origin.createtime, now)
 * 
 * If the resulting ttl is lower than the delay it will return undefined 
 * indicating the expiry of this message.
 * 
 * Afterwards the retries will be reduced by one and if this results in zero 
 * retries it will return undefined indicating the expiry of this message.
 */
Message.prototype.clone = function() {
    var msg = new Message(this.payload);
    msg.delay = Math.max(1, this.delay * 2);
    if (this.getTtl() != undefined) {
        if (msg.delay >= this.getTtl()) {
            return undefined;
        }
        msg.setTtl(this.getTtl());
    }
    return msg;
};

/** @ignore */
Message.prototype.toString = function() {
    return "[APNSMessage " + this.payload.buildWithDefaultMaximumLength() + "]";
};