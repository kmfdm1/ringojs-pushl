var assert = require("assert");
var system = require("system");
var {MessageQueue} = require("../lib/messagequeue");

exports.testCreate = function() {
     var mq = new MessageQueue("namespace");
     assert.equal(mq.namespace, "namespace");
};

exports.testAdd = function() {
    var mq = new MessageQueue("namespace");
    assert.equal(mq.sendable(), 0);
    mq.add("something");
    assert.equal(mq.sendable(), 1);
    mq.add("somethingElse", 1);
    assert.equal(mq.sendable(), 1);
    assert.equal(mq.queued(), 1);
    assert.equal(mq.total(), 2);
};

exports.testShift = function() {
    var mq = new MessageQueue("namespace");
    mq.add("something");
    assert.equal(mq.sendable(), 1);
    assert.equal(mq.shift(), "something");
    assert.equal(mq.sendable(), 0);
};

exports.testCheckDelayedMessages = function() {
    var mq = new MessageQueue("namespace");
    mq.add("something", 1);
    assert.equal(mq.sendable(), 0);
    assert.equal(mq.checkDelayedMessages(), 0);
    assert.equal(mq.sendable(), 0);
    assert.equal(mq.queued(), 1);
    try {
        java.lang.Thread.sleep(1001);
    } catch(e) {}
    assert.equal(mq.checkDelayedMessages(), 1);
    assert.equal(mq.sendable(), 1);
    assert.equal(mq.queued(), 0);
};