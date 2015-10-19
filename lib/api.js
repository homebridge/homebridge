var hap = require("hap-nodejs");
var hapLegacyTypes = require("hap-nodejs/accessories/types.js");
var log = require("./logger")._system;

// The official homebridge API is the object we feed the plugin's exported initializer function.

module.exports = {
  API: API
}

function API() {
  this._accessories = {}; // this._accessories[name] = accessory constructor
  this._platforms = {}; // this._platforms[name] = platform constructor
  
  // expose HAP-NodeJS in its entirely for plugins to use instead of making Plugins
  // require() it as a dependency - it's a heavy dependency so we don't want it in
  // every single plugin.
  this.hap = hap;
  
  // we also need to "bolt on" the legacy "types" constants for older accessories/platforms
  // still using the "object literal" style JSON.
  this.hapLegacyTypes = hapLegacyTypes;
}

API.prototype.accessory = function(name) {
  if (!this._accessories[name])
    throw new Error("The requested accessory '" + name + "' was not registered by any plugin.");
  
  return this._accessories[name];
}

API.prototype.registerAccessory = function(name, constructor) {
  if (this._accessories[name])
    throw new Error("Attempting to register an accessory '" + name + "' which has already been registered!");

  log.info("Registering accessory '%s'", name);

  this._accessories[name] = constructor;
}

API.prototype.platform = function(name) {
  if (!this._platforms[name])
    throw new Error("The requested platform '" + name + "' was not registered by any plugin.");
  
  return this._platforms[name];
}

API.prototype.registerPlatform = function(name, constructor) {
  if (this._platforms[name])
    throw new Error("Attempting to register a platform '" + name + "' which has already been registered!");

  log.info("Registering platform '%s'", name);

  this._platforms[name] = constructor;
}