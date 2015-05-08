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
            log.debug("Successfully started GCM-Messageworker");
        } else {
            log.warn("GCM-Messageworker already running");
        }
        break;
    case "stop":
        if (isRunning()) {
            stopLoop();
            log.debug("Successfully stopped GCM-Messageworker");
        } else {
            log.debug("GCM-Messageworker isn't running");
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
    if (!mdist || mdist.getSchedulerId("gcm") == null) {
        return false;
    }
    return true;
};

function stopLoop() {
    clearInterval(mdist.getSchedulerId("gcm"));
    mdist.setSchedulerId("gcm", null);
    mdist.emit("gcmStopped");
};

/**
 * Start the worker-look if it isn't already running. Returns true on success.
 * @param instance the MessageDistributor-instance this worker is started for
 * @returns {Boolean} true if startup succeeded, false if already running
 */
function startLoop() {
    var myStatus = mdist.services.gcm;
    mdist.setSchedulerId("gcm", setInterval(function() {
        myStatus.queue.checkDelayedMessages();
        var el;
        while (el = myStatus.queue.shift()) try {
            process(el);
        } catch(e) {
            log.error("Error while processing gcm-message:", e);
        }
    }, 10));
    return;
};

/**
 * Process the given Message and emit events if the http-request
 * returns with a none-200-response.
 * - errorConnect if we were unable to connect (At the moment httpclient returns a 500 instead of raising an exception, so this doesn't work yet)
 * - error400 if GCM-Service was unable to parse the JSON we sent
 * - error401 if authentication failed. The instance will shut down then and an error-message will be logged
 * - error500 if GCM-Service has issues. the message will then be resheduled either because of retry-after-header or with exponential delay
 * Also emit events on the message:
 * - success if finished
 * - failed if message sending resulted in an error (not if registration_ids had errors)
 * @param el the Message to send
 */
function process(el) {
    var toResend = [];
    var error = false, resent = false;
    for each (var sendable in el.getSendableObjects()) {
        var result;
        try {
            if (mdist.options.testmode) {
                sendable.dry_run = true;
            }
            result = doSendMessage(sendable);
        } catch(e) {
            // FIXME: Due to the current behavior of httpclient we
            // won't get this exception and it will always return
            // a status 500.
            log.debug("Error while sending message to GCM-Server", e);
            var clone = el.clone();
            clone.addRecipients(el.recipients);
            mdist.sendMessage(clone);
            error = true;
            resent = true;
            mdist.emit("errorConnect", e);
            break;
        }
        if (result.status == 400) {
            if (!mdist.options.testmode) {
                log.error("GCM-server could not parse JSON or JSON contained invalid fields", el);
            }
            // chances are high that these fields are in the data-part of the message
            // so don't even try the other segments of this message
            mdist.emit("error400");
            el.emit("failed");
            error = true;
            break;
        } else if (result.status == 401) {
            // there is a problem with the configuration causing the request to be denied
            // because of a failed authentication. this will be the case for other messages too
            // (if one fails, the others will fail, too) and we stop the loop
            if (!mdist.options.testmode) {
                log.error("GCM-server was unable to authenticate the request. stopping this MessageDistributor", result.content);
            }
            mdist.emit("error401");
            el.emit("failed");
            stopLoop();
            error = true;
            break;
        } else if (result.status > 499 || result.status < 1) {
            // GCM-Servers do have some issues. look for a retry-after-header and re-add this to the gcm_queue

            // FIXME: if ther message has to be split up due to many recipients it may be possible
            //        that the first one gets delivered and a later one results in an error.
            //        This would lead to a retransmit of the delivered parts because the GcmMessage
            //        gets cloned and all recipients of this message are transfered to the clone.
            //        Possible workaround: one clone per sendable or remove recipients which have 
            //        been serviced successfully.

            var clone = el.clone();
            clone.addRecipients(el.recipients);
            if (result.exchange.headers && result.exchange.headers["Retry-After"]) {
                var retryAfter = result.exchange.headers["Retry-After"][0];
                var delay;
                if (isNaN(retryAfter)) {
                    var parsed = Date.parse(retryAfter);
                    if (isNaN(parsed)) {
                        log.error("Retry-After header found, but it wasn't a number and Date.parse returned NaN", retryAfter);
                    } else {
                        delay = Math.round((parsed - (new Date()).getTime()) / 1000);
                    }
                } else {
                    delay = parseInt(retryAfter, 10);
                }
                clone.delay = delay + Math.round(Math.random() * 10);
            }
            log.debug("GCM-Servers have issues -> rescheduling message", clone.delay);
            mdist.sendMessage(clone);
            mdist.emit("error500");
            error = true;
            resent = true;
            break;
        }
        handleResponse(result.content, sendable.registration_ids, toResend, el);
    }
    if (!error) {
        mdist.emit("messageSent");
        el.emit("success");
    } else {
        mdist.emit("failed", {resent: resent, message: el.getData()});
        el.emit("failed", {resent: resent, message: el.getData()});
    }
    if (toResend.length > 0) {
        var clone = el.clone();
        clone.addRecipients(toResend);
        mdist.sendMessage(clone);
        mdist.emit("messageRescheduled", toResend.length);
    }
};

