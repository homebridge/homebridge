import * as path from 'path';
import * as os from 'os';

/**
 * Manages user settings and storage locations.
 */
export class User {

  // global cached config
  protected config: any;

  // optional custom storage path
  static customStoragePath: string;

  static storagePath(): string {
    if (this.customStoragePath) return this.customStoragePath;
    return path.join(os.homedir(), ".homebridge");
  }
  
  static configPath(): string {
    return path.join(this.storagePath(), "config.json");
  }
  
  static persistPath(): string {
    return path.join(this.storagePath(), "persist");
  }
  
  static cachedAccessoryPath(): string {
    return path.join(this.storagePath(), "accessories");
  }
  
  static setStoragePath(storagePath: string): void {
    this.customStoragePath = path.resolve(storagePath);
  }

}
