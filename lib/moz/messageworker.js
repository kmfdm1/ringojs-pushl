var httpclient = require("ringo/httpclient");
var log = require("ringo/logging").getLogger(module.id);

var mdist = null;
var options = null;

/**
 * Post a message to the worker to first init the worker and then post
 * another message to start/stop processing the queue
 * @param event
 */
function onmessage(msg) {
    switch(msg.data.cmd) {
    case "start":
        if (!isRunning()) {
            startLoop();
            log.debug("Successfully started MOZ-Messageworker");
        } else {
            log.warn("MOZ-Messageworker already running");
        }
        break;
    case "stop":
        if (isRunning()) {
            stopLoop();
            log.debug("Successfully stopped MOZ-Messageworker");
        } else {
            log.debug("MOZ-Messageworker isn't running");
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
        msg.data.success();
        break;
    default:
        log.warn("Unknown command", msg.data.cmd);
        break;
    }
    return;
};

function isRunning() {
    if (!mdist || mdist.getSchedulerId("moz") == null) {
        return false;
    }
    return true;
};

function stopLoop() {
    clearInterval(mdist.getSchedulerId("moz"));
    mdist.setSchedulerId("moz", null);
    mdist.emit("mozStopped");
};

/**
 * Start the worker-look if it isn't already running. Returns true on success.
 * @param instance the MessageDistributor-instance this worker is started for
 * @returns {Boolean} true if startup succeeded, false if already running
 */
function startLoop() {
    var myStatus = mdist.services.moz;
    mdist.setSchedulerId("moz", setInterval(function() {
        myStatus.queue.checkDelayedMessages();
        var el;
        while (el = myStatus.queue.shift()) try {
            process(el);
        } catch(e) {
            log.error("Error while processing moz-message:", e);
        }
    }, 10));
    return;
};

/**
 * Process the given Message and emit events if the http-request
 * returns with a none-200-response.
 * Also emit events on the message:
 * - success if finished
 * - failed if message sending resulted in an error (not if registration_ids had errors)
 * @param el the Message to send
 */
function process(el) {
    var toResend = [];
    el.recipients.forEach(function(subscriptionId) {
        var result = sendMessage(subscriptionId);
        // see detailed error codes here
        // https://github.com/mozilla-services/autopush/blob/9d88becce0ab0649855db295069c0c96ad2439d7/autopush/endpoint.py#L31
        if (result.status != 201) {
            var jsonResponse = JSON.parse(result.content);
            log.debug("Error while sending message to moz-Server", jsonResponse.errno, jsonResponse.message);
            mdist.emit("failed");
            el.emit("failed");
            if (result.status === 503) {
                // service temporarily unavailable due to high load
                if (jsonResponse.errno == 503 || jsonResponse.errno == 202) {
                    toResend.push(subscriptionId);
                }
            }
        } else {
            mdist.emit("messageSent");
            el.emit("success");
        }
    });
    if (toResend.length > 0) {
        var clone = el.clone();
        clone.delay = 10 + Math.random() * 20;
        clone.addRecipients(toResend);
        mdist.sendMessage(clone);
        mdist.emit("messageRescheduled", toResend.length);
    }
};

/**
 * The pure http-request gets issued here.
 * @param subscriptionId subscriptionId to which the empty message is sent
 */
var sendMessage = function(subscriptionId) {
    return httpclient.request({
        url: options.server + subscriptionId,
        method: "POST",
        connectTimeout: options.connectTimeout,
        contentType: "application/json",
        // @@ TODO: data must be encrypted see
        // https://github.com/marco-c/web-push/blob/master/index.js#L51
        //data: JSON.stringify(message),
    });
};
