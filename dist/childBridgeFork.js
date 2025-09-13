/* global NodeJS */
import process from 'node:process';
import { HAPStorage } from 'hap-nodejs';
import { HomebridgeAPI } from './api.js';
import { BridgeService } from './bridgeService.js';
import { ChildBridgeExternalPortService } from './externalPortService.js';
import { Logger } from './logger.js';
import { PluginManager } from './pluginManager.js';
import { User } from './user.js';
import 'source-map-support/register.js';
/**
 * This is a standalone script executed as a child process fork
 */
process.title = 'homebridge: child bridge';
export class ChildBridgeFork {
    bridgeService;
    api;
    pluginManager;
    externalPortService;
    type;
    plugin;
    identifier;
    pluginConfig;
    bridgeConfig;
    bridgeOptions;
    homebridgeConfig;
    portRequestCallback = new Map();
    constructor() {
        // tell the parent process we are ready to accept plugin config
        this.sendMessage("ready" /* ChildProcessMessageEventType.READY */);
    }
    sendMessage(type, data) {
        if (process.send) {
            process.send({
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
        this.homebridgeConfig = data.homebridgeConfig;
        // remove the _bridge key (some plugins do not like unknown config)
        for (const config of this.pluginConfig) {
            delete config._bridge;
        }
        // set bridge settings (inherited from main bridge)
        if (this.bridgeOptions.noLogTimestamps) {
            Logger.setTimestampEnabled(false);
        }
        if (this.bridgeOptions.debugModeEnabled) {
            Logger.setDebugEnabled(true);
        }
        if (this.bridgeOptions.forceColourLogging) {
            Logger.forceColor();
        }
        if (this.bridgeOptions.customStoragePath) {
            User.setStoragePath(this.bridgeOptions.customStoragePath);
        }
        // Initialize HAP-NodeJS with a custom persist directory
        HAPStorage.setCustomStoragePath(User.persistPath());
        // load api
        this.api = new HomebridgeAPI();
        this.pluginManager = new PluginManager(this.api);
        this.externalPortService = new ChildBridgeExternalPortService(this);
        // load plugin
        this.plugin = this.pluginManager.loadPlugin(data.pluginPath);
        await this.plugin.load();
        await this.pluginManager.initializePlugin(this.plugin, data.identifier);
        // change process title to include plugin name
        process.title = `homebridge: ${this.plugin.getPluginIdentifier()}`;
        this.sendMessage("loaded" /* ChildProcessMessageEventType.LOADED */, {
            version: this.plugin.version,
        });
    }
    async startBridge() {
        this.bridgeService = new BridgeService(this.api, this.pluginManager, this.externalPortService, this.bridgeOptions, this.bridgeConfig, this.homebridgeConfig);
        // watch bridge events to check when server is online
        this.bridgeService.bridge.on("advertised" /* AccessoryEventTypes.ADVERTISED */, () => {
            this.sendPairedStatusEvent();
        });
        // watch for the paired event to update the server status
        this.bridgeService.bridge.on("paired" /* AccessoryEventTypes.PAIRED */, () => {
            this.sendPairedStatusEvent();
        });
        // watch for the unpaired event to update the server status
        this.bridgeService.bridge.on("unpaired" /* AccessoryEventTypes.UNPAIRED */, () => {
            this.sendPairedStatusEvent();
        });
        // load the cached accessories
        await this.bridgeService.loadCachedPlatformAccessoriesFromDisk();
        for (const config of this.pluginConfig) {
            if (this.type === "platform" /* PluginType.PLATFORM */) {
                const plugin = this.pluginManager.getPluginForPlatform(this.identifier);
                const displayName = config.name || plugin.getPluginIdentifier();
                const logger = Logger.withPrefix(displayName);
                const constructor = plugin.getPlatformConstructor(this.identifier);
                const platform = new constructor(logger, config, this.api);
                if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
                    plugin.assignDynamicPlatform(this.identifier, platform);
                }
                else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
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
                    Logger.internal.warn('Could not load accessory %s as it is missing the required \'name\' property!', this.identifier);
                    return;
                }
                const logger = Logger.withPrefix(displayName);
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
        this.bridgeService.publishBridge();
        this.api.signalFinished();
        // tell the parent we are online
        this.sendMessage("online" /* ChildProcessMessageEventType.ONLINE */);
    }
    /**
     * Request the next available external port from the parent process
     * @param username
     */
    async requestExternalPort(username) {
        return new Promise((resolve) => {
            const requestTimeout = setTimeout(() => {
                Logger.internal.warn('Parent process did not respond to port allocation request within 5 seconds - assigning random port.');
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
        this.sendMessage("status" /* ChildProcessMessageEventType.STATUS_UPDATE */, {
            paired: this.bridgeService?.bridge?._accessoryInfo?.paired() ?? null,
            setupUri: this.bridgeService?.bridge?.setupURI() ?? null,
        });
    }
    shutdown() {
        this.bridgeService.teardown();
    }
}
/**
 * Start Self
 */
const childPluginFork = new ChildBridgeFork();
/**
 * Handle incoming IPC messages from the parent Homebridge process
 */
process.on('message', (message) => {
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
    Logger.internal.info('Got %s, shutting down child bridge process...', signal);
    try {
        childPluginFork.shutdown();
    }
    catch (error) {
        // do nothing
    }
    setTimeout(() => process.exit(128 + signalNum), 5000);
}
process.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2));
process.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15));
/**
 * Ensure orphaned processes are cleaned up
 */
setInterval(() => {
    if (!process.connected) {
        Logger.internal.info('Parent process not connected, terminating process...');
        process.exit(1);
    }
}, 5000);
//# sourceMappingURL=childBridgeFork.js.map