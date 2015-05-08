var assert = require("assert");
var system = require("system");
var {DelayQueue} = require("../lib/delayqueue");

exports.setUp = function() {
};

exports.tearDown = function() {
};

exports.testAddAndSize = function() {
    var dq = new DelayQueue();
    assert.strictEqual(dq.size(), 0);
    dq.add("whatever", 10);
    assert.strictEqual(dq.size(), 1);
    dq.add("whatever", 10);
    assert.strictEqual(dq.size(), 2);
};

exports.testPoll = function() {
    var dq = new DelayQueue();
    var val = "whatever";
    dq.add(val, 1);
    assert.strictEqual(dq.poll(), null);
    try {
        java.lang.Thread.sleep(500);
    } catch(e) {}
    assert.strictEqual(dq.poll(), null);
    try {
        java.lang.Thread.sleep(501);
    } catch(e) {}
    assert.strictEqual(dq.poll(), val);
};

exports.testTimeToNextReady = function() {
    var dq = new DelayQueue();
    assert.isTrue(dq.timeToNextReady() === undefined);
    dq.add("whatever", 20);
    assert.isTrue(dq.timeToNextReady() > 19900);
    dq.add("whatever", 10);
    assert.isTrue(dq.timeToNextReady() > 9900);
};