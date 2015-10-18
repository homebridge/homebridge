var chalk = require('chalk');

'use strict';

module.exports = {
  Logger: Logger,
  setDebugEnabled: setDebugEnabled,
  _system: new Logger() // system logger, for internal use only
}

var DEBUG_ENABLED = false;

// Turns on debug level logging
function setDebugEnabled(enabled) {
  DEBUG_ENABLED = enabled;
}

// global cache of logger instances by plugin name
var loggerCache = {};

/**
 * Logger class
 */

function Logger(pluginName) {
  this.pluginName = pluginName;
}

Logger.prototype.debug = function(msg) {
  if (DEBUG_ENABLED)
    this.log('debug', msg);
}
  
Logger.prototype.info = function(msg) {
  this.log('info', msg);
}

Logger.prototype.warn = function(msg) {
  this.log('warn', msg);
}

Logger.prototype.error = function(msg) {
  this.log('error', msg);
}
  
Logger.prototype.log = function(level, msg) {
  
  if (level == 'debug')
    msg = chalk.gray(msg);
  else if (level == 'warn')
    msg = chalk.yellow(msg);
  else if (level == 'error')
    msg = chalk.bold.red(msg);
  
  // prepend plugin name if applicable
  if (this.pluginName)
    msg = chalk.cyan("[" + this.pluginName +  "]") + " " + msg;
    
  console.log(msg);
}
  
Logger.forPlugin = function(pluginName) {
  return loggerCache[pluginName] || (loggerCache[pluginName] = new Logger(pluginName));
}
