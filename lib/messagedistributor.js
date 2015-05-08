var {MessageQueue} = require("./messagequeue");
var {Worker} = require("ringo/worker");
var log = require("ringo/logging").getLogger(module.id);
var {EventEmitter} = require("ringo/events");
var objects = require("ringo/utils/objects");
var {Semaphore} = require("ringo/concurrent");

var timeout = 10000;

var MessageDistributor = exports.MessageDistributor = function(namespace, options) {
    this.options = options || {};
    this.services = {};
    this.namespace = namespace;
    var error = false;
    var sema = this.sema = new Semaphore(0);

    // initialize the services
    for each (let service in MessageDistributor.implementedServices) {
        var handler = this.services[service] = {
                worker: new Worker(module.resolve("./" + service + "/messageworker")),
                queue: new MessageQueue(namespace),
                schedulerId: null
        };

        var conf = objects.merge(
                this.options[service] || {}, MessageDistributor.serviceEssentials[service].config.defaults[this.options.testmode ? "production" : "testmode"]
        );
        MessageDistributor.serviceEssentials[service].config.check(conf);
        
        handler.worker.postMessage({cmd: "init", mdist: this, config: conf, success: function() {
            sema.signal();
        }, error: function() {
            error = true;
            sema.signal();
        }});
    }
    
    // wait for services to be initialized
    if (!sema.tryWait(timeout, MessageDistributor.implementedServices.length)) {
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
MessageDistributor.implementedServices = ["gcm"];

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

MessageDistributor.prototype.isPlattformSupported = function(plattform) {
    return MessageDistributor.implementedServices.indexOf(plattform) != -1;
};

MessageDistributor.prototype.createMessage = function(plattform, message, options) {
    return new MessageDistributor.serviceEssentials[plattform].messagePrototype(message, options);
};

MessageDistributor.prototype.status = function() {
    var result = {};
    for (var serviceKey in this.services) {
        var schedulerId = this.services[serviceKey].schedulerId;
        var status = schedulerId && !schedulerId.isDone() ? "running" : "stopped";
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
        throw new Error("Message is  missing something", message);
    }
    this.services[message.getServiceType()].queue.add(message, message.getDelay());
    return this;
};


for each (let service in MessageDistributor.implementedServices) {
    MessageDistributor.serviceEssentials[service] = {
            config: require("./" + service + "/config"),
            messagePrototype: require("./" + service + "/message").Message
    }
//    serviceConf[service] = require("./" + service + "/config");
//    messagePrototypes[service] = require("./" + service + "/message").Message;
}
