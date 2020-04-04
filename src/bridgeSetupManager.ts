var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var SetupSession = require("./bridgeSetupSession").SetupSession;

'use strict';

module.exports = {
  BridgeSetupManager: BridgeSetupManager
}

function BridgeSetupManager() {
  this.session;

  this.service = new Service(null, "49FB9D4D-0FEA-4BF1-8FA6-E7B18AB86DCE");

  this.stateCharacteristic = new Characteristic("State", "77474A2F-FA98-485E-97BE-4762458774D8", {
    format: Characteristic.Formats.UINT8,
    minValue: 0,
    maxValue: 1,
    minStep: 1,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.stateCharacteristic.value = 0;
  this.service.addCharacteristic(this.stateCharacteristic);

  this.versionCharacteristic = new Characteristic("Version", "FD9FE4CC-D06F-4FFE-96C6-595D464E1026", {
    format: Characteristic.Formats.STRING,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
  });
  this.versionCharacteristic.value = "1.0";
  this.service.addCharacteristic(this.versionCharacteristic);

  this.controlPointCharacteristic = new Characteristic("Control Point", "5819A4C2-E1B0-4C9D-B761-3EB1AFF43073", {
    format: Characteristic.Formats.DATA,
    perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
  })
  this.controlPointCharacteristic.on('get', function(callback, context) {
    this.handleReadRequest(callback, context);
  }.bind(this));
  this.controlPointCharacteristic.on('set', function(newValue, callback, context) {
    this.handleWriteRequest(newValue, callback, context);
  }.bind(this));

  this.controlPointCharacteristic.value = null;
  this.service.addCharacteristic(this.controlPointCharacteristic);
}

inherits(BridgeSetupManager, EventEmitter);

BridgeSetupManager.prototype.handleReadRequest = function(callback, context) {
  if (!context) {
    return;
  }

  if (!this.session) {
    callback(null, null);
  } else {
    this.session.handleReadRequest(callback);
  }
}

BridgeSetupManager.prototype.handleWriteRequest = function(value, callback, context) {
  if (!context) {
    callback();
    return;
  }

  var data = new Buffer(value, 'base64');
  var request = JSON.parse(data.toString());
  callback();

  if (!this.session || this.session.sessionUUID !== request.sid) {
    if (this.session) {
      this.session.removeAllListeners();
      this.session.validSession = false;
    }

    this.session = new SetupSession(this.stateCharacteristic, this.controlPointCharacteristic);
    this.session.configurablePlatformPlugins = this.configurablePlatformPlugins;
    this.session.on('newConfig', function(type, name, replace, config) {
      this.emit('newConfig', type, name, replace, config);
    }.bind(this));

    this.session.on('requestCurrentConfig', function(callback) {
      this.emit('requestCurrentConfig', callback);
    }.bind(this));

    this.session.on('end', function() {
      this.session = null;
    }.bind(this));
  }

  this.session.handleWriteRequest(request);
}