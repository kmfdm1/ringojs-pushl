var {MessageQueue} = require("./messagequeue");
var {Worker} = require("ringo/worker");
var log = require("ringo/logging").getLogger(module.id);
var {EventEmitter} = require("ringo/events");
var objects = require("ringo/utils/objects");
var {Semaphore} = require("ringo/concurrent");

var timeout = 10000;

/**
 * @param {String} namespace unique namespace
 * @param {Object} options an Object with the following properties:
 *      * connectTimeout in milliseconds, default 1000
 *      * testmode boolean
 *
 */
var MessageDistributor = exports.MessageDistributor = function(namespace, options) {
    this.options = options || {};
    this.services = {};
    this.namespace = namespace;
    var error = false;
    var sema = this.sema = new Semaphore(0);

    var servicesToStart = 0;
    // initialize the services
    for each (let service in MessageDistributor.implementedServices) {
        if (!options[service]) {
            log.info("Skipping unconfigured service:", service);
            continue;
        } else {
           log.info("Starting service", service);
        }
        servicesToStart++;
        var handler = this.services[service] = {
                worker: new Worker(module.resolve("./" + service + "/messageworker")),
                queue: new MessageQueue(namespace),
                schedulerId: null
        };

        var conf = objects.merge(
            this.options[service] || {},
            MessageDistributor.serviceEssentials[service].config.defaults[this.options.testmode ? "testmode": "production"]
        );
        MessageDistributor.serviceEssentials[service].config.check(conf);

        handler.worker.postMessage({cmd: "init", mdist: this, config: conf, success: function() {
            sema.signal();
        }, error: function() {
            error = true;
            sema.signal();
        }});
    }

    log.info("Waiting for", servicesToStart, "services");
    // wait for services to be initialized
    if (!sema.tryWait(timeout, servicesToStart)) {
        throw new Error("timeout while initialising services");
    }
    if (error) {
        throw new Error("error while initializing services. check log for details");
    }

    this.connectTimeout = this.options.connectTimeout || 1000;
    EventEmitter.call(this);
    return this;
};

MessageDistributor.serviceEssentials = {};
MessageDistributor.implementedServices = ["gcm", "apns", "moz"];

MessageDistributor.isPlatformSupported = function(plattform) {
    return MessageDistributor.implementedServices.indexOf(plattform) != -1;
};

MessageDistributor.prototype.start = function() {
    for each (var service in this.services) {
        service.worker.postMessage({"cmd": "start"});
    }
    if (!this.waitForAll("running")) {
        try {
            this.stop();
        } catch (e) {
            throw new Error("Timeout while startup - unable to shutdown already started services");
        }
        throw new Error("Timeout while startup - already started services have been stopped");
    }
    return this;
};

MessageDistributor.prototype.stop = function() {
    for each (var service in this.services) {
        service.worker.postMessage({"cmd": "stop"});
    }
    if (!this.waitForAll("stopped")) {
        throw new Error("Timeout while stopping services");
    }
    return this;
};

MessageDistributor.prototype.waitForAll = function(state) {
    var allDone = this.status().all == state;
    for (let i = 0; i < 100 && !allDone; i++) {
        java.lang.Thread.sleep(timeout/100);
        allDone = this.status().all == state;
    }
    return allDone;
};

MessageDistributor.prototype.createMessage = function(plattform, message, options) {
    log.info("createMessage for platform", plattform);
    return new MessageDistributor.serviceEssentials[plattform].messagePrototype(message, options);
};

MessageDistributor.prototype.status = function() {
    var result = {};
    for (var serviceKey in this.services) {
        var schedulerId = this.services[serviceKey].schedulerId;
        var status = schedulerId ? "running" : "stopped";
        result[serviceKey] = status;
        if (result.all == undefined) {
            result.all = status;
        } else if (result.all != status) {
            result.all = "mixed";
        }
    };
    return result;
}

MessageDistributor.prototype.getSchedulerId = function(srvc) {
    return this.services[srvc].schedulerId;
};

MessageDistributor.prototype.setSchedulerId = function(srvc, schedulerId) {
    this.services[srvc].schedulerId = schedulerId;
    return this;
};

MessageDistributor.prototype.sendMessage = function(message) {
    if (!message.isSendable()) {
        throw new Error("Message is missing something", message);
    }
    var svc = this.services[message.getServiceType()];
    if (!svc) {
        log.warn("Tryed to send message for unconfigured service", message.getServiceType());
        return this;
    }
    svc.queue.add(message, message.getDelay());
    return this;
};


for each (let service in MessageDistributor.implementedServices) {
    MessageDistributor.serviceEssentials[service] = {
            config: require("./" + service + "/config"),
            messagePrototype: require("./" + service + "/message").Message
    }
}
