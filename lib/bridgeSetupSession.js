var crypto = require('crypto');
var uuid = require("hap-nodejs").uuid;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

'use strict';

module.exports = {
  SetupSession: BridgeSetupSession
}

function BridgeSetupSession(stateChar, controlChar) {
  this.validSession = false
  this.sessionUUID = uuid.generate(crypto.randomBytes(32));
  this.stateChar = stateChar;
  this.controlChar = controlChar;

  this.transactionID = 0;
  this.preferedLanguage = "en-US";

  this.lastResponse = null;

  // 0 - Waiting for negotiate
  // 1 - Waiting for selection
  // 2 - List platforms, waiting selection to give session to plugin
  // 3 - Forward message to platform
  // 4 - Manage accessory config, waiting selection
  this.currentStage = 0;

  this.currentPluginName;
  this.currentPlatformInstance;
  this.currentPlatformContext = {};
}

inherits(BridgeSetupSession, EventEmitter);

BridgeSetupSession.prototype.handleWriteRequest = function(request) {
  if (request.type === "Negotiate") {
    this.transactionID = request.tid + 1;
    this.preferedLanguage = request.language;
    this.validSession = true

    var respDict = {
      "tid": this.transactionID,
      "type": "Negotiate",
      "sid": this.sessionUUID,
      "attachment": {
        "type": "Interface",
        "interface": "list",
        "title": "How can I help you?",
        "items": [
          "Manage Platform",
          "Manage Accessories"
        ]
      }
    }

    this.currentStage = 1;

    this.sendResponse(respDict);
  } else if (request.type === "Interface") {
    this.transactionID = request.tid;

    if (this.currentStage === 1) {
      if (request.response.selections[0] === 0) {
        this.presentManagePlatformMenu();
      } else if (request.response.selections[0] === 1) {
        this.presentManageAccessoryMenu();
      }
    } else if (this.currentStage === 2) {
      var selectedIndex = request.response.selections[0];
      var targetPlatformName = this.listOfPlatforms[selectedIndex];
      var targetPlatform = this.configurablePlatformPlugins[targetPlatformName];

      this.currentPlatformContext = {};
      this.currentPlatformContext.preferedLanguage = this.preferedLanguage;
      this.currentPluginName = targetPlatformName;
      this.currentPlatformInstance = targetPlatform;
      this.currentStage = 3;
      this.currentPlatformInstance.configurationRequestHandler(this.currentPlatformContext, null, this.pluginResponseHandler.bind(this));
    } else if (this.currentStage === 3) {
      this.currentPlatformInstance.configurationRequestHandler(this.currentPlatformContext, request, this.pluginResponseHandler.bind(this));
    } else if (this.currentStage === 4) {
      this.handleManageAccessory(request);
    }
  } else if (request.type === "Terminate") {
    this.transactionID = request.tid;
    this.validSession = false;

    if (this.currentStage === 3) {
      this.currentPlatformInstance.configurationRequestHandler(this.currentPlatformContext, request, this.pluginResponseHandler.bind(this));
    }
  }
}

BridgeSetupSession.prototype.pluginResponseHandler = function(response, type, replace, config) {
  if (config) {
    this.emit('newConfig', type, this.currentPluginName, replace, config);
    this.presentMainMenu();
  } else if (response) {
    this.transactionID += 1;
    response.tid = this.transactionID;
    response.sid = this.sessionUUID;

    this.sendResponse(response);
  }
}

BridgeSetupSession.prototype.presentMainMenu = function() {
  this.currentStage = 1;

  this.transactionID += 1;

  var respDict = {
    "tid": this.transactionID,
    "sid": this.sessionUUID,
    "type": "Interface",
    "interface": "list",
    "title": "How can I help you?",
    "items": [
      "Manage Platform",
      "Manage Accessories"
    ]
  }

  this.sendResponse(respDict);
}

BridgeSetupSession.prototype.presentManagePlatformMenu = function() {
  var listOfPlatforms = [];
  for (var name in this.configurablePlatformPlugins) {
    listOfPlatforms.push(name);
  }
  this.listOfPlatforms = listOfPlatforms;

  this.transactionID += 1;

  var respDict = {
    "tid": this.transactionID,
    "type": "Interface",
    "sid": this.sessionUUID,
    "interface": "list",
    "title": "Which platform?",
    "items": listOfPlatforms
  }

  this.currentStage = 2;

  this.sendResponse(respDict);
}

BridgeSetupSession.prototype.presentManageAccessoryMenu = function() {
  this.emit('requestCurrentConfig', function(config) {
    this.currentConfig = config;
  }.bind(this));

  this.transactionID += 1;

  var respDict = {
    "tid": this.transactionID,
    "type": "Interface",
    "sid": this.sessionUUID,
    "interface": "instruction",
    "title": "Not Implemented",
    "detail": "This function is not yet implemented.\nPlease manually edit config.json for now.",
    "showNextButton": true,
    "heroImage": "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"
  }

  this.currentStage = 4;
  this.sendResponse(respDict);
}

BridgeSetupSession.prototype.handleManageAccessory = function(request) {
  this.presentMainMenu();
}

BridgeSetupSession.prototype.sendResponse = function(response) {
  if (this.validSession) {
    var serializedReponse = JSON.stringify(response);
    var respData = new Buffer(serializedReponse).toString('base64');
    this.lastResponse = respData;
    setTimeout(function() {
      this.controlChar.setValue(respData);
    }.bind(this), 100);
  }
}

BridgeSetupSession.prototype.handleReadRequest = function(callback) {
  callback(null, this.lastResponse);
}