/**
 * The pure http-request gets issued here.
 * @param message The ready-to-send message (a plain javascript object holding the post-parameters needed by the GCM-service)
 */
var doSendMessage = function(message) {
    var result;
    var params = {
            url: mdist.options.gcm.server,
            method: "POST",
            connectTimeout: mdist.connectTimeout,
            contentType: "application/json",
            headers: {"Authorization": "key=" + mdist.options.gcm.apiKey},
            data: JSON.stringify(message),
            success: function(content, status, contentType, exchange) {
                result = {
                    status: status,
                    content: content,
                    exchange: exchange
                };
                if (log.isDebugEnabled()) {
                    log.debug(JSON.stringify(result));
                }
                return;
            },
            error: function(message, status, exchange) {
                result = {
                    status: status,
                    message: message,
                    content: exchange.content,
                    exchange: exchange
                };
                return;
            }
    }
    httpclient.request(params);
    return result;
};

/**
 * Handles the response from the GCM-Service checks the error-counter and canonicalId counter.
 * If one of those is > 0 it loops over the result-records and emits events for the different possible
 * Situations.
 * Possible events:
 * - idChange (idOld, idNew) if the server responds with a canonicalId we have to replace idOld with idNew
 * - idUnregistered (id) if the app unregistered (app deinstalled for example) we should delete the id
 * - idUnhandledError (id, error) if the result is an unknown error
 * 
 * @param contentRaw
 * @param recipientIds
 * @param resend
 */
function handleResponse(contentRaw, recipientIds, resend, msgObject) {
    var content;
    try {
        content = JSON.parse(contentRaw);
    } catch (e) {
        log.error("Unable to parse JSON-Response: ", contentRaw, typeof(contentRaw), e);
        return;
    }
    if (content.failure == 0 && content.canonical_ids == 0) {
        // nothing to do, everything went fine
        return;
    }
    log.debug("processing request. failures:" , content.failure, "/ canonical_ids:", content.canonical_ids);
    for (var i = 0; content.results && i < content.results.length; i++) {
        var result = content.results[i];
        if (result.message_id != undefined && result.registration_id != undefined) {
            mdist.emit("idChange", recipientIds[i], result.registration_id, "gcm");
            msgObject.emit("idChange", recipientIds[i], result.registration_id);
            continue;
        }
        if (!result.error) {
            continue;
        }
        switch(result.error) {
        case "Unavailable":
            resend.push(recipientIds[i]);
            continue;
        case "NotRegistered":
            mdist.emit("idUnregistered", recipientIds[i], "gcm");
            msgObject.emit("idUnregistered", recipientIds[i]);
            continue;
        default:
            mdist.emit("idUnhandledError", recipientIds[i], result.error, "gcm");
            msgObject.emit("idUnhandledError", recipientIds[i], result.error);
            log.debug("Got error for id", result.registration_id, "which may be unrecoverable:", result.error);
        }
    }
    return;
};