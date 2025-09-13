import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
/**
 * Manages user settings and storage locations.
 */
export class User {
    static customStoragePath;
    static storageAccessed = false;
    static configPath() {
        return join(User.storagePath(), 'config.json');
    }
    static persistPath() {
        return join(User.storagePath(), 'persist'); // hap-nodejs data is stored here
    }
    static cachedAccessoryPath() {
        return join(User.storagePath(), 'accessories');
    }
    static storagePath() {
        User.storageAccessed = true;
        return User.customStoragePath ? User.customStoragePath : join(homedir(), '.homebridge');
    }
    static setStoragePath(...storagePathSegments) {
        if (User.storageAccessed) {
            throw new Error('Storage path was already accessed and cannot be changed anymore. Try initializing your custom storage path earlier!');
        }
        User.customStoragePath = resolve(...storagePathSegments);
    }
}
//# sourceMappingURL=user.js.map