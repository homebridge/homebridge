"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeAPI = exports.InternalAPIEvent = exports.APIEvent = exports.PluginType = void 0;
const node_events_1 = require("node:events");
const hap_nodejs_1 = __importDefault(require("@homebridge/hap-nodejs"));
const semver_1 = __importDefault(require("semver"));
const logger_js_1 = require("./logger.js");
const platformAccessory_js_1 = require("./platformAccessory.js");
const pluginManager_js_1 = require("./pluginManager.js");
const user_js_1 = require("./user.js");
const version_js_1 = __importDefault(require("./version.js"));
const log = logger_js_1.Logger.internal;
// eslint-disable-next-line no-restricted-syntax
var PluginType;
(function (PluginType) {
    PluginType["ACCESSORY"] = "accessory";
    PluginType["PLATFORM"] = "platform";
})(PluginType || (exports.PluginType = PluginType = {}));
// eslint-disable-next-line no-restricted-syntax
var APIEvent;
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
})(APIEvent || (exports.APIEvent = APIEvent = {}));
// eslint-disable-next-line no-restricted-syntax
var InternalAPIEvent;
(function (InternalAPIEvent) {
    InternalAPIEvent["REGISTER_ACCESSORY"] = "registerAccessory";
    InternalAPIEvent["REGISTER_PLATFORM"] = "registerPlatform";
    InternalAPIEvent["PUBLISH_EXTERNAL_ACCESSORIES"] = "publishExternalAccessories";
    InternalAPIEvent["REGISTER_PLATFORM_ACCESSORIES"] = "registerPlatformAccessories";
    InternalAPIEvent["UPDATE_PLATFORM_ACCESSORIES"] = "updatePlatformAccessories";
    InternalAPIEvent["UNREGISTER_PLATFORM_ACCESSORIES"] = "unregisterPlatformAccessories";
    // Matter events (matching HAP pattern)
    InternalAPIEvent["PUBLISH_EXTERNAL_MATTER_ACCESSORIES"] = "publishExternalMatterAccessories";
    InternalAPIEvent["REGISTER_MATTER_PLATFORM_ACCESSORIES"] = "registerMatterPlatformAccessories";
    InternalAPIEvent["UPDATE_MATTER_PLATFORM_ACCESSORIES"] = "updateMatterPlatformAccessories";
    InternalAPIEvent["UNREGISTER_MATTER_PLATFORM_ACCESSORIES"] = "unregisterMatterPlatformAccessories";
    InternalAPIEvent["UNREGISTER_EXTERNAL_MATTER_ACCESSORIES"] = "unregisterExternalMatterAccessories";
    InternalAPIEvent["UPDATE_MATTER_ACCESSORY_STATE"] = "updateMatterAccessoryState";
})(InternalAPIEvent || (exports.InternalAPIEvent = InternalAPIEvent = {}));
// eslint-disable-next-line ts/no-unsafe-declaration-merging
class HomebridgeAPI extends node_events_1.EventEmitter {
    version = 2.7; // homebridge API version
    serverVersion = (0, version_js_1.default)(); // homebridge node module version
    // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
    user = user_js_1.User;
    hap = hap_nodejs_1.default;
    hapLegacyTypes = hap_nodejs_1.default.LegacyTypes; // used for older accessories/platforms
    platformAccessory = platformAccessory_js_1.PlatformAccessory;
    // ------------------------------------------------------------------------
    /**
     * Internal state tracking whether Matter is enabled for this bridge
     */
    matterEnabled = false;
    /**
     * Internal reference to MatterServer for API methods that need return values
     * @internal
     */
    _matterServer = null;
    /**
     * Internal reference to MatterBridgeManager for checking external servers
     * @internal
     */
    _matterManager = null;
    /**
     * Pending external accessory registrations
     * Map of registration ID to resolve function
     * @internal
     */
    _pendingExternalRegistrations = new Map();
    /**
     * Lazy-loaded Matter API implementation
     */
    _matterAPI;
    /**
     * Matter Protocol API (lazy-loaded)
     * Only instantiated when first accessed
     */
    get matter() {
        if (!this._matterAPI) {
            // Dynamic import to load MatterAPIImpl module only when needed
            // This prevents loading Matter.js for child bridges that don't use it
            throw new Error('Matter API must be pre-loaded before access. '
                + 'Call await api.loadMatterAPI() in your plugin constructor or access api.matter in didFinishLaunching().');
        }
        return this._matterAPI;
    }
    /**
     * Load Matter API implementation
     * Must be called before accessing `api.matter`
     *
     * @internal
     */
    async loadMatterAPI() {
        if (!this._matterAPI) {
            const { MatterAPIImpl } = await Promise.resolve().then(() => __importStar(require('./matter/MatterAPIImpl.js')));
            this._matterAPI = new MatterAPIImpl(this);
        }
    }
    constructor() {
        super();
    }
    /**
     * Internal method to set Matter enabled status
     * Called by Server or ChildBridgeFork after Matter initialization
     * @internal
     */
    _setMatterEnabled(enabled) {
        this.matterEnabled = enabled;
    }
    /**
     * Internal method to set MatterServer reference
     * Called by Server or ChildBridgeFork after creating MatterServer
     * @internal
     */
    _setMatterServer(server) {
        this._matterServer = server;
    }
    /**
     * Internal method to set MatterBridgeManager reference
     * Called by Server or ChildBridgeFork to allow API access to external servers
     * @internal
     */
    _setMatterManager(manager) {
        this._matterManager = manager;
    }
    /**
     * Internal method to resolve pending external accessory registrations
     * Called by MatterBridgeManager when external accessories finish publishing
     * @internal
     */
    _resolveExternalRegistration(registrationId) {
        const resolve = this._pendingExternalRegistrations.get(registrationId);
        if (resolve) {
            resolve();
            this._pendingExternalRegistrations.delete(registrationId);
        }
    }
    versionGreaterOrEqual(version) {
        return semver_1.default.gte(this.serverVersion, version);
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
        if (!pluginManager_js_1.PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
            log.info(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`);
        }
        accessories.forEach((accessory) => {
            // noinspection SuspiciousTypeOfGuard
            if (!(accessory instanceof platformAccessory_js_1.PlatformAccessory)) {
                throw new TypeError(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`);
            }
            accessory._associatedPlugin = pluginIdentifier;
        });
        this.emit("publishExternalAccessories" /* InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES */, accessories);
    }
    registerPlatformAccessories(pluginIdentifier, platformName, accessories) {
        accessories.forEach((accessory) => {
            // noinspection SuspiciousTypeOfGuard
            if (!(accessory instanceof platformAccessory_js_1.PlatformAccessory)) {
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
            if (!(accessory instanceof platformAccessory_js_1.PlatformAccessory)) {
                throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`);
            }
        });
        this.emit("unregisterPlatformAccessories" /* InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES */, accessories);
    }
    /**
     * Check if Matter is available in this version of Homebridge
     * @returns true if Homebridge version satisfies >= 2.0.0-alpha.0
     */
    isMatterAvailable() {
        return semver_1.default.gte(this.serverVersion, '2.0.0-alpha.0');
    }
    /**
     * Check if Matter is enabled for this bridge
     * For main bridge: returns true if Matter is enabled in `bridge.matter` config
     * For child bridge: returns true if Matter is enabled in the `_bridge.matter` config
     * @returns true if Matter is enabled
     */
    isMatterEnabled() {
        return this.matterEnabled;
    }
}
exports.HomebridgeAPI = HomebridgeAPI;
//# sourceMappingURL=api.js.map