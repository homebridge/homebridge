import path from 'path';
import fs from 'fs';
import { Config } from './config';

//
// Manages user settings and storage locations.
//

// global cached config
let config;

export class User {
  
  static get config() {
    return config || (config = Config.load(User.configPath));
  }
  
  static get storagePath() {
    let home = process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE;
    return path.join(home, ".homebridge");
  }
  
  static get configPath() {
    return path.join(User.storagePath, "config.json");
  }
  
  static get providersPath() {
    return path.join(User.storagePath, "providers");
  }
}

