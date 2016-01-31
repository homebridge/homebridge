var path = require('path');
var fs = require('fs');

'use strict';

module.exports = {
  User: User
}

/**
 * Manages user settings and storage locations.
 */

// global cached config
var config;

// optional custom storage path
var customStoragePath;

function User() {
}
  
User.config = function() {
  return config || (config = Config.load(User.configPath()));
}
  
User.storagePath = function() {
  if (customStoragePath) return customStoragePath;
  var home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  return path.join(home, ".homebridge");
}

User.configPath = function() {
  return path.join(User.storagePath(), "config.json");
}

User.persistPath = function() {
  return path.join(User.storagePath(), "persist");
}

User.cachedAccessoryPath = function() {
  return path.join(User.storagePath(), "accessories");
}

User.setStoragePath = function(path) {
  customStoragePath = path;
}