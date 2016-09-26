var uuid = require("hap-nodejs").uuid;
var Accessory = require("hap-nodejs").Accessory;
var Service = require("hap-nodejs").Service;
var Characteristic = require("hap-nodejs").Characteristic;
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

'use strict';

module.exports = {
  PlatformAccessory: PlatformAccessory
}

function PlatformAccessory(displayName, UUID, category) {
  if (!displayName) throw new Error("Accessories must be created with a non-empty displayName.");
  if (!UUID) throw new Error("Accessories must be created with a valid UUID.");
  if (!uuid.isValid(UUID)) throw new Error("UUID '" + UUID + "' is not a valid UUID. Try using the provided 'generateUUID' function to create a valid UUID from any arbitrary string, like a serial number.");

  this.displayName = displayName;
  this.UUID = UUID;
  this.category = category || Accessory.Categories.OTHER;
  this.services = [];
  this.reachable = false;
  this.context = {};

  this._associatedPlugin;
  this._associatedPlatform;
  this._associatedHAPAccessory;

  this
    .addService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Name, displayName)
    .setCharacteristic(Characteristic.Manufacturer, "Default-Manufacturer")
    .setCharacteristic(Characteristic.Model, "Default-Model")
    .setCharacteristic(Characteristic.SerialNumber, "Default-SerialNumber");
}

inherits(PlatformAccessory, EventEmitter);

PlatformAccessory.prototype.addService = function(service) {
  // service might be a constructor like `Service.AccessoryInformation` instead of an instance
  // of Service. Coerce if necessary.
  if (typeof service === 'function')
    service = new (Function.prototype.bind.apply(service, arguments));
  
  // check for UUID+subtype conflict
  for (var index in this.services) {
    var existing = this.services[index];
    if (existing.UUID === service.UUID) {
      // OK we have two Services with the same UUID. Check that each defines a `subtype` property and that each is unique.
      if (!service.subtype)
        throw new Error("Cannot add a Service with the same UUID '" + existing.UUID + "' as another Service in this Accessory without also defining a unique 'subtype' property.");
      
      if (service.subtype.toString() === existing.subtype.toString())
        throw new Error("Cannot add a Service with the same UUID '" + existing.UUID + "' and subtype '" + existing.subtype + "' as another Service in this Accessory.");
    }
  }

  this.services.push(service);

  if (this._associatedHAPAccessory) {
    this._associatedHAPAccessory.addService(service);
  }
  return service;
}

PlatformAccessory.prototype.removeService = function(service) {
  var targetServiceIndex;

  for (var index in this.services) {
    var existingService = this.services[index];
    
    if (existingService === service) {
      targetServiceIndex = index;
      break;
    }
  }

  if (targetServiceIndex) {
    this.services.splice(targetServiceIndex, 1);
    service.removeAllListeners();

    if (this._associatedHAPAccessory) {
      this._associatedHAPAccessory.removeService(service);
    }
  }
}

/**
 * searchs for a Service in the services collection and returns the first Service object that matches.
 * If multiple services of the same type are present in one accessory, use getServiceByUUIDAndSubType instead.
 * @param {ServiceConstructor|string} name
 * @returns Service
 */
PlatformAccessory.prototype.getService = function(name) {
  for (var index in this.services) {
    var service = this.services[index];
    
    if (typeof name === 'string' && (service.displayName === name || service.name === name))
      return service;
    else if (typeof name === 'function' && ((service instanceof name) || (name.UUID === service.UUID)))
      return service;
  }
}

/**
 * searchs for a Service in the services collection and returns the first Service object that matches.
 * If multiple services of the same type are present in one accessory, use getServiceByUUIDAndSubType instead.
 * @param {string} UUID Can be an UUID, a service.displayName, or a constructor of a Service
 * @param {string} subtype A subtype string to match
 * @returns Service
 */
PlatformAccessory.prototype.getServiceByUUIDAndSubType = function(UUID, subtype) {
  for (var index in this.services) {
    var service = this.services[index];
    
    if (typeof UUID === 'string' && (service.displayName === UUID || service.name === UUID) && service.subtype === subtype )
      return service;
    else if (typeof UUID === 'function' && ((service instanceof UUID) || (UUID.UUID === service.UUID)) && service.subtype === subtype)
      return service;
  }
}


PlatformAccessory.prototype.updateReachability = function(reachable) {
  this.reachable = reachable;

  if (this._associatedHAPAccessory) {
    this._associatedHAPAccessory.updateReachability(reachable);
  }
}

PlatformAccessory.prototype.configureCameraSource = function(cameraSource) {
  this.cameraSource = cameraSource;
  for (var index in cameraSource.services) {
    var service = cameraSource.services[index];
    this.addService(service);
  }
}

PlatformAccessory.prototype._prepareAssociatedHAPAccessory = function () {
  this._associatedHAPAccessory = new Accessory(this.displayName, this.UUID);

  if (this.cameraSource) {
    this._associatedHAPAccessory.configureCameraSource(this.cameraSource);
  }

  this._associatedHAPAccessory._sideloadServices(this.services);
  this._associatedHAPAccessory.category = this.category;
  this._associatedHAPAccessory.reachable = this.reachable;
  this._associatedHAPAccessory.on('identify', function(paired, callback) {
    if (this.listeners('identify').length > 0) {
    // allow implementors to identify this Accessory in whatever way is appropriate, and pass along
    // the standard callback for completion.
      this.emit('identify', paired, callback);
    } else {
      callback();
    }
  }.bind(this));
}

PlatformAccessory.prototype._dictionaryPresentation = function() {
  var accessory = {};

  accessory.plugin = this._associatedPlugin;
  accessory.platform = this._associatedPlatform;
  accessory.displayName = this.displayName;
  accessory.UUID = this.UUID;
  accessory.category = this.category;
  accessory.context = this.context;

  var services = [];
  for (var index in this.services) {
    var service = this.services[index];
    var servicePresentation = {};
    servicePresentation.displayName = service.displayName;
    servicePresentation.UUID = service.UUID;
    servicePresentation.subtype = service.subtype;

    var characteristics = [];
    for (var cIndex in service.characteristics) {
      var characteristic = service.characteristics[cIndex];
      var characteristicPresentation = {};
      characteristicPresentation.displayName = characteristic.displayName;
      characteristicPresentation.UUID = characteristic.UUID;
      characteristicPresentation.props = characteristic.props;
      characteristicPresentation.value = characteristic.value;
      characteristics.push(characteristicPresentation);
    }
    
    servicePresentation.characteristics = characteristics;
    services.push(servicePresentation);
  }

  accessory.services = services;
  return accessory;
}

PlatformAccessory.prototype._configFromData = function(data) {
  this._associatedPlugin = data.plugin;
  this._associatedPlatform = data.platform;
  this.displayName = data.displayName;
  this.UUID = data.UUID;
  this.category = data.category;
  this.context = data.context;
  this.reachable = false;

  var services = [];
  for (var index in data.services) {
    var service = data.services[index];
    var hapService = new Service(service.displayName, service.UUID, service.subtype);

    var characteristics = [];
    for (var cIndex in service.characteristics) {
      var characteristic = service.characteristics[cIndex];
      var hapCharacteristic = new Characteristic(characteristic.displayName, characteristic.UUID, characteristic.props);
      hapCharacteristic.value = characteristic.value;
      characteristics.push(hapCharacteristic);
    }

    hapService._sideloadCharacteristics(characteristics);
    services.push(hapService);
  }

  this.services = services;
}
