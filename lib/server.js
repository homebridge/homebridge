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
exports.Server = exports.ServerStatus = void 0;
const node_fs_1 = require("node:fs");
const node_process_1 = __importDefault(require("node:process"));
const hap_nodejs_1 = require("@homebridge/hap-nodejs");
const chalk_1 = __importDefault(require("chalk"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const api_js_1 = require("./api.js");
const bridgeService_js_1 = require("./bridgeService.js");
const childBridgeService_js_1 = require("./childBridgeService.js");
const externalPortService_js_1 = require("./externalPortService.js");
const ipcService_js_1 = require("./ipcService.js");
const logger_js_1 = require("./logger.js");
const config_js_1 = require("./matter/config.js");
const pluginManager_js_1 = require("./pluginManager.js");
const user_js_1 = require("./user.js");
const mac_js_1 = require("./util/mac.js");
const log = logger_js_1.Logger.internal;
const matterLogger = logger_js_1.Logger.withPrefix('Matter/MainManager');
// eslint-disable-next-line no-restricted-syntax
var ServerStatus;
(function (ServerStatus) {
    /**
     * When the server is starting up
     */
    ServerStatus["PENDING"] = "pending";
    /**
     * When the server is online and has published the main bridge
     */
    ServerStatus["OK"] = "ok";
    /**
     * When the server is shutting down
     */
    ServerStatus["DOWN"] = "down";
})(ServerStatus || (exports.ServerStatus = ServerStatus = {}));
class Server {
    options;
    api;
    pluginManager;
    bridgeService;
    externalPortService;
    ipcService;
    config;
    // used to keep track of child bridges
    // Key is HAP username (MAC address)
    childBridges = new Map();
    // Matter bridge manager (handles Matter server lifecycle)
    // Lazy-loaded only when Matter is configured to avoid loading heavy Matter.js libraries
    matterManager;
    // Registry of external Matter bridge usernames to their owning bridge
    // Key: external Matter bridge username (e.g., CE:65:F2:E2:D5:98)
    // Value: owner bridge username (main bridge or child bridge MAC address)
    externalMatterBridgeRegistry = new Map();
    // Matter monitoring state (for UI accessories page)
    matterMonitoringActive = false;
    matterMonitoringClients = 0;
    // current server status
    serverStatus = "pending" /* ServerStatus.PENDING */;
    constructor(options = {}) {
        this.options = options;
        this.config = Server.loadConfig();
        // object we feed to Plugins and BridgeService
        this.api = new api_js_1.HomebridgeAPI();
        this.ipcService = new ipcService_js_1.IpcService();
        // Collect all configured Matter ports to avoid conflicts
        const configuredMatterPorts = config_js_1.MatterConfigCollector.collectConfiguredMatterPorts(this.config);
        this.externalPortService = new externalPortService_js_1.ExternalPortService(this.config.ports, this.config.matterPorts, configuredMatterPorts);
        // set status to pending
        this.setServerStatus("pending" /* ServerStatus.PENDING */);
        // create new plugin manager
        const pluginManagerOptions = {
            activePlugins: this.config.plugins,
            disabledPlugins: this.config.disabledPlugins,
            customPluginPath: options.customPluginPath,
            strictPluginResolution: options.strictPluginResolution,
        };
        this.pluginManager = new pluginManager_js_1.PluginManager(this.api, pluginManagerOptions);
        // create new bridge service
        const bridgeConfig = {
            cachedAccessoriesDir: user_js_1.User.cachedAccessoryPath(),
            cachedAccessoriesItemName: 'cachedAccessories',
        };
        // shallow copy the homebridge options to the bridge options object
        Object.assign(bridgeConfig, this.options);
        this.bridgeService = new bridgeService_js_1.BridgeService(this.api, this.pluginManager, this.externalPortService, bridgeConfig, this.config.bridge);
        // Note: MatterBridgeManager creation is deferred to start() to avoid loading
        // heavy Matter.js libraries during construction when Matter may not be configured
        // Handle platform accessory registration
        this.api.on("registerPlatformAccessories" /* InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES */, this.handleRegisterPlatformAccessories.bind(this));
        this.api.on("unregisterPlatformAccessories" /* InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES */, this.handleUnregisterPlatformAccessories.bind(this));
        // Handle external accessories (cameras, etc.)
        this.api.on("publishExternalAccessories" /* InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES */, this.handlePublishExternalAccessories.bind(this));
        // Watch bridge events to check when server is online
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.ADVERTISED, () => {
            this.setServerStatus("ok" /* ServerStatus.OK */);
        });
        // watch for the paired event to update the server status
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.PAIRED, () => {
            this.setServerStatus(this.serverStatus);
        });
        // watch for the unpaired event to update the server status
        this.bridgeService.bridge.on(hap_nodejs_1.AccessoryEventTypes.UNPAIRED, () => {
            this.setServerStatus(this.serverStatus);
        });
    }
    /**
     * Set the current server status and update parent via IPC
     * @param status
     */
    setServerStatus(status) {
        this.serverStatus = status;
        const statusUpdate = {
            status: this.serverStatus,
            paired: this.bridgeService?.bridge?._accessoryInfo?.paired() ?? null,
            setupUri: this.bridgeService?.bridge?.setupURI() ?? null,
            name: this.config.bridge.name,
            username: this.config.bridge.username,
            pin: this.config.bridge.pin,
            matter: this.matterManager?.getMatterStatus() ?? { enabled: false },
        };
        this.ipcService.sendMessage("serverStatusUpdate" /* IpcOutgoingEvent.SERVER_STATUS_UPDATE */, statusUpdate);
    }
    async start() {
        if (this.config.bridge.disableIpc !== true) {
            this.initializeIpcEventHandlers();
        }
        const promises = [];
        // load the cached accessories
        await this.bridgeService.loadCachedPlatformAccessoriesFromDisk();
        // initialize plugins
        await this.pluginManager.initializeInstalledPlugins();
        // Lazy-load and initialize Matter only if configured
        // Heavy Matter.js libraries are loaded here (async), avoiding sync blocking during construction
        if (config_js_1.MatterConfigCollector.hasMatterConfig(this.config)) {
            // Validate Matter configuration (lazy-loads validator)
            await config_js_1.MatterConfigCollector.validateMatterConfig(this.config);
            // Check again after validation (invalid configs may have been removed)
            if (config_js_1.MatterConfigCollector.hasMatterConfig(this.config)) {
                // Dynamically import MatterBridgeManager only when needed
                // This prevents loading heavy Matter.js libraries when Matter is not configured
                const { MatterBridgeManager } = await Promise.resolve().then(() => __importStar(require('./matter/MatterBridgeManager.js')));
                // Create the manager
                this.matterManager = new MatterBridgeManager(this.config, this.api, this.externalPortService, this.pluginManager, this.options, this);
                // Set manager reference on API for getAccessoryState
                this.api._setMatterManager(this.matterManager);
                // Initialize Matter server for main bridge if enabled
                await this.matterManager.initialize();
            }
        }
        if (this.config.platforms.length > 0) {
            promises.push(...this.loadPlatforms());
        }
        if (this.config.accessories.length > 0) {
            this.loadAccessories();
        }
        // start child bridges
        for (const childBridge of this.childBridges.values()) {
            childBridge.start();
        }
        // restore cached accessories
        this.bridgeService.restoreCachedPlatformAccessories();
        this.matterManager?.restoreCachedAccessories(this.options.keepOrphanedCachedAccessories ?? false);
        this.api.signalFinished();
        // wait for all platforms to publish their accessories before we publish the bridge
        await Promise.all(promises);
        this.publishBridge();
    }
    async teardown() {
        this.bridgeService.teardown();
        // Teardown Matter servers (main bridge and external accessories)
        await this.matterManager?.teardown();
        this.setServerStatus("down" /* ServerStatus.DOWN */);
    }
    publishBridge() {
        this.bridgeService.publishBridge();
        this.printSetupInfo(this.config.bridge.pin);
    }
    handlePublishExternalAccessories(accessories) {
        // External accessories are published via HAP
        // Plugins should use api.matter to register Matter accessories explicitly
        log.info(`Publishing ${accessories.length} external accessories`);
    }
    handleRegisterPlatformAccessories(accessories) {
        // Route to HAP bridge
        this.bridgeService.handleRegisterPlatformAccessories(accessories);
    }
    handleUnregisterPlatformAccessories(accessories) {
        // Route to HAP bridge
        this.bridgeService.handleUnregisterPlatformAccessories(accessories);
    }
    /**
     * Handle Matter command trigger from IPC (for UI control)
     * This is called by IPC handlers, not API events
     */
    async handleTriggerMatterCommand(uuid, cluster, attributes, partId) {
        if (!this.matterManager) {
            throw new Error('Matter manager not initialized');
        }
        await this.matterManager.handleTriggerCommand(uuid, cluster, attributes, partId);
    }
    static loadConfig() {
        // Look for the configuration file
        const configPath = user_js_1.User.configPath();
        const defaultBridge = {
            name: 'Homebridge',
            username: 'CC:22:3D:E3:CE:30',
            pin: '031-45-154',
        };
        if (!(0, node_fs_1.existsSync)(configPath)) {
            log.warn('config.json (%s) not found.', configPath);
            return {
                bridge: defaultBridge,
                accessories: [],
                platforms: [],
            };
        }
        let config;
        try {
            config = JSON.parse((0, node_fs_1.readFileSync)(configPath, { encoding: 'utf8' }));
        }
        catch (error) {
            log.error('There was a problem reading your config.json file.');
            log.error('Please try pasting your config.json file here to validate it: https://jsonlint.com');
            log.error('');
            throw error;
        }
        if (config.ports !== undefined) {
            if (config.ports.start && config.ports.end) {
                if (config.ports.start > config.ports.end) {
                    log.error('Invalid port pool configuration. End should be greater than or equal to start.');
                    config.ports = undefined;
                }
            }
            else {
                log.error('Invalid configuration for \'ports\'. Missing \'start\' and \'end\' properties! Ignoring it!');
                config.ports = undefined;
            }
        }
        // Validate Matter port pool configuration
        config_js_1.MatterConfigCollector.validateMatterPortsPool(config);
        const bridge = config.bridge || defaultBridge;
        bridge.name = bridge.name || defaultBridge.name;
        bridge.username = bridge.username || defaultBridge.username;
        bridge.pin = bridge.pin || defaultBridge.pin;
        config.bridge = bridge;
        const username = config.bridge.username;
        if (!(0, mac_js_1.validMacAddress)(username)) {
            throw new Error(`Not a valid username: ${username}. Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`);
        }
        config.accessories = config.accessories || [];
        config.platforms = config.platforms || [];
        if (!Array.isArray(config.accessories)) {
            log.error('Value provided for accessories must be an array[]');
            config.accessories = [];
        }
        if (!Array.isArray(config.platforms)) {
            log.error('Value provided for platforms must be an array[]');
            config.platforms = [];
        }
        log.info('Loaded config.json with %s accessories and %s platforms.', config.accessories.length, config.platforms.length);
        if (config.bridge.advertiser) {
            if (![
                hap_nodejs_1.MDNSAdvertiser.BONJOUR,
                hap_nodejs_1.MDNSAdvertiser.CIAO,
                hap_nodejs_1.MDNSAdvertiser.AVAHI,
                hap_nodejs_1.MDNSAdvertiser.RESOLVED,
            ].includes(config.bridge.advertiser)) {
                config.bridge.advertiser = undefined;
                log.error('Value provided in bridge.advertiser is not valid, reverting to platform default.');
            }
        }
        else {
            config.bridge.advertiser = undefined;
        }
        return config;
    }
    loadAccessories() {
        log.info(`Loading ${this.config.accessories.length} accessories...`);
        this.config.accessories.forEach((accessoryConfig, index) => {
            if (!accessoryConfig.accessory) {
                log.warn('Your config.json contains an illegal accessory configuration object at position %d. '
                    + 'Missing property \'accessory\'. Skipping entry...', index + 1); // we rather count from 1 for the normal people?
                return;
            }
            const accessoryIdentifier = accessoryConfig.accessory;
            const displayName = accessoryConfig.name;
            if (!displayName) {
                log.warn('Could not load accessory %s at position %d as it is missing the required \'name\' property!', accessoryIdentifier, index + 1);
                return;
            }
            let plugin;
            let constructor;
            try {
                plugin = this.pluginManager.getPluginForAccessory(accessoryIdentifier);
            }
            catch (error) {
                log.error(error.message);
                return;
            }
            // check the plugin is not disabled
            if (plugin.disabled) {
                log.warn(`Ignoring config for the accessory "${accessoryIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
                return;
            }
            try {
                constructor = plugin.getAccessoryConstructor(accessoryIdentifier);
            }
            catch (error) {
                log.error(`Error loading the accessory "${accessoryIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
                log.error(error); // error message contains more information and full stack trace
                return;
            }
            const logger = logger_js_1.Logger.withPrefix(displayName);
            logger('Initializing %s accessory...', accessoryIdentifier);
            if (accessoryConfig._bridge) {
                // ensure the username is always uppercase
                accessoryConfig._bridge.username = accessoryConfig._bridge.username.toUpperCase();
                try {
                    this.validateChildBridgeConfig("accessory" /* PluginType.ACCESSORY */, accessoryIdentifier, accessoryConfig._bridge);
                }
                catch (error) {
                    log.error(error.message);
                    return;
                }
                let childBridge;
                if (this.childBridges.has(accessoryConfig._bridge.username)) {
                    childBridge = this.childBridges.get(accessoryConfig._bridge.username);
                    logger(`Adding to existing child bridge ${accessoryConfig._bridge.username}`);
                }
                else {
                    logger(`Initializing child bridge ${accessoryConfig._bridge.username}`);
                    childBridge = new childBridgeService_js_1.ChildBridgeService("accessory" /* PluginType.ACCESSORY */, accessoryIdentifier, plugin, accessoryConfig._bridge, this.config, this.options, this.api, this.ipcService, this.externalPortService);
                    // Set callback for external Matter bridge registration
                    childBridge.onExternalBridgeRegistered = this.registerExternalMatterBridge.bind(this);
                    this.childBridges.set(accessoryConfig._bridge.username, childBridge);
                }
                // add config to child bridge service
                childBridge.addConfig(accessoryConfig);
                return;
            }
            const accessoryInstance = new constructor(logger, accessoryConfig, this.api);
            // pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
            const accessory = this.bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base);
            if (accessory) {
                try {
                    this.bridgeService.bridge.addBridgedAccessory(accessory);
                }
                catch (error) {
                    logger.error(`Error loading the accessory "${accessoryIdentifier}" from "${plugin.getPluginIdentifier()}" requested in your config.json:`, error.message);
                }
            }
            else {
                logger.info('Accessory %s returned empty set of services; not adding it to the bridge.', accessoryIdentifier);
            }
        });
    }
    loadPlatforms() {
        log.info(`Loading ${this.config.platforms.length} platforms...`);
        const promises = [];
        this.config.platforms.forEach((platformConfig, index) => {
            if (!platformConfig.platform) {
                log.warn('Your config.json contains an illegal platform configuration object at position %d. '
                    + 'Missing property \'platform\'. Skipping entry...', index + 1); // we rather count from 1 for the normal people?
                return;
            }
            const platformIdentifier = platformConfig.platform;
            const displayName = platformConfig.name || platformIdentifier;
            let plugin;
            let constructor;
            // do not load homebridge-config-ui-x when running in service mode
            if (platformIdentifier === 'config' && node_process_1.default.env.UIX_SERVICE_MODE === '1') {
                return;
            }
            try {
                plugin = this.pluginManager.getPluginForPlatform(platformIdentifier);
            }
            catch (error) {
                log.error(error.message);
                return;
            }
            // check the plugin is not disabled
            if (plugin.disabled) {
                log.warn(`Ignoring config for the platform "${platformIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`);
                return;
            }
            try {
                constructor = plugin.getPlatformConstructor(platformIdentifier);
            }
            catch (error) {
                log.error(`Error loading the platform "${platformIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`);
                log.error(error); // error message contains more information and full stack trace
                return;
            }
            const logger = logger_js_1.Logger.withPrefix(displayName);
            logger('Initializing %s platform...', platformIdentifier);
            if (platformConfig._bridge) {
                // ensure the username is always uppercase
                platformConfig._bridge.username = platformConfig._bridge.username.toUpperCase();
                try {
                    this.validateChildBridgeConfig("platform" /* PluginType.PLATFORM */, platformIdentifier, platformConfig._bridge);
                }
                catch (error) {
                    log.error(error.message);
                    return;
                }
                logger(`Initializing child bridge ${platformConfig._bridge.username}`);
                const childBridge = new childBridgeService_js_1.ChildBridgeService("platform" /* PluginType.PLATFORM */, platformIdentifier, plugin, platformConfig._bridge, this.config, this.options, this.api, this.ipcService, this.externalPortService);
                // Set callback for external Matter bridge registration
                childBridge.onExternalBridgeRegistered = this.registerExternalMatterBridge.bind(this);
                this.childBridges.set(platformConfig._bridge.username, childBridge);
                // add config to child bridge service
                childBridge.addConfig(platformConfig);
                return;
            }
            const platform = new constructor(logger, platformConfig, this.api);
            if (api_js_1.HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
                plugin.assignDynamicPlatform(platformIdentifier, platform);
            }
            else if (api_js_1.HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
                promises.push(this.bridgeService.loadPlatformAccessories(plugin, platform, platformIdentifier, logger));
            }
            else {
                // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
                // We just call the constructor and let it be enabled.
            }
        });
        return promises;
    }
    /**
     * Validate an external bridge config
     */
    validateChildBridgeConfig(type, identifier, bridgeConfig) {
        // All child bridges require username
        if (!bridgeConfig.username) {
            throw new Error(`Error loading the ${type} "${identifier}" requested in your config.json - `
                + 'Missing required field "_bridge.username".');
        }
        if (!(0, mac_js_1.validMacAddress)(bridgeConfig.username)) {
            throw new Error(`Error loading the ${type} "${identifier}" requested in your config.json - `
                + `not a valid username in _bridge.username: "${bridgeConfig.username}". Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`);
        }
        if (this.childBridges.has(bridgeConfig.username)) {
            const childBridge = this.childBridges.get(bridgeConfig.username);
            if (type === "platform" /* PluginType.PLATFORM */) {
                // only a single platform can exist on one child bridge
                throw new Error(`Error loading the ${type} "${identifier}" requested in your config.json - `
                    + `Duplicate username found in _bridge.username: "${bridgeConfig.username}". Each platform child bridge must have it's own unique username.`);
            }
            else if (childBridge?.identifier !== identifier) {
                // only accessories of the same type can be added to the same child bridge
                throw new Error(`Error loading the ${type} "${identifier}" requested in your config.json - `
                    + `Duplicate username found in _bridge.username: "${bridgeConfig.username}". You can only group accessories of the same type in a child bridge.`);
            }
        }
        if (bridgeConfig.username === this.config.bridge.username.toUpperCase()) {
            throw new Error(`Error loading the ${type} "${identifier}" requested in your config.json - `
                + `Username found in _bridge.username: "${bridgeConfig.username}" is the same as the main bridge. Each child bridge platform/accessory must have it's own unique username.`);
        }
    }
    /**
     * Takes care of the IPC Events sent to Homebridge
     */
    initializeIpcEventHandlers() {
        // start ipc service
        this.ipcService.start();
        // handle restart child bridge event
        this.ipcService.on("restartChildBridge" /* IpcIncomingEvent.RESTART_CHILD_BRIDGE */, (username) => {
            // noinspection SuspiciousTypeOfGuard
            if (typeof username === 'string') {
                const childBridge = this.childBridges.get(username.toUpperCase());
                childBridge?.restartChildBridge();
            }
        });
        // handle stop child bridge event
        this.ipcService.on("stopChildBridge" /* IpcIncomingEvent.STOP_CHILD_BRIDGE */, (username) => {
            // noinspection SuspiciousTypeOfGuard
            if (typeof username === 'string') {
                const childBridge = this.childBridges.get(username.toUpperCase());
                childBridge?.stopChildBridge();
            }
        });
        // handle start child bridge event
        this.ipcService.on("startChildBridge" /* IpcIncomingEvent.START_CHILD_BRIDGE */, (username) => {
            // noinspection SuspiciousTypeOfGuard
            if (typeof username === 'string') {
                const childBridge = this.childBridges.get(username.toUpperCase());
                childBridge?.startChildBridge();
            }
        });
        this.ipcService.on("childBridgeMetadataRequest" /* IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST */, () => {
            this.ipcService.sendMessage("childBridgeMetadataResponse" /* IpcOutgoingEvent.CHILD_BRIDGE_METADATA_RESPONSE */, Array.from(this.childBridges.values()).map(x => x.getMetadata()));
        });
        // Matter monitoring lifecycle handlers
        this.ipcService.on("startMatterMonitoring" /* IpcIncomingEvent.START_MATTER_MONITORING */, () => {
            this.handleStartMatterMonitoring();
        });
        this.ipcService.on("stopMatterMonitoring" /* IpcIncomingEvent.STOP_MATTER_MONITORING */, () => {
            this.handleStopMatterMonitoring();
        });
        this.ipcService.on("getMatterAccessories" /* IpcIncomingEvent.GET_MATTER_ACCESSORIES */, (data) => {
            void this.handleGetMatterAccessories(data?.bridgeUsername);
        });
        this.ipcService.on("getMatterAccessoryInfo" /* IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO */, (data) => {
            this.handleGetMatterAccessoryInfo(data?.uuid);
        });
        this.ipcService.on("matterAccessoryControl" /* IpcIncomingEvent.MATTER_ACCESSORY_CONTROL */, (data) => {
            void this.handleMatterAccessoryControl(data);
        });
        // handle reload plugin event
        this.ipcService.on("reloadPlugin" /* IpcIncomingEvent.RELOAD_PLUGIN */, (pluginIdentifier) => {
            if (typeof pluginIdentifier === 'string') {
                this.pluginManager.reloadPlugin(pluginIdentifier).catch((error) => {
                    log.error(`Failed to reload plugin '${pluginIdentifier}':`, error.message);
                });
            }
        });
    }
    /**
     * Handle start Matter monitoring request from UI
     * Only starts monitoring if this is the first client
     */
    handleStartMatterMonitoring() {
        this.matterMonitoringClients++;
        // Only setup monitoring if this is the first client
        if (this.matterMonitoringClients === 1) {
            this.matterMonitoringActive = true;
            // Enable monitoring on main bridge Matter servers
            this.matterManager?.enableStateMonitoring();
            // Enable monitoring on all child bridges
            for (const childBridge of this.childBridges.values()) {
                childBridge.startMatterMonitoring();
            }
            const event = {
                type: 'monitoringStarted',
                data: { success: true },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
        else {
            // Already monitoring, just acknowledge
            const event = {
                type: 'monitoringStarted',
                data: { success: true, alreadyActive: true },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
    }
    /**
     * Handle stop Matter monitoring request from UI
     * Only stops monitoring when no more clients
     */
    handleStopMatterMonitoring() {
        this.matterMonitoringClients--;
        // Only stop monitoring when no more clients
        if (this.matterMonitoringClients <= 0) {
            this.matterMonitoringClients = 0;
            this.matterMonitoringActive = false;
            // Disable monitoring on main bridge Matter servers
            this.matterManager?.disableStateMonitoring();
            // Disable monitoring on all child bridges
            for (const childBridge of this.childBridges.values()) {
                childBridge.stopMatterMonitoring();
            }
            const event = {
                type: 'monitoringStopped',
                data: { success: true },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
        else {
            // Other clients still monitoring
            const event = {
                type: 'monitoringStopped',
                data: { success: true, othersActive: true },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
    }
    /**
     * Register an external Matter bridge (e.g., robot vacuum with own bridge)
     * This allows routing control commands directly to the correct owner
     * @param externalBridgeUsername - Username of the external Matter bridge
     * @param ownerUsername - Username of the bridge that owns it (main bridge or child bridge username)
     */
    registerExternalMatterBridge(externalBridgeUsername, ownerUsername) {
        const normalizedExternal = externalBridgeUsername.toUpperCase();
        const normalizedOwner = ownerUsername.toUpperCase();
        matterLogger.debug(`Registering external Matter bridge ${normalizedExternal} → owner: ${normalizedOwner}`);
        this.externalMatterBridgeRegistry.set(normalizedExternal, normalizedOwner);
    }
    /**
     * Get Matter accessories for a specific bridge or all bridges
     * @param bridgeUsername - Optional: specific bridge username (MAC format)
     */
    async handleGetMatterAccessories(bridgeUsername) {
        // Check if monitoring is active
        if (!this.matterMonitoringActive) {
            matterLogger.warn('Matter monitoring not active - cannot get accessories');
            const event = {
                type: 'accessoriesData',
                data: {
                    bridgeUsername,
                    error: 'Matter monitoring not active',
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
            return;
        }
        // Check if Matter is enabled on main bridge
        if (!this.api.isMatterEnabled() && this.childBridges.size === 0) {
            const event = {
                type: 'accessoriesData',
                data: {
                    bridgeUsername,
                    accessories: [],
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
            return;
        }
        try {
            // Get accessories from main bridge
            const allAccessories = this.matterManager?.collectAllAccessories(bridgeUsername) || [];
            // Request from child bridges and wait briefly for responses
            if (this.childBridges.size > 0) {
                // Clear previous responses
                for (const childBridge of this.childBridges.values()) {
                    childBridge.lastMatterAccessoriesResponse = undefined;
                }
                // Request from all child bridges
                for (const childBridge of this.childBridges.values()) {
                    childBridge.getMatterAccessories();
                }
                // Wait up to 500ms for child bridges to respond
                await new Promise(resolve => setTimeout(resolve, 500));
                // Collect responses from child bridges
                for (const childBridge of this.childBridges.values()) {
                    if (childBridge.lastMatterAccessoriesResponse?.accessories) {
                        const accessories = childBridge.lastMatterAccessoriesResponse.accessories;
                        allAccessories.push(...accessories);
                    }
                }
            }
            const event = {
                type: 'accessoriesData',
                data: {
                    bridgeUsername: bridgeUsername || 'all',
                    accessories: allAccessories,
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
        catch (error) {
            matterLogger.error('Failed to get Matter accessories:', error);
            const event = {
                type: 'accessoriesData',
                data: {
                    bridgeUsername,
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
    }
    /**
     * Get detailed info for a specific Matter accessory
     */
    handleGetMatterAccessoryInfo(uuid) {
        if (!uuid) {
            const event = {
                type: 'accessoryInfoData',
                data: {
                    error: 'UUID is required',
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
            return;
        }
        try {
            // Try to get from main bridge first
            const accessoryInfo = this.matterManager?.getAccessoryInfo(uuid);
            if (accessoryInfo) {
                const event = {
                    type: 'accessoryInfoData',
                    data: accessoryInfo,
                };
                this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
                return;
            }
            // If not found in main bridge, forward to child bridges with Matter enabled.
            // Child bridges will respond directly if they have the accessory
            for (const childBridge of this.childBridges.values()) {
                // Only forward to bridges with Matter enabled
                if (childBridge.getMetadata().matterConfig) {
                    childBridge.getMatterAccessoryInfo(uuid);
                }
            }
            // If no child bridge responds, we'll send error after a timeout
            // For now, assume child bridges will handle it
        }
        catch (error) {
            matterLogger.error('Failed to get Matter accessory info:', error);
            const event = {
                type: 'accessoryInfoData',
                data: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                },
            };
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, event);
        }
    }
    /**
     * Handle Matter accessory control command
     */
    async handleMatterAccessoryControl(data) {
        matterLogger.debug(`Matter control request: uuid=${data?.uuid}, cluster=${data?.cluster}, bridge=${data?.bridgeUsername || 'auto'}, part=${data?.partId || 'main'}`);
        if (!data?.uuid || !data?.cluster || !data?.attributes) {
            matterLogger.error('Missing required parameters for Matter control');
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                type: 'accessoryControlResponse',
                data: {
                    success: false,
                    error: 'Missing required parameters',
                },
            });
            return;
        }
        // If bridge username is provided, route directly to that bridge
        if (data.bridgeUsername) {
            const targetUsername = data.bridgeUsername.toUpperCase();
            // Check if it's the main bridge
            if (targetUsername === this.config.bridge.username.toUpperCase()) {
                matterLogger.debug(`Routing to main bridge (${targetUsername})`);
                try {
                    await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId);
                    matterLogger.debug(`Main bridge successfully controlled accessory ${data.uuid}`);
                    this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                        type: 'accessoryControlResponse',
                        data: {
                            success: true,
                            uuid: data.uuid,
                        },
                    });
                }
                catch (error) {
                    matterLogger.error(`Main bridge failed to control ${data.uuid}: ${error.message}`);
                    this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                        type: 'accessoryControlResponse',
                        data: {
                            success: false,
                            error: error.message,
                            uuid: data.uuid,
                        },
                    });
                }
                return;
            }
            // Check if it's a specific child bridge
            for (const childBridge of this.childBridges.values()) {
                if (childBridge.getMetadata().username.toUpperCase() === targetUsername) {
                    matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${targetUsername})`);
                    childBridge.controlMatterAccessory(data);
                    return;
                }
            }
            // Check if it's an external Matter bridge (e.g., robot vacuum with own bridge)
            // Use registry for efficient direct routing
            const ownerUsername = this.externalMatterBridgeRegistry.get(targetUsername);
            if (ownerUsername) {
                matterLogger.debug(`Found external bridge ${targetUsername} in registry, owned by ${ownerUsername}`);
                if (ownerUsername === this.config.bridge.username.toUpperCase()) {
                    // External accessory on main bridge
                    matterLogger.debug(`Routing to main bridge's external accessories for ${data.uuid}`);
                    try {
                        await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId);
                        matterLogger.debug(`External accessory ${data.uuid} successfully controlled via main bridge`);
                        this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                            type: 'accessoryControlResponse',
                            data: {
                                success: true,
                                uuid: data.uuid,
                            },
                        });
                    }
                    catch (error) {
                        matterLogger.error(`Main bridge failed to control external accessory ${data.uuid}: ${error.message}`);
                        this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                            type: 'accessoryControlResponse',
                            data: {
                                success: false,
                                error: error.message,
                                uuid: data.uuid,
                            },
                        });
                    }
                }
                else {
                    // External accessory on child bridge - lookup by username
                    const childBridge = this.childBridges.get(ownerUsername);
                    if (childBridge) {
                        matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${ownerUsername}) for external accessory ${data.uuid}`);
                        childBridge.controlMatterAccessory(data);
                    }
                    else {
                        matterLogger.error(`Owner bridge ${ownerUsername} not found for external bridge ${targetUsername}`);
                        this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                            type: 'accessoryControlResponse',
                            data: {
                                success: false,
                                error: `Owner bridge ${ownerUsername} not found`,
                                uuid: data.uuid,
                            },
                        });
                    }
                }
                return;
            }
            // Bridge username provided but not found anywhere
            // With registry, we should always be able to find the bridge if the data is correct
            matterLogger.error(`Bridge ${targetUsername} not found in main/child bridges or registry`);
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                type: 'accessoryControlResponse',
                data: {
                    success: false,
                    error: `Bridge ${targetUsername} not found`,
                    uuid: data.uuid,
                },
            });
            return;
        }
        // No bridge username provided - broadcast mode (try main, then all children)
        matterLogger.debug(`Broadcast mode: trying main bridge for accessory ${data.uuid}`);
        try {
            await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId);
            matterLogger.debug(`Main bridge successfully controlled accessory ${data.uuid}`);
            this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                type: 'accessoryControlResponse',
                data: {
                    success: true,
                    uuid: data.uuid,
                },
            });
        }
        catch (error) {
            // Main bridge doesn't have accessory - forward to child bridges with Matter enabled
            const matterChildBridges = Array.from(this.childBridges.values()).filter(bridge => bridge.getMetadata().matterConfig);
            if (matterChildBridges.length > 0) {
                matterLogger.debug(`Main bridge doesn't have accessory ${data.uuid}, forwarding to ${matterChildBridges.length} child bridge(s) with Matter enabled`);
                for (const childBridge of matterChildBridges) {
                    childBridge.controlMatterAccessory(data);
                }
            }
            else {
                matterLogger.warn(`Accessory ${data.uuid} not found - not on main bridge and no child bridges with Matter available`);
                this.ipcService.sendMessage("matterEvent" /* IpcOutgoingEvent.MATTER_EVENT */, {
                    type: 'accessoryControlResponse',
                    data: {
                        success: false,
                        error: 'Accessory not found',
                        uuid: data.uuid,
                    },
                });
            }
        }
    }
    printSetupInfo(pin) {
        /* eslint-disable no-console */
        console.log('Setup Payload:');
        console.log(this.bridgeService.bridge.setupURI());
        if (!this.options.hideQRCode) {
            console.log('Scan this code with your HomeKit app on your iOS device to pair with Homebridge:');
            qrcode_terminal_1.default.setErrorLevel('M'); // HAP specifies level M or higher for ECC
            qrcode_terminal_1.default.generate(this.bridgeService.bridge.setupURI());
            console.log('Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:');
        }
        else {
            console.log('Enter this code with your HomeKit app on your iOS device to pair with Homebridge:');
        }
        console.log(chalk_1.default.black.bgWhite('                       '));
        console.log(chalk_1.default.black.bgWhite('    ┌────────────┐     '));
        console.log(chalk_1.default.black.bgWhite(`    │ ${pin} │     `));
        console.log(chalk_1.default.black.bgWhite('    └────────────┘     '));
        console.log(chalk_1.default.black.bgWhite('                       '));
        /* eslint-enable no-console */
    }
}
exports.Server = Server;
//# sourceMappingURL=server.js.map