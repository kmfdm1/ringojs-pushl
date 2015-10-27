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
    if (options.delay_while_idle != undefined) {
        this.delayWhileIdle(options.delay_while_idle);
    }
    if (options.dry_run != undefined) {
        this.dryRun(options.dry_run);
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
    return "gcm";
};

Message.prototype.getDelay = function() {
    // add random amount of seconds to the delay to avoid flooding
    return this.delay > 0 ? this.delay + Math.round(Math.random() * 10) : 0;
};

Message.prototype.getData = function() {
    return this.messageObject.data;
};

/**
 * add the recipients in the given array to this GCMMessage's recipients
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
 * set the time to live for this GCMMessage. if the ttl has been reached and the
 * GCMMessage has not been sent to GCM-Servers it will not be sent. Otherwise the
 * createtime of this GCMMessage-object will be taken to adjust the ttl for the
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
 * Returns the time-to-live of this GCMMessage calculated by considering it's createtime
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
 * Set the number of retries to deliver this GCMMessage.
 * @param nr the number of retries to deliver this GCMMessage.
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
 * Mark this GCMMessage as "dry run" meaning ther won't be sent anything to any client,
 * but the request to GCM-Servers will be handled as if it would.
 * See https://developer.android.com/google/gcm/server.html
 * "If included, allows developers to test their request without actually sending a 
 * GCMMessage. Optional. The default value is false, and must be a JSON boolean."
 * @param bool boolean true if this GCMMessage should be treated as test-message
 */
Message.prototype.dryRun = function(bool) {
    if (typeof(bool) != "boolean") {
        throw new Error("dry_run has to be a boolean");
    }
    this.messageObject.dry_run = bool;
    return this;
};

/**
 * See https://developer.android.com/google/gcm/server.html
 * "If included, indicates that the message should not be sent immediately if the device is idle. 
 * The server will wait for the device to become active, and then only the last message for each 
 * collapse_key value will be sent. The default value is false, and must be a JSON boolean. Optional."
 */
Message.prototype.delayWhileIdle = function(bool) {
    if (typeof(bool) != "boolean") {
        throw new Error("delay_while_idle has to be a boolean");
    }
    this.messageObject.delay_while_idle = bool;
    return this;
};

/**
 * Returns an array holding objects ready to use for GCM-http-api.
 */
Message.prototype.getSendableObjects = function() {
    var result = [];
    var message = objects.clone(this.messageObject, {}, true);
    var ttl = this.getTtl();
    if (ttl) {
        message.time_to_live = ttl;
    }
    for (var i = 0; i < this.recipients.length; i+=1000) {
        var msg = objects.clone(message, {}, true);
        msg.registration_ids = this.recipients.slice(i, Math.min(i+1000, this.recipients.length));
        result.push(msg);
    }
    return result;
};

/**
 * Creates a GCMMessage carrying the same data as the origin.
 *  
 * The delay of the GCMMessage will be set to double the amount of seconds of the 
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
    var msg = new Message(this.messageObject.data, this.options);
    msg.delay = Math.max(1, this.delay * 2);
    if (this.getTtl() != undefined) {
        if (msg.delay >= this.getTtl()) {
            return undefined;
        }
        msg.setTtl(this.getTtl());
    }
    if (this.retries != undefined) {
        var retries = this.retries -1;
        if (retries < 1) {
            return undefined;
        }
        msg.setRetries(retries);
    }
    return msg;
};

/** @ignore */
Message.prototype.toString = function() {
    return "[GCMMessage " + JSON.stringify(this.messageObject) + "]";
};