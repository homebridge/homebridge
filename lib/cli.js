var program = require('commander');
var version = require('./version');
var Server = require('./server').Server;
var Plugin = require('./Plugin').Plugin;

'use strict';

module.exports = function() {
  
  program
    .version(version)
    .option('-P, --plugin-path [path]', 'look for plugins installed at [path] as well as node_modules', function(p) { Plugin.addPluginPath(p); })
    .option('-D, --debug', 'turn on debug level logging', function() { logger.setDebugEnabled(true) })
    .parse(process.argv);
  
  new Server().run();
}
