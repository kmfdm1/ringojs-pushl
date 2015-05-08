var assert = require("assert");
var system = require("system");
var {Message} = require("../lib/gcm/message");

var rids = [];
for (var i = 0; i < 1001; i++) {
    rids.push("recipient"+i);
}

var messages = {
        normal: undefined,
        withRecipients: {recipients: ["horst"]},
        withDelayWhileIdle: {delay_while_idle: true},
        withDryRun: {dry_run: true},
        withTimeToLive: {time_to_live: 10},
        withDelay: {delay: 10},
        withAll: {recipients: ["horst"], delay_while_idle: true, dry_run: true, time_to_live: 10, delay: 10 },
        with1001: {recipients: rids, delay_while_idle: true, dry_run: true, time_to_live: 10, delay: 10 }
};
var messageData = {message: "daMessage"};


exports.setUp = function() {
};

exports.tearDown = function() {
};

exports.testCreate = function() {
    try {
        var m = new Message();
        assert.fail({message: "Message without data constructed", expected: "error", actual: "invalid message object"});
    } catch(e) {}
    
    var m = new Message(messageData);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], undefined);
    assert.equal(m.ttl, undefined);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, undefined);
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.equal(m.delay, 0);
    var m = new Message(messageData, messages.withRecipients);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], "horst");
    assert.equal(m.ttl, undefined);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, undefined);
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.equal(m.delay, 0);
    var m = new Message(messageData, messages.withDelayWhileIdle);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], undefined);
    assert.equal(m.ttl, undefined);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, undefined);
    assert.equal(m.messageObject.delay_while_idle, true);
    assert.equal(m.delay, 0);
    var m = new Message(messageData, messages.withDryRun);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], undefined);
    assert.equal(m.ttl, undefined);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, true);
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.equal(m.delay, 0);
    var m = new Message(messageData, messages.withTimeToLive);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], undefined);
    assert.equal(m.ttl, 10);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, undefined);
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.equal(m.delay, 0);
    var m = new Message(messageData, messages.withDelay);
    assert.equal(m.messageObject.data, messageData);
    assert.equal(m.recipients[0], undefined);
    assert.equal(m.ttl, undefined);
    assert.equal(m.retries, undefined);
    assert.equal(m.messageObject.dry_run, undefined);
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.equal(m.delay, 10);
};

var wrap = function(thisObj, func, params) {
    return function() {
        func.apply(thisObj, params);
    };
};

exports.testAddRecipients = function() {
    var m = new Message(messageData, messages.normal);
    assert.throws(m.addRecipients);
    assert.throws(wrap(m, m.addRecipients, ["whatever"]));
    assert.throws(wrap(m, m.addRecipients, [[]]));
    assert.strictEqual(m.addRecipients(["asldkfjaslödfjk"]), m);
    assert.equal(m.recipients[0], "asldkfjaslödfjk");
};

exports.testGetSetTtl = function() {
    var m = new Message(messageData, messages.normal);
    assert.equal(m.getTtl(), undefined);
    assert.throws(wrap(m, m.setTtl, [undefined]));
    assert.throws(wrap(m, m.setTtl, ["1"]));
    assert.throws(wrap(m, m.setTtl, [0]));
    assert.throws(wrap(m, m.setTtl, [2419201]));
    assert.strictEqual(m.setTtl(2), m);
    assert.equal(m.ttl, 2);
    var diff = m.ttl - Math.round(((new Date()).getTime() - m.createtime.getTime()) / 1000)
    assert.equal(m.getTtl(), diff);
    try {
        java.lang.Thread.sleep(1000);
    } catch(e) {}
    assert.isTrue(m.getTtl() < 2);
    try {
        java.lang.Thread.sleep(1000);
    } catch(e) {}
    assert.equal(m.getTtl(), -1);
};

exports.testSetRetries = function() {
    var m = new Message(messageData, messages.normal);
    assert.throws(wrap(m, m.setRetries, [undefined]));
    assert.throws(wrap(m, m.setRetries, ["1"]));
    assert.throws(wrap(m, m.setRetries, [0]));
    assert.strictEqual(m.setRetries(1), m);
    assert.equal(m.retries, 1);
};

exports.testDryRun = function() {
    var m = new Message(messageData, messages.normal);
    assert.throws(wrap(m, m.dryRun, [undefined]));
    assert.equal(m.messageObject.dry_run, undefined);
    assert.strictEqual(m.dryRun(true), m);
    assert.equal(m.messageObject.dry_run, true);
    assert.strictEqual(m.dryRun(false), m);
    assert.equal(m.messageObject.dry_run, false);
};

exports.testDelayWhileIdle = function() {
    var m = new Message(messageData, messages.normal);
    assert.throws(wrap(m, m.delayWhileIdle, [undefined]));
    assert.equal(m.messageObject.delay_while_idle, undefined);
    assert.strictEqual(m.delayWhileIdle(true), m);
    assert.equal(m.messageObject.delay_while_idle, true);
    assert.strictEqual(m.delayWhileIdle(false), m);
    assert.equal(m.messageObject.delay_while_idle, false);
};

exports.testGetSendableObjects = function() {
    var m = new Message(messageData, messages.withAll);
    var ttl = m.getTtl();
    var sendables = m.getSendableObjects();
    assert.equal(sendables.length, 1);
    assert.deepEqual(sendables[0], {
        data: messageData,
        delay_while_idle: true,
        dry_run: true,
        time_to_live: ttl,
        registration_ids: messages.withAll.recipients
    });
    var m = new Message(messageData, messages.with1001);
    var ttl = m.getTtl();
    var sendables = m.getSendableObjects();
    assert.equal(sendables.length, 2);
    assert.deepEqual(sendables[0], {
        data: messageData,
        delay_while_idle: true,
        dry_run: true,
        time_to_live: ttl,
        registration_ids: rids.slice(0, 1000)
    });
    assert.deepEqual(sendables[1], {
        data: messageData,
        delay_while_idle: true,
        dry_run: true,
        time_to_live: ttl,
        registration_ids: rids.slice(1000)
    });
};

exports.testCloneNormal = function() {
    var m = new Message(messageData, messages.normal);
    var clone = m.clone();
    assert.deepEqual(clone.messageObject.data, m.messageObject.data);
    assert.equal(clone.recipients.length, 0);
    assert.equal(clone.delay, 1);
};

exports.testCloneRetries = function() {
    var m = new Message(messageData, messages.normal);
    m.setRetries(2);
    var clone = m.clone();
    assert.deepEqual(clone.data, m.data);
    assert.equal(clone.recipients.length, 0);
    assert.equal(clone.delay, 1);
    assert.equal(clone.retries, 1);
    assert.equal(clone.clone(), undefined);
};

exports.testCloneTtl = function() {
    var m = new Message(messageData, messages.normal);
    m.setTtl(2);
    var clone = m.clone();
    assert.equal(clone.getTtl(), m.getTtl());
    try {
        java.lang.Thread.sleep(1000);
    } catch(e) {}
    clone = m.clone();
    // if ttl has been reached a call to clone should
    // return undefined
    // ttl = ttl - delay 
    assert.equal(clone, undefined);
};

exports.testCloneDelay = function() {
    var m = new Message(messageData, messages.normal);
    var clone = m.clone();
    assert.equal(clone.delay, 1);
    var clone = clone.clone();
    assert.equal(clone.delay, 2);
    var clone = clone.clone();
    assert.equal(clone.delay, 4);
};
