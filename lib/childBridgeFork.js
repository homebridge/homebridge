"use strict";
/* global NodeJS */
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
exports.ChildBridgeFork = void 0;
const node_process_1 = __importDefault(require("node:process"));
const hap_nodejs_1 = require("@homebridge/hap-nodejs");
const api_js_1 = require("./api.js");
const bridgeService_js_1 = require("./bridgeService.js");
const externalPortService_js_1 = require("./externalPortService.js");
const logger_js_1 = require("./logger.js");
const ChildBridgeMatterMessageHandler_js_1 = require("./matter/ChildBridgeMatterMessageHandler.js");
const pluginManager_js_1 = require("./pluginManager.js");
const user_js_1 = require("./user.js");
require("source-map-support/register.js");
/**
 * This is a standalone script executed as a child process fork
 */
node_process_1.default.title = 'homebridge: child bridge';
const matterLogger = logger_js_1.Logger.withPrefix('Matter/ChildManager');
class ChildBridgeFork {
    bridgeService;
    api;
    pluginManager;
    externalPortService;
    // Matter bridge manager (handles Matter server lifecycle)
    matterManager;
    // Matter message handler (delegates Matter IPC handling)
    matterMessageHandler;
    type;
    plugin;
    identifier;
    pluginConfig;
    bridgeConfig;
    bridgeOptions;
    portRequestCallback = new Map();
    constructor() {
        // tell the parent process we are ready to accept plugin config
        this.sendMessage("ready" /* ChildProcessMessageEventType.READY */);
    }
    sendMessage(type, data) {
        if (node_process_1.default.send) {
            node_process_1.default.send({
                id: type,
                data,
            });
        }
    }
    async loadPlugin(data) {
        // set data
        this.type = data.type;
        this.identifier = data.identifier;
        this.pluginConfig = data.pluginConfig;
        this.bridgeConfig = data.bridgeConfig;
        this.bridgeOptions = data.bridgeOptions;
        // remove the _bridge key (some plugins do not like unknown config)
        for (const config of this.pluginConfig) {
            delete config._bridge;
        }
        // set bridge settings (inherited from main bridge)
        if (this.bridgeOptions.noLogTimestamps) {
            logger_js_1.Logger.setTimestampEnabled(false);
        }
        if (this.bridgeOptions.debugModeEnabled) {
            logger_js_1.Logger.setDebugEnabled(true);
        }
        if (this.bridgeOptions.forceColourLogging) {
            logger_js_1.Logger.forceColor();
        }
        if (this.bridgeOptions.customStoragePath) {
            user_js_1.User.setStoragePath(this.bridgeOptions.customStoragePath);
        }
        // Initialize HAP-NodeJS with a custom persist directory
        hap_nodejs_1.HAPStorage.setCustomStoragePath(user_js_1.User.persistPath());
        // load api
        this.api = new api_js_1.HomebridgeAPI();
        this.pluginManager = new pluginManager_js_1.PluginManager(this.api);
        this.externalPortService = new externalPortService_js_1.ChildBridgeExternalPortService(this);
        // load plugin
        this.plugin = this.pluginManager.loadPlugin(data.pluginPath);
        await this.plugin.load();
        await this.pluginManager.initializePlugin(this.plugin, data.identifier);
        // change process title to include plugin name
        node_process_1.default.title = `homebridge: ${this.plugin.getPluginIdentifier()}`;
        this.sendMessage("loaded" /* ChildProcessMessageEventType.LOADED */, {
            version: this.plugin.version,
        });
    }
    async startBridge() {
        // Conditionally load Matter support only if this child bridge has Matter configured
        // This prevents loading heavy Matter.js libraries for child bridges that don't use it
        if (this.bridgeConfig.matter) {
            matterLogger.info('Loading Matter support for child bridge...');
            // Pre-load Matter API for plugin access
            // This must happen before plugins are loaded so they can access api.matter synchronously
            await this.api.loadMatterAPI();
            // Dynamically import Matter manager only when needed
            const { ChildBridgeMatterManager } = await Promise.resolve().then(() => __importStar(require('./matter/index.js')));
            // Create Matter bridge manager
            this.matterManager = new ChildBridgeMatterManager(this.bridgeConfig, this.bridgeOptions, this.api, this.externalPortService, this.pluginManager);
            // Set manager reference on API for getAccessoryState
            this.api._setMatterManager(this.matterManager);
            // Initialize Matter server if configured
            // Pass callback to send status updates when commissioning changes
            await this.matterManager.initialize(() => {
                this.sendPairedStatusEvent();
            });
            // Create Matter message handler to delegate IPC handling
            matterLogger.debug('Creating ChildBridgeMatterMessageHandler...');
            this.matterMessageHandler = new ChildBridgeMatterMessageHandler_js_1.ChildBridgeMatterMessageHandler(this.matterManager, this.bridgeConfig.username, (type, data) => this.sendMessage(type, data));
            matterLogger.debug(`Matter message handler created for child bridge ${this.bridgeConfig.username}`);
        }
        else {
            matterLogger.debug('Matter not configured for this child bridge, skipping Matter setup');
        }
        this.bridgeService = new bridgeService_js_1.BridgeService(this.api, this.pluginManager, this.externalPortService, this.bridgeOptions, this.bridgeConfig);
        // watch bridge events to check when server is online
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.ADVERTISED, () => {
            this.sendPairedStatusEvent();
        });
        // watch for the paired event to update the server status
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.PAIRED, () => {
            this.sendPairedStatusEvent();
        });
        // watch for the unpaired event to update the server status
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.UNPAIRED, () => {
            this.sendPairedStatusEvent();
        });
        // load the cached accessories
        await this.bridgeService.loadCachedPlatformAccessoriesFromDisk();
        for (const config of this.pluginConfig) {
            if (this.type === "platform" /* PluginType.PLATFORM */) {
                const plugin = this.pluginManager.getPluginForPlatform(this.identifier);
                const displayName = config.name || plugin.getPluginIdentifier();
                const logger = logger_js_1.Logger.withPrefix(displayName);
                const constructor = plugin.getPlatformConstructor(this.identifier);
                const platform = new constructor(logger, config, this.api);
                if (api_js_1.HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
                    plugin.assignDynamicPlatform(this.identifier, platform);
                }
                else if (api_js_1.HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
                    await this.bridgeService.loadPlatformAccessories(plugin, platform, this.identifier, logger);
                }
                else {
                    // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
                    // We just call the constructor and let it be enabled.
                }
            }
            else if (this.type === "accessory" /* PluginType.ACCESSORY */) {
                const plugin = this.pluginManager.getPluginForAccessory(this.identifier);
                const displayName = config.name;
                if (!displayName) {
                    logger_js_1.Logger.internal.warn('Could not load accessory %s as it is missing the required \'name\' property!', this.identifier);
                    return;
                }
                const logger = logger_js_1.Logger.withPrefix(displayName);
                const constructor = plugin.getAccessoryConstructor(this.identifier);
                const accessoryInstance = new constructor(logger, config, this.api);
                // pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
                const accessory = this.bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, this.identifier, config.uuid_base);
                if (accessory) {
                    this.bridgeService.bridge.addBridgedAccessory(accessory);
                }
                else {
                    logger('Accessory %s returned empty set of services. Won\'t adding it to the bridge!', this.identifier);
                }
            }
        }
        // restore the cached accessories
        this.bridgeService.restoreCachedPlatformAccessories();
        // Restore Matter accessories if Matter is enabled for this bridge
        if (this.matterManager) {
            this.matterManager.restoreCachedAccessories(this.bridgeOptions.keepOrphanedCachedAccessories ?? false);
        }
        this.bridgeService.publishBridge();
        this.api.signalFinished();
        // Send initial status update with HAP and Matter info BEFORE telling parent we're online
        // This ensures the parent's cache is populated before any UI status updates
        this.sendPairedStatusEvent();
        // tell the parent we are online
        this.sendMessage("online" /* ChildProcessMessageEventType.ONLINE */);
    }
    /**
     * Request the next available external HAP port from the parent process
     * @param username
     */
    async requestExternalPort(username) {
        return new Promise((resolve) => {
            const requestTimeout = setTimeout(() => {
                logger_js_1.Logger.internal.warn('Parent process did not respond to port allocation request within 5 seconds - assigning random port.');
                resolve(undefined);
            }, 5000);
            // setup callback
            const callback = (port) => {
                clearTimeout(requestTimeout);
                resolve(port);
                this.portRequestCallback.delete(username);
            };
            this.portRequestCallback.set(username, callback);
            // send port request
            this.sendMessage("portRequest" /* ChildProcessMessageEventType.PORT_REQUEST */, { username });
        });
    }
    /**
     * Request the next available Matter port from the parent process
     * @param uniqueId - MAC-derived identifier (without colons)
     */
    async requestMatterPort(uniqueId) {
        return new Promise((resolve) => {
            const requestTimeout = setTimeout(() => {
                matterLogger.warn('Parent process did not respond to Matter port allocation request within 5 seconds - assigning random port.');
                resolve(undefined);
            }, 5000);
            // Use uniqueId as the key for the callback map
            const mac = uniqueId;
            // setup callback
            const callback = (port) => {
                clearTimeout(requestTimeout);
                resolve(port);
                this.portRequestCallback.delete(mac);
            };
            this.portRequestCallback.set(mac, callback);
            // send Matter port request
            this.sendMessage("portRequest" /* ChildProcessMessageEventType.PORT_REQUEST */, {
                username: mac,
                portType: 'matter',
            });
        });
    }
    /**
     * Handles the port allocation response message from the parent process
     * @param data
     */
    handleExternalResponse(data) {
        const callback = this.portRequestCallback.get(data.username);
        if (callback) {
            callback(data.port);
        }
    }
    /**
     * Sends the current pairing status of the child bridge to the parent process
     */
    sendPairedStatusEvent() {
        // Get Matter commissioning info if Matter is enabled
        const matterInfo = this.matterManager?.getMatterStatusInfo();
        this.sendMessage("status" /* ChildProcessMessageEventType.STATUS_UPDATE */, {
            paired: this.bridgeService?.bridge?._accessoryInfo?.paired() ?? null,
            setupUri: this.bridgeService?.bridge?.setupURI() ?? null,
            // Include Matter commissioning info in unified message
            ...(matterInfo && { matter: matterInfo }),
        });
    }
    /**
     * Handle start Matter monitoring request from parent process
     */
    handleStartMatterMonitoring() {
        this.matterMessageHandler?.handleStartMatterMonitoring();
    }
    /**
     * Handle stop Matter monitoring request from parent process
     */
    handleStopMatterMonitoring() {
        this.matterMessageHandler?.handleStopMatterMonitoring();
    }
    /**
     * Handle get Matter accessories request from parent process
     */
    handleGetMatterAccessories() {
        if (!this.matterMessageHandler) {
            // Matter not initialized yet or not configured - send empty response
            // This can happen during startup before Matter finishes initializing
            if (!this.bridgeConfig) {
                // Bridge config not loaded yet, too early to respond
                return;
            }
            const event = {
                type: 'accessoriesData',
                data: {
                    bridgeUsername: this.bridgeConfig.username,
                    accessories: [],
                },
            };
            this.sendMessage("matterEvent" /* ChildProcessMessageEventType.MATTER_EVENT */, event);
            return;
        }
        this.matterMessageHandler.handleGetMatterAccessories();
    }
    /**
     * Handle get Matter accessory info request from parent process
     */
    handleGetMatterAccessoryInfo(data) {
        this.matterMessageHandler?.handleGetMatterAccessoryInfo(data);
    }
    /**
     * Handle Matter accessory control request from parent process
     */
    handleMatterAccessoryControl(data) {
        this.matterMessageHandler?.handleMatterAccessoryControl(data);
    }
    shutdown() {
        this.bridgeService.teardown();
        // Teardown Matter servers (main bridge and external accessories)
        if (this.matterManager) {
            this.matterManager.teardown().catch((error) => {
                matterLogger.error('Error tearing down Matter manager:', error);
            });
        }
    }
}
exports.ChildBridgeFork = ChildBridgeFork;
/**
 * Start Self
 */
