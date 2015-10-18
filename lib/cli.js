var program = require('commander');
var hap = require("hap-nodejs");
var version = require('./version');
var Server = require('./server').Server;
var Plugin = require('./plugin').Plugin;
var User = require('./user').User;

'use strict';

module.exports = function() {

  console.log("_____________________________________________________________________");
  console.log("IMPORTANT: Homebridge is in the middle of some big changes.");
  console.log("           Read more about it here:");
  console.log("           https://github.com/nfarina/homebridge/wiki/Migration-Guide");
  console.log("_____________________________________________________________________");
  console.log("");
  
  program
    .version(version)
    .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as node_modules', function(p) { Plugin.addPluginPath(p); })
    .option('-D, --debug', 'turn on debug level logging', function() { logger.setDebugEnabled(true) })
    .parse(process.argv);

  // Initialize HAP-NodeJS with a custom persist directory
  hap.init(User.persistPath());
  
  new Server().run();
}
