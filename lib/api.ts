import {EventEmitter} from 'events';
import * as hap from "hap-nodejs";
import * as hapLegacyTypes from "hap-nodejs/accessories/types.js";
import {_system as log} from "./logger";
import {User} from "./user";
import {PlatformAccessory} from "./platformAccessory";
import * as serverVersion from "./version";

export class API extends EventEmitter {

  private _accessories = {}; // this._accessories[pluginName.accessoryName] = accessory constructor
  private _platforms = {}; // this._platforms[pluginName.platformName] = platform constructor

  private _configurableAccessories = {};
  private _dynamicPlatforms = {}; // this._dynamicPlatforms[pluginName.platformName] = platform constructor
  
  // expose the homebridge API version
  protected readonly version = 2.4;

  // expose the homebridge server version
  protected serverVersion: any;

  // expose the User class methods to plugins to get paths. Example: homebridge.user.storagePath()
  protected user: any;
  
  // expose HAP-NodeJS in its entirely for plugins to use instead of making Plugins
  // require() it as a dependency - it's a heavy dependency so we don't want it in
  // every single plugin.
  protected hap: any;
  
  // we also need to "bolt on" the legacy "types" constants for older accessories/platforms
  // still using the "object literal" style JSON.
  protected hapLegacyTypes: any;

  protected platformAccessory: any;

  constructor() {
    super();

    this.serverVersion = serverVersion;
    this.user = User;
    this.hap = hap;
    this.hapLegacyTypes = hapLegacyTypes;
    this.platformAccessory = PlatformAccessory;    
  }

  accessory(name: string) {
  
    // if you passed the "short form" name like "Lockitron" instead of "homebridge-lockitron.Lockitron",
    // see if it matches exactly one accessory.
    if (name.indexOf('.') == -1) {
      const found = [];
      for (const fullName in this._accessories) {
        if (fullName.split(".")[1] == name)
          found.push(fullName);
      }
      
      if (found.length == 1) {
        return this._accessories[found[0]];
      }
      else if (found.length > 1) {
        throw new Error("The requested accessory '" + name + "' has been registered multiple times. Please be more specific by writing one of: " + found.join(", "));
      }
      else {
        throw new Error("The requested accessory '" + name + "' was not registered by any plugin.");
      }
    }
    else {
  
      if (!this._accessories[name])
        throw new Error("The requested accessory '" + name + "' was not registered by any plugin.");
      
      return this._accessories[name];
    }
  }  

  registerAccessory(pluginName, accessoryName, constructor, configurationRequestHandler) {
    const fullName = pluginName + "." + accessoryName;
    
    if (this._accessories[fullName])
      throw new Error("Attempting to register an accessory '" + fullName + "' which has already been registered!");
  
    log.info("Registering accessory '%s'", fullName);
  
    this._accessories[fullName] = constructor;
  
    // The plugin supports configuration
    if (configurationRequestHandler) {
      this._configurableAccessories[fullName] = configurationRequestHandler;
    }
  }
  
  publishCameraAccessories(pluginName, accessories) {
    for (const index in accessories) {
      const accessory = accessories[index];
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(pluginName + " attempt to register an accessory that isn\'t PlatformAccessory!");
      }
      accessory._associatedPlugin = pluginName;
    }
  
    this.emit('publishExternalAccessories', accessories);
  }

  publishExternalAccessories(pluginName, accessories) {
    for (const index in accessories) {
      const accessory = accessories[index];
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(pluginName + " attempt to register an accessory that isn\'t PlatformAccessory!");
      }
      accessory._associatedPlugin = pluginName;
    }
  
    this.emit('publishExternalAccessories', accessories);
  }
  
  platform(name) {
    
    // if you passed the "short form" name like "Lockitron" instead of "homebridge-lockitron.Lockitron",
    // see if it matches exactly one platform.
    if (name.indexOf('.') == -1) {
      const found = [];
      for (const fullName in this._platforms) {
        if (fullName.split(".")[1] == name)
          found.push(fullName);
      }
      
      if (found.length == 1) {
        return this._platforms[found[0]];
      }
      else if (found.length > 1) {
        throw new Error("The requested platform '" + name + "' has been registered multiple times. Please be more specific by writing one of: " + found.join(", "));
      }
      else {
        throw new Error("The requested platform '" + name + "' was not registered by any plugin.");
      }
    }
    else {
  
      if (!this._platforms[name])
        throw new Error("The requested platform '" + name + "' was not registered by any plugin.");
      
      return this._platforms[name];
    }
  }
  
  registerPlatform(pluginName, platformName, constructor, dynamic) {
    const fullName = pluginName + "." + platformName;
    
    if (this._platforms[fullName])
      throw new Error("Attempting to register a platform '" + fullName + "' which has already been registered!");
  
    log.info("Registering platform '%s'", fullName);
  
    this._platforms[fullName] = constructor;
  
    if (dynamic) {
      this._dynamicPlatforms[fullName] = constructor;
    }
  }
  
  registerPlatformAccessories(pluginName, platformName, accessories) {
    for (const index in accessories) {
      const accessory = accessories[index];
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(pluginName + " - " + platformName + " attempt to register an accessory that isn\'t PlatformAccessory!");
      }
      accessory._associatedPlugin = pluginName;
      accessory._associatedPlatform = platformName;
    }
  
    this.emit('registerPlatformAccessories', accessories);
  }
  
  updatePlatformAccessories(accessories) {
    this.emit('updatePlatformAccessories', accessories);
  }
  
  unregisterPlatformAccessories(pluginName, platformName, accessories) {
    for (const index in accessories) {
      const accessory = accessories[index];
      if (!(accessory instanceof PlatformAccessory)) {
        throw new Error(pluginName + " - " + platformName + " attempt to unregister an accessory that isn\'t PlatformAccessory!");
      }
    }
    this.emit('unregisterPlatformAccessories', accessories);
  }

}
