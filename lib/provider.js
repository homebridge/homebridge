import path from 'path';
import fs from 'fs';
import semver from 'semver';
import { User } from './user';
import { HOMEBRIDGE_VERSION } from './homebridge';

// This class represents a HomeBridge Provider that may or may not be installed.
export class Provider {
  
  constructor(name) {
    this.name = name;
  }
  
  get path() {
    return path.join(User.providersPath, this.name);
  }
  
  load(options = {}) {
    
    // does this provider exist at all?
    if (!fs.existsSync(this.path)) {
      throw new Error(`Provider ${this.name} was not found. Make sure the directory '~/.homebridge/providers/${this.name}' exists.`)
    }
    
    // check for a package.json
    let pjsonPath = path.join(this.path, "package.json");
    let pjson = null;
    
    if (!fs.existsSync(pjsonPath)) {
      throw new Error(`Provider ${this.name} does not contain a package.json.`);
    }
    
    try {
      // attempt to parse package.json
      pjson = JSON.parse(fs.readFileSync(pjsonPath));
    }
    catch (err) {
      throw new Error(`Provider ${this.name} contains an invalid package.json. Error: ${err}`);
    }
    
    // pluck out the HomeBridge version requirement
    if (!pjson.engines || !pjson.engines.homebridge) {
      throw new Error(`Provider ${this.name} does not contain a valid HomeBridge version requirement.`);
    }
    
    let versionRequired = pjson.engines.homebridge;

    // make sure the version is satisfied by the currently running version of HomeBridge
    if (!semver.satisfies(HOMEBRIDGE_VERSION, versionRequired)) {
      throw new Error(`Provider ${this.name} requires a HomeBridge version of "${versionRequired}" which does not satisfy the current HomeBridge version of ${HOMEBRIDGE_VERSION}. You may need to upgrade your installation of HomeBridge.`);
    }
    
    // figure out the main module - index.js unless otherwise specified
    let main = pjson.main || "./index.js";

    let mainPath = path.join(this.path, main);
    
    // try to require() it
    let loadedProvider = require(mainPath);
    
    // pull out the configuration data, if any
    let providerConfig = loadedProvider.config;
    
    // verify that all required values are present
    if (providerConfig && !options.skipConfigCheck) {
      for (let key in providerConfig) {
        
        let configParams = providerConfig[key];
        
        if (configParams.required && !User.config.get(`${this.name}-${key}`)) {
          throw new Error(`Provider ${this.name} requires the config value ${key} to be set.`);
        }
      }
    }
    
    return loadedProvider;
  }

  // Gets all providers installed on the local system
  static installed() {

    let providers = [];
    let names = fs.readdirSync(User.providersPath);
    
    for (let name of names) {

      // reconstruct full path
      let fullPath = path.join(User.providersPath, name);

      // we only care about directories
      if (!fs.statSync(fullPath).isDirectory()) continue;
      
      providers.push(new Provider(name));
    }
    
    return providers;
  }
}
