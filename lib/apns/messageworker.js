var {Pushmanager, ApnsEnvironment, PushManagerConfiguration} = com.relayrides.pushy.apns;
var {SSLContextUtil} = com.relayrides.pushy.apns.util;
var log = require("ringo/logging").getLogger(module.id);

var mdist = null;
var options = null;
var status = {};

/**
 * Post a message to the worker to first init the worker and then post
 * another message to start/stop processing the queue
 * @param msg
 */
function onmessage(msg) {
    switch(msg.data.cmd) {
    case "start":
        if (!isRunning()) {
            startLoop();
            log.debug("Successfully started APNS-Messageworker");
        } else {
            log.warn("APNS-Messageworker already running");
        }
        break;
    case "stop":
        if (isRunning()) {
            stopLoop();
            log.debug("Successfully stopped APNS-Messageworker");
        } else {
            log.debug("APNS-Messageworker isn't running");
        }
        break;
    case "init":
        if (msg.data.mdist === undefined || msg.data.mdist === null) {
            log.error("unable to start messageworker without messagedistributor");
            msg.data.error();
            return;
        } else if (msg.data.config === undefined || msg.data.config == null) {
            log.error("unable to start messageworker without config");
            msg.data.error();
            return;
        }
        options = msg.data.config;
        mdist = msg.data.mdist;
        try {
            init();
        } catch(e) {
            log.error("exception while initializing apns-service", e);
            msg.data.error();
            break;
        }
        msg.data.success();
        break;
    default:
        log.warn("Unknown command", msg.data.cmd);
        break;
    }
    return;
};

function isRunning() {
    if (!mdist || mdist.getSchedulerId("apns") == null) {
        return false;
    }
    if (!status.service) {
        return false;
    }
    return true;
};

function init() {
    var env = mdist.options.testmode ?
            ApnsEnvironment.getSandboxEnvironment() :
            ApnsEnvironment.getProductionEnvironment();
    status.manager = new PushManager(
            env,
            SSLContextUtil.createDefaultSSLContext(options.certificate.path, options.certificate.password),
            null,
            null,
            null,
            new PushManagerConfiguration(),
            mdist.namespace);
};

function startLoop() {
    var myStatus = mdist.services.apns;
    status.manager.start();
    mdist.setSchedulerId("apns", setInterval(function() {
        myStatus.queue.checkDelayedMessages();
        var el;
        while (el = myStatus.queue.shift()) try {
            process(el);
        } catch(e) {
            log.error("Error while processing apns-message:", e);
        }
    }, 100));
    return true;
};

function stopLoop() {
    clearInterval(mdist.getSchedulerId("apns"));
    mdist.setSchedulerId("apns", null);
    try {
        status.manager.shutdown();
        mdist.emit("apnsStopped");
    } catch (e) {
        log.error("Exception while stopping PushManager", e);
        mdist.emit("apnsStopError", e);
    }
};

function process(el) {
    var pl = el.getPayload();
    var ttl = el.getTtl();
    var recipients = el.recipients.length > 1 ? el.recipients : el.recipients[0];
    if (ttl != undefined) {
        var d = new Date();
        d.setSeconds(d.getSeconds() + ttl);
        status.service.push(recipients, pl, d);
    } else {
        status.service.push(recipients, pl);
    }
};
