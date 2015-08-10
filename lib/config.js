var fs = require('fs');

'use strict';

module.exports = {
  Config: Config
}

/**
 * API for plugins to manage their own configuration settings
 */

function Config(path, data) {
  this.path = path;
  this.data = data || {};
}

Config.prototype.get = function(key) {
  this._validateKey(key);
  var pluginName = key.split('.')[0];
  var keyName = key.split('.')[1];
  return this.data[pluginName] && this.data[pluginName][keyName];
}

Config.prototype.set = function(key, value) {
  this._validateKey(key);
  var pluginName = key.split('.')[0];
  var keyName = key.split('.')[1];
  this.data[pluginName] = this.data[pluginName] || {};
  this.data[pluginName][keyName] = value;
  this.save();
}

Config.prototype._validateKey = function(key) {
  if (key.split(".").length != 2)
    throw new Error("The config key '" + key + "' is invalid. Configuration keys must be in the form [my-plugin].[myKey]");
}

Config.load = function(configPath) {
  // load up the previous config if found
  if (fs.existsSync(configPath))
    return new Config(configPath, JSON.parse(fs.readFileSync(configPath)));
  else
    return new Config(configPath); // empty initial config
}

Config.prototype.save = function() {
  fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2));
}