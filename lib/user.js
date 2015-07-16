import path from 'path';
import fs from 'fs';
import { Config } from './config';

//
// Manages user settings and storage locations.
//

// global cached config
let config:Config;

export class User {
  
  static get config():Config {
    return config || (config = Config.load(User.configPath));
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

