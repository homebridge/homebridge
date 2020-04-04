import path from "path";
import os from "os";

/**
 * Manages user settings and storage locations.
 */
export class User {

    private static customStoragePath?: string;
    private static storageAccessed = false;

    static configPath(): string {
      return path.join(User.storagePath(), "config.json");
    }

    static persistPath(): string {
      return path.join(User.storagePath(), "persist"); // hap-nodejs data is stored here
    }

    static cachedAccessoryPath(): string {
      return path.join(User.storagePath(), "accessories");
    }

    static storagePath(): string {
      User.storageAccessed = true;

      return User.customStoragePath ? User.customStoragePath : path.join(os.homedir(), ".homebridge");
    }

    public static setStoragePath(...storagePathSegments: string[]): void {
      if (User.storageAccessed) {
        throw new Error("Storage path was already accessed and cannot be changed anymore. Try initializing your custom storage path earlier!");
      }

      User.customStoragePath = path.resolve(...storagePathSegments);
    }

}
