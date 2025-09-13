import { EventEmitter } from 'node:events';
import hapNodeJs from 'hap-nodejs';
import semver from 'semver';
import { Logger } from './logger.js';
import { PlatformAccessory } from './platformAccessory.js';
import { PluginManager } from './pluginManager.js';
import { User } from './user.js';
import getVersion from './version.js';
const log = Logger.internal;
// eslint-disable-next-line no-restricted-syntax
export var PluginType;
(function (PluginType) {
    PluginType["ACCESSORY"] = "accessory";
    PluginType["PLATFORM"] = "platform";
})(PluginType || (PluginType = {}));
// eslint-disable-next-line no-restricted-syntax
export var APIEvent;
(function (APIEvent) {
    /**
     * Event is fired once homebridge has finished with booting up and initializing all components and plugins.
     * When this event is fired it is possible that the Bridge accessory isn't published yet, if homebridge still needs
     * to wait for some {@see StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
     */
    APIEvent["DID_FINISH_LAUNCHING"] = "didFinishLaunching";
    /**
     * This event is fired when homebridge gets shutdown. This could be a regular shutdown or an unexpected crash.
     * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
     */
    APIEvent["SHUTDOWN"] = "shutdown";
})(APIEvent || (APIEvent = {}));
// eslint-disable-next-line no-restricted-syntax
export var InternalAPIEvent;
(function (InternalAPIEvent) {
    InternalAPIEvent["REGISTER_ACCESSORY"] = "registerAccessory";
    InternalAPIEvent["REGISTER_PLATFORM"] = "registerPlatform";
    InternalAPIEvent["PUBLISH_EXTERNAL_ACCESSORIES"] = "publishExternalAccessories";
    InternalAPIEvent["REGISTER_PLATFORM_ACCESSORIES"] = "registerPlatformAccessories";
    InternalAPIEvent["UPDATE_PLATFORM_ACCESSORIES"] = "updatePlatformAccessories";
    InternalAPIEvent["UNREGISTER_PLATFORM_ACCESSORIES"] = "unregisterPlatformAccessories";
})(InternalAPIEvent || (InternalAPIEvent = {}));
// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class HomebridgeAPI extends EventEmitter {
    version = 2.7; // homebridge API version
    serverVersion = getVersion(); // homebridge node module version
    // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
    user = User;
    hap = hapNodeJs;
    hapLegacyTypes = hapNodeJs.LegacyTypes; // used for older accessories/platforms
    platformAccessory = PlatformAccessory;
    // ------------------------------------------------------------------------
    constructor() {
        super();
    }
    versionGreaterOrEqual(version) {
        return semver.gte(this.serverVersion, version);
    }
    static isDynamicPlatformPlugin(platformPlugin) {
        return 'configureAccessory' in platformPlugin;
    }
    static isStaticPlatformPlugin(platformPlugin) {
        return 'accessories' in platformPlugin;
    }
    signalFinished() {
        this.emit("didFinishLaunching" /* APIEvent.DID_FINISH_LAUNCHING */);
    }
    signalShutdown() {
        this.emit("shutdown" /* APIEvent.SHUTDOWN */);
    }
    registerAccessory(pluginIdentifier, accessoryName, constructor) {
        if (typeof accessoryName === 'function') {
            constructor = accessoryName;
            accessoryName = pluginIdentifier;
            this.emit("registerAccessory" /* InternalAPIEvent.REGISTER_ACCESSORY */, accessoryName, constructor);
        }
        else {
            this.emit("registerAccessory" /* InternalAPIEvent.REGISTER_ACCESSORY */, accessoryName, constructor, pluginIdentifier);
        }
    }
    registerPlatform(pluginIdentifier, platformName, constructor) {
        if (typeof platformName === 'function') {
            constructor = platformName;
            platformName = pluginIdentifier;
            this.emit("registerPlatform" /* InternalAPIEvent.REGISTER_PLATFORM */, platformName, constructor);
        }
        else {
            this.emit("registerPlatform" /* InternalAPIEvent.REGISTER_PLATFORM */, platformName, constructor, pluginIdentifier);
        }
    }
    publishCameraAccessories(pluginIdentifier, accessories) {
        this.publishExternalAccessories(pluginIdentifier, accessories);
    }
    publishExternalAccessories(pluginIdentifier, accessories) {
        if (!PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
            log.info(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`);
        }
        accessories.forEach((accessory) => {
            // noinspection SuspiciousTypeOfGuard
            if (!(accessory instanceof PlatformAccessory)) {
                throw new TypeError(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`);
            }
            accessory._associatedPlugin = pluginIdentifier;
        });
        this.emit("publishExternalAccessories" /* InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES */, accessories);
    }
    registerPlatformAccessories(pluginIdentifier, platformName, accessories) {
        accessories.forEach((accessory) => {
            // noinspection SuspiciousTypeOfGuard
            if (!(accessory instanceof PlatformAccessory)) {
                throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`);
            }
            accessory._associatedPlugin = pluginIdentifier;
            accessory._associatedPlatform = platformName;
        });
        this.emit("registerPlatformAccessories" /* InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES */, accessories);
    }
    updatePlatformAccessories(accessories) {
        this.emit("updatePlatformAccessories" /* InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES */, accessories);
    }
    unregisterPlatformAccessories(pluginIdentifier, platformName, accessories) {
        accessories.forEach((accessory) => {
            // noinspection SuspiciousTypeOfGuard
            if (!(accessory instanceof PlatformAccessory)) {
                throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`);
            }
        });
        this.emit("unregisterPlatformAccessories" /* InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES */, accessories);
    }
}
//# sourceMappingURL=api.js.map