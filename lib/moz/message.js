var arrays = require("ringo/utils/arrays");
var objects = require("ringo/utils/objects");
var {EventEmitter} = require("ringo/events");

var Message = exports.Message = function(data, options) {
    EventEmitter.call(this);
    this.messageObject = {
        data: typeof(data) == "object" ? data : {message: data}
    }
    this.options = options;
    this.recipients = [];
    this.createtime = new Date();
    this.delay = 0;
    if (!options) {
        return this;
    }
    for each (var prop in ["restricted_package_name", "collapse_key"]) {
        if (options[prop] == undefined) {
            continue;
        }
        this.messageObject[prop] = options[prop];
    }
    if (options.time_to_live != undefined) {
        this.setTtl(options.time_to_live);
    }
    if (options.recipients != undefined) {
        this.addRecipients(options.recipients);
    }
    if (!isNaN(options.delay)) {
        this.delay = options.delay;
    }
    return this;
};

Message.prototype.isSendable = function() {
    return this.recipients.length > 0;
};

Message.prototype.getServiceType = function() {
    return "moz";
};

Message.prototype.getDelay = function() {
    // add random amount of seconds to the delay to avoid flooding
    return this.delay > 0 ? this.delay + Math.round(Math.random() * 10) : 0;
};

Message.prototype.getData = function() {
    return this.messageObject.data;
};

/**
 * add the recipients in the given array to this MozMessage's recipients
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
 * set the time to live for this mozMessage. if the ttl has been reached and the
 * mozMessage has not been sent to moz-Servers it will not be sent. Otherwise the
 * createtime of this mozMessage-object will be taken to adjust the ttl for the
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
 * Returns the time-to-live of this mozMessage calculated by considering it's createtime
 */
Message.prototype.getTtl = function() {
    if (isNaN(this.ttl)) {
        return undefined;
    }
    var now = new Date();
    var diff = Math.round((now.getTime() - this.createtime.getTime()) / 1000);
    var ttl = this.ttl - diff;
    if (ttl < 1) {
        return -1;
    }
    return ttl;
};

/**
 * Set the number of retries to deliver this mozMessage.
 * @param nr the number of retries to deliver this mozMessage.
 */
Message.prototype.setRetries = function(nr) {
    if (isNaN(nr) || typeof(nr) != "number") {
        throw new Error("Retries has to be a number");
    } else if (nr < 1) {
        throw new Error("Dare to try it once! Retries has to be greater than 0");
    }
    this.retries = nr;
    return this;
};


/**
 * Creates a mozMessage carrying the same data as the original.
 *
 */
Message.prototype.clone = function() {
    var msg = new Message(this.messageObject.data, this.options);
    return msg;
};

/** @ignore */
Message.prototype.toString = function() {
    return "[mozMessage " + JSON.stringify(this.messageObject) + "]";
};