const childPluginFork = new ChildBridgeFork();
/**
 * Handle incoming IPC messages from the parent Homebridge process
 */
node_process_1.default.on('message', (message) => {
    if (typeof message !== 'object' || !message.id) {
        return;
    }
    switch (message.id) {
        case "load" /* ChildProcessMessageEventType.LOAD */: {
            childPluginFork.loadPlugin(message.data);
            break;
        }
        case "start" /* ChildProcessMessageEventType.START */: {
            childPluginFork.startBridge();
            break;
        }
        case "portAllocated" /* ChildProcessMessageEventType.PORT_ALLOCATED */: {
            childPluginFork.handleExternalResponse(message.data);
            break;
        }
        case "startMatterMonitoring" /* ChildProcessMessageEventType.START_MATTER_MONITORING */: {
            childPluginFork.handleStartMatterMonitoring();
            break;
        }
        case "stopMatterMonitoring" /* ChildProcessMessageEventType.STOP_MATTER_MONITORING */: {
            childPluginFork.handleStopMatterMonitoring();
            break;
        }
        case "getMatterAccessories" /* ChildProcessMessageEventType.GET_MATTER_ACCESSORIES */: {
            childPluginFork.handleGetMatterAccessories();
            break;
        }
        case "getMatterAccessoryInfo" /* ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO */: {
            childPluginFork.handleGetMatterAccessoryInfo(message.data);
            break;
        }
        case "matterAccessoryControl" /* ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL */: {
            childPluginFork.handleMatterAccessoryControl(message.data);
            break;
        }
    }
});
/**
 * Handle the sigterm shutdown signals
 */
let shuttingDown = false;
function signalHandler(signal, signalNum) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    logger_js_1.Logger.internal.info('Got %s, shutting down child bridge process...', signal);
    try {
        childPluginFork.shutdown();
    }
    catch (error) {
        // do nothing
    }
    setTimeout(() => node_process_1.default.exit(128 + signalNum), 5000);
}
node_process_1.default.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2));
node_process_1.default.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15));
/**
 * Ensure orphaned processes are cleaned up
 */
setInterval(() => {
    if (!node_process_1.default.connected) {
        logger_js_1.Logger.internal.info('Parent process not connected, terminating process...');
        node_process_1.default.exit(1);
    }
}, 5000);
//# sourceMappingURL=childBridgeFork.js.map