/**
 * A delay-queue implementation only returning elements
 * if they have reached their delay
 */
var DelayQueue = exports.DelayQueue = function() {
    this.head = {};
};

/**
 * Add a new element to this queue with the given delay
 * @param data the element to add
 * @param delay the delay this element should have reached before it will be returned by poll
 */
DelayQueue.prototype.add = function(data, delay) {
    var last = this.head;
    var curr = last.next;
    var ts = new Date();
    ts.setSeconds(ts.getSeconds() + delay);
    ts = ts.getTime();
    var delayedObject = {
            data: data,
            etime: ts 
    };
    while (curr && curr.etime && curr.etime <= ts) {
        last = curr;
        curr = curr.next;
    }
    if (curr) {
        delayedObject.next = curr;
    }
    last.next = delayedObject;
};

/**
 * Return the next element which has reached it's delay-time
 * @returns the next element which has reached it's delay-time or null if no element is ready yet
 */
DelayQueue.prototype.poll = function() {
    if (!this.head.next) {
        return null;
    }
    var now = (new Date()).getTime();
    if (this.head.next.etime <= now) {
        var result = this.head.next;
        this.head.next = result.next;
        return result.data;
    }
    return null;
};

/**
 * Returns the size of the current queue regardless of their delay
 * @returns the size of the current queue regardless of their delay
 */
DelayQueue.prototype.size = function() {
    var cntr = 0;
    var curr = this.head;
    while (curr.next) {
        cntr++;
        curr = curr.next;
    }
    return cntr;
};

/**
 * Returns the milliseconds which have to pass until the next
 * element gets ready.
 * @return the milliseconds which have to pass until the next element gets ready or undefined if empty
 */
DelayQueue.prototype.timeToNextReady = function() {
    if (!this.head.next) {
        return undefined;
    }
    return Math.max(0, this.head.next.etime-(new Date()).getTime());
};