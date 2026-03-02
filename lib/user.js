"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
/**
 * Manages user settings and storage locations.
 */
class User {
    static customStoragePath;
    static storageAccessed = false;
    static configPath() {
        return (0, node_path_1.join)(User.storagePath(), 'config.json');
    }
    static persistPath() {
        return (0, node_path_1.join)(User.storagePath(), 'persist'); // hap-nodejs data is stored here
    }
    static matterPath() {
        return (0, node_path_1.join)(User.storagePath(), 'matter'); // matter data is stored here
    }
    static cachedAccessoryPath() {
        return (0, node_path_1.join)(User.storagePath(), 'accessories');
    }
    static storagePath() {
        User.storageAccessed = true;
        return User.customStoragePath ? User.customStoragePath : (0, node_path_1.join)((0, node_os_1.homedir)(), '.homebridge');
    }
    static setStoragePath(...storagePathSegments) {
        if (User.storageAccessed) {
            throw new Error('Storage path was already accessed and cannot be changed anymore. Try initializing your custom storage path earlier!');
        }
        User.customStoragePath = (0, node_path_1.resolve)(...storagePathSegments);
    }
}
exports.User = User;
//# sourceMappingURL=user.js.map