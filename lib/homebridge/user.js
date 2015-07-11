import path from 'path';
import fs from 'fs';

//
// Manages user settings and storage locations.
//

// global cached config
let config:Config;

export class User {
  
  static get config():Config {
    return config || (config = new Config());
  }
  
  static get storagePath():string {
    let home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    return path.join(home, ".homebridge");
  }
  
  static get configPath():string {
    return path.join(User.storagePath, "config.json");
  }
  
  static get providersPath():string {
    return path.join(User.storagePath, "providers");
  }
}

export class Config {
  
  constructor(data:object = {}) {
    this.data = data;
  }
  
  get(key:string) {
    return this.data[key];
  }
  
  set(key:string, value:object) {
    this.data[key] = value;
  }
  
  static load():Config {
    // load up the previous config if found
    if (fs.existsSync(User.configPath))
      return new Config(JSON.parse(fs.readFileSync(User.configPath)));
    else
      return new Config(); // empty initial config
  }
  
  save() {
    fs.writeFileSync(User.configPath, JSON.stringify(this.data));
  }
}