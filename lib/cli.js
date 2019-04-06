var program = require('commander');
var hap = require("hap-nodejs");
var version = require('./version');
var Server = require('./server').Server;
var Plugin = require('./plugin').Plugin;
var User = require('./user').User;
var log = require("./logger")._system;

'use strict';

module.exports = function() {
  var cleanCachedAccessories = false
  var insecureAccess = false;
  var hideQRCode = false;
  var shuttingDown = false;

  program
    .version(version)
    .option('-C, --color', 'force color in logging', function() { require('./logger').forceColor(); })
    .option('-D, --debug', 'turn on debug level logging', function() { require('./logger').setDebugEnabled(true); })
    .option('-I, --insecure', 'allow unauthenticated requests (for easier hacking)', function() { insecureAccess = true; })
    .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as the default locations ([path] can also point to a single plugin)', function(p) { Plugin.addPluginPath(p); })
    .option('-Q, --no-qrcode', 'do not issue QRcode in logging', function() { hideQRCode = true; })
    .option('-R, --remove-orphans', 'remove cached accessories for which plugin is not loaded', function() { cleanCachedAccessories = true; })
    .option('-T, --no-timestamp', 'do not issue timestamps in logging', function() { require('./logger').setTimestampEnabled(false); })
    .option('-U, --user-storage-path [path]', 'look for homebridge user files at [path] instead of the default location (~/.homebridge)', function(p) { User.setStoragePath(p); })
    .parse(process.argv);

  // Initialize HAP-NodeJS with a custom persist directory
  hap.init(User.persistPath());

  var server = new Server({cleanCachedAccessories:cleanCachedAccessories, insecureAccess:insecureAccess, hideQRCode:hideQRCode});

  var signals = { 'SIGINT': 2, 'SIGTERM': 15 };
  Object.keys(signals).forEach(function (signal) {
    process.on(signal, function () {
      if (shuttingDown) {
        return
      }
      shuttingDown = true;

      log.info("Got %s, shutting down Homebridge...", signal);

      server._teardown();
      setTimeout(function (){
        process.exit(128 + signals[signal]);
      }, 5000)
      server._api.emit('shutdown')
    });
  });

  process.on('uncaughtException', function(error) {
    log.error(error.stack);
    if (!shuttingDown) {
      process.kill(process.pid, 'SIGTERM');
    }
  });

  server.run();
}
