var path = require('path');
var os = require('os');

'use strict';

module.exports = {
  User: User
}

/**
 * Manages user settings and storage locations.
 */


// optional custom storage path
var customStoragePath;

function User() {
}

User.storagePath = function() {
  if (customStoragePath) return customStoragePath;
  return path.join(os.homedir(), ".homebridge");
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

User.setStoragePath = function(storagePath) {
  customStoragePath = path.resolve(storagePath);
}
