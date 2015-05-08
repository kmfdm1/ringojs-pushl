var {DelayQueue} = require("./delayqueue");
var {Semaphore} = require("ringo/concurrent");

/**
 * A messagequeue holding sendable messages and delayedMessages.
 * It provides functions to add new messages, move delayed messages
 * into the sendable messages-queue when their delay has been reached
 * and one to retrieve the next sendable message.
 * It also provides a sync-function which will use the internal
 * semaphore to sync access to the queue
 */
var MessageQueue = exports.MessageQueue = function(namespace) {
    this.namespace = namespace;
    this.sendableMessages = [];
    this.delayedMessages = new DelayQueue();
    this.sema = new Semaphore(1);
};

/**
 * Add a message to either sendableMessages if no delay has been given
 * or to the delayedMessages-queue otherwise.
 * @param message the message to add to the queue
 * @param delay the delay for this message
 * @param timeout the timeout used when waiting for the next free permit of the semaphore
 */
MessageQueue.prototype.add = function(message, delay, timeout) {
    if (delay && !isNaN(delay) && delay > 0) {
        this.sync(timeout);
        try {
            this.delayedMessages.add(message, delay);
        } finally {
            this.sema.signal();
        }
        return;
    }
    this.sync(timeout);
    try {
        this.sendableMessages.push(message);
    } finally {
        this.sema.signal();
    }
};

/**
 * Shift the next sendable message from this MessageQueue's sendable
 * queue.
 * @param timeout the timeout used when waiting for the next free permit of the semaphore
 * @returns {object} the next sendable message
 */
MessageQueue.prototype.shift = function(timeout) {
    this.sync(timeout);
    try {
        return this.sendableMessages.shift();
    } finally {
        this.sema.signal();
    }
};

/**
 * Check the delayedQueue for messages which have reached their delay
 * and move those to the sendable queue.
 * @returns {number} the number of messages added to the immediate-send-queue
 */
MessageQueue.prototype.checkDelayedMessages = function() {
    var el;
    var i = 0;
    while (el = this.delayedMessages.poll()) {
        this.sync();
        try {
            this.sendableMessages.push(el);
            i++;
        } finally {
            this.sema.signal();
        }
    }
    return i;
};

/**
 * Returns the size of the immediate sendable list
 * @returns {number} the size of the immediate sendable list
 */
MessageQueue.prototype.sendable = function() {
    return this.sendableMessages.length;
};

/**
 * Returns the size of the delayed messages queue
 * @returns {number} the size of the delayed messages queue
 */
MessageQueue.prototype.queued = function() {
    return this.delayedMessages.size();
}

/**
 * Returns the total number of messages - queued and immediate sendable
 * @returns {number} the total number of messages - queued and immediate sendable
 */
MessageQueue.prototype.total = function() {
    return this.sendable() + this.queued();
};

/**
 * Wait for the next free permit of the internal semaphore
 */
MessageQueue.prototype.sync = function(timeout) {
    if (timeout === -1) {
        this.sema.wait();
    } else {
        var timeout = timeout || 30000;
        if (!this.sema.tryWait(timeout)) {
            throw new Error("Unable to aquire semaphore for MessageQueue " + this.namespace);
        }
    }
    return this.sema;
};