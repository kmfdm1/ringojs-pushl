addToClasspath("../../jars/json-simple-1.1.1.jar");
addToClasspath("../../jars/netty-all-4.0.26.Final.jar");
addToClasspath("../../jars/pushy-0.4.jar");

exports.defaults = {
        production: {
            certificate: {
                path: 'path/to/production-certificate.p12',
                password: 'certificatepassword'
            }
        },
        testmode: {
            certificate: {
                path: 'path/to/developement-certificate.p12',
                password: 'certificatepassword'
            }
        }

};

exports.check = function(options) {
    return true;
};