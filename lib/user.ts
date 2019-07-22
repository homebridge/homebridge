import os from 'os';
import path from 'path';

import { Config as ConfigType } from "./types";

/**
 * Manages user settings and storage locations.
 */


export class User {
  // global cached config
  static _config: ConfigType;

  // optional custom storage path
  static customStoragePath?: string;

  static config = () => {
    // @TODO I have no idea how the following line worked, since I can't seem to find a usage example anywhere
    // return User._config || (User._config = Config.load(User.configPath()));
    return User._config;
  };

  static storagePath = () => {
    if (User.customStoragePath) {
      return User.customStoragePath;
    }
    return path.join(os.homedir(), ".homebridge");
  };

  static configPath = () => {
    return path.join(User.storagePath(), "config.json");
  };

  static persistPath = () => {
    return path.join(User.storagePath(), "persist");
  };

  static cachedAccessoryPath = () => {
    return path.join(User.storagePath(), "accessories");
  };

  static setStoragePath = (storagePath: string) => {
    User.customStoragePath = path.resolve(storagePath);
  };

}
