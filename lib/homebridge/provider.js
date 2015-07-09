import path from 'path';
import fs from 'fs';
import semver from 'semver';
import { HOMEBRIDGE_VERSION } from '../homebridge';

// This class represents a HomeBridge Provider that may or may not be installed.
export class Provider {
  
  constructor(name:string) {
    this.name = name;
  }
  
  get path():string {
    return path.join(Provider.installedProvidersDir, this.name);
  }
  
  load():object {
    
    // check for a package.json
    let pjsonPath:string = path.join(this.path, "package.json");
    let pjson:object = null;
    
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
    
    let versionRequired:string = pjson.engines.homebridge;

    // make sure the version is satisfied by the currently running version of HomeBridge
    if (!semver.satisfies(HOMEBRIDGE_VERSION, versionRequired)) {
      throw new Error(`Provider ${this.name} requires a HomeBridge version of "${versionRequired}" which does not satisfy the current HomeBridge version of ${HOMEBRIDGE_VERSION}. You may need to upgrade your installation of HomeBridge.`);
    }
    
    // figure out the main module - index.js unless otherwise specified
    let main:string = pjson.main || "./index.js";

    let mainPath:string = path.join(this.path, main);
    
    // try to require() it
    let loadedProvider:object = require(mainPath);
    
    return loadedProvider;
  }

  // Gets all providers installed on the local system
  static installed():Array<Provider> {

    let providers:Array<Provider> = [];
    let names:Array<string> = fs.readdirSync(Provider.installedProvidersDir);
    
    for (let name:string of names) {

      // reconstruct full path
      let fullPath:string = path.join(Provider.installedProvidersDir, name);

      // we only care about directories
      if (!fs.statSync(fullPath).isDirectory()) continue;
      
      providers.push(new Provider(name));
    }
    
    return providers;
  }
  
  //
  // Private utility functions
  //
  
  static get userDir():string {
    return process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
  }
  
  static get installedProvidersDir():string {
    return path.join(Provider.userDir, ".homebridge/providers");
  }
}
