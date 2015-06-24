Quick example:

    var pushLibrary = require('ringojs-pushL');
    var distributor = pushLibrary.getMessageDistributor("foobar", {
      gcm: {
         apiKey: 'my-api-key',
         server: 'https://android.googleapis.com/gcm/send'
      }
    });
    distributor.start();

    var message = distributor.createMessage('gcm', 'Testing one two', {time_to_live: 10});

    message.on('success', function() { console.log('success!') });
    message.on('failed', function() { console.log('failed!') });

    distributor.sendMessage(message);

Distributor events:

  * messageSent
  * messageRescheduled
  * gcmStopped
  * errorConnect
  * error400
  * error401
  * error500
  * idChange
  * idUnregistered
  * idUnhandledError

Message events:

  * success
  * failed
  * idChange
  * idUnregistered
  * idUnhandledError