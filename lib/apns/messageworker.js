var {PushManager, ApnsEnvironment, PushManagerConfiguration} = com.relayrides.pushy.apns;
var {SSLContextUtil, TokenUtil, SimpleApnsPushNotification} = com.relayrides.pushy.apns.util;
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
    if (!status.manager) {
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
    status.manager.registerRejectedNotificationListener(rejectedNotificationListener);
    status.manager.registerExpiredTokenListener(expiredTokenListener);
};

var startRequestExpiredTokens = function(manager) {
    manager.requestExpiredTokens();
    status.feedbackTimeoutId = setTimeout(startRequestExpiredTokens, 86400000, status.manager);
};

var expiredTokenListener = new com.relayrides.pushy.apns.ExpiredTokenListener(
        function(pm, expTokenCollection) {
            for(var i = expTokenCollection.iterator(); i.hasNext(); ) {
                var tok = i.next();
                mdist.emit("idUnregistered", tok.getToken(), "apns");
            }
        });

var rejectedNotificationListener = new com.relayrides.pushy.apns.RejectedNotificationListener(
    function rejectedNotificationListener (pm, notification, reason) {
        switch(reason.getErrorCode()) {
        case reason.INVALID_PAYLOAD_SIZE:
            log.error("Payload size too big");
            break;
        case reason.INVALID_TOKEN:
        case reason.INVALID_TOKEN_SIZE:
            log.error("Token invalid or invalid token size", notification.getToken());
            break;
        case reason.INVALID_TOPIC_SIZE:
            log.error("Invalid topic size");
            break;
        case reason.MISSING_PAYLOAD:
            log.error("Missing Payload"); // should never happen
            break;
        case reason.MISSING_TOKEN:
            log.error("Missing Token"); // should never happen
            break;
        case reason.NO_ERROR:
            log.error("Failed without reason?");
            break;
        case reason.PROCESSING_ERROR:
            log.error("Processing error");
            break;
        case reason.SHUTDOWN:
            log.error("Shutdown in progress (maintainance?)");
            break;
        case reason.UNKNOWN:
        default:
            log.error("unknown error");
        }
    });

function startLoop() {
    var myStatus = mdist.services.apns;
    status.manager.start();
    startRequestExpiredTokens(status.manager);
    mdist.setSchedulerId("apns", setInterval(function() {
        myStatus.queue.checkDelayedMessages();
        var el;
        while (el = myStatus.queue.shift()) try {
            process(el);
        } catch(e) {
            log.error("Error while processing apns-message:", e);
        }
    }, 33));
    mdist.emit("apnsStarted");
    return true;
};

function stopLoop() {
    clearInterval(mdist.getSchedulerId("apns"));
    mdist.setSchedulerId("apns", null);
    try {
        status.manager.shutdown();
        clearTimeout(status.feedbackTimeoutId);
        mdist.emit("apnsStopped");
    } catch (e) {
        log.error("Exception while stopping PushManager", e);
        mdist.emit("apnsStopError", e);
    }
};

function process(el) {
    var pl = el.getPayload().buildWithDefaultMaximumLength();
    var ttl = el.getTtl();
    for each (var recipient in el.recipients) try {
        status.manager.getQueue().put(new SimpleApnsPushNotification(TokenUtil.tokenStringToByteArray(recipient), pl));
    } catch (e) {
        log.error("failed", e);
    }
};
