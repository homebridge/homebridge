"use strict";
/**
 * Matter.js Server Implementation for Homebridge Plugin API
 *
 * This is a thin facade that delegates to focused submodules under ./server/.
 * All public method signatures are preserved for external callers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterServer = void 0;
const node_events_1 = require("node:events");
const main_1 = require("@matter/main");
const logger_js_1 = require("../logger.js");
const index_js_1 = require("./behaviors/index.js");
const logFormatter_js_1 = require("./logFormatter.js");
const index_js_2 = require("./server/index.js");
const types_js_1 = require("./types.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
/**
 * Matter Server for Homebridge Plugin API
 * Allows plugins to register Matter accessories explicitly
 */
class MatterServer extends node_events_1.EventEmitter {
    // --- Internal state ---
    config;
    serverNode = null;
    aggregator = null;
    accessories = new Map();
    behaviorRegistry;
    registryManager;
    isRunning = false;
    shutdownHandler = null;
    cleanupHandlers = [];
    accessoryCache = null;
    monitoringEnabled = false;
    // Public properties for bridge identification
    username;
    bridgeName;
    // --- Sub-modules ---
    commissioningManager;
    fabricManager;
    serverLifecycle;
    stateManager;
    accessoryManager;
    accessoryQuery;
    constructor(config) {
        super();
        // Store the validated config
        this.config = (0, index_js_2.validateAndSanitizeConfig)(config);
        // Initialize bridge identification properties
        const cleanId = this.config.uniqueId.replace(/[^A-F0-9]/gi, '');
        this.username = cleanId.match(/.{1,2}/g)?.slice(0, 6).join(':').toUpperCase() || this.config.uniqueId;
        this.bridgeName = this.config.serialNumber ? `Matter Bridge ${this.config.serialNumber}` : 'Matter Bridge';
        // Configure Matter.js library logging
        if (this.config.debugModeEnabled) {
            log.info('Matter debug mode enabled - verbose logging active');
            main_1.Logger.level = main_1.LogLevel.DEBUG;
        }
        else {
            main_1.Logger.level = main_1.LogLevel.NOTICE;
        }
        main_1.Logger.format = (0, logFormatter_js_1.createHomebridgeLogFormatter)();
        main_1.Logger.destinations.default.write = (text) => {
            if (text.trim() !== '') {
                console.log(text); // eslint-disable-line no-console
            }
        };
        // Initialize sub-modules
        this.commissioningManager = new index_js_2.CommissioningManager();
        this.fabricManager = new index_js_2.FabricManager(() => this.serverNode, () => this.serverLifecycle.matterStoragePath);
        this.serverLifecycle = new index_js_2.ServerLifecycle();
        this.behaviorRegistry = new index_js_1.BehaviorRegistry(this.accessories, this);
        this.registryManager = new index_js_1.RegistryManager();
        this.stateManager = new index_js_2.StateManager(this.accessories, this, () => this.monitoringEnabled);
        this.accessoryManager = new index_js_2.AccessoryManager();
        this.accessoryQuery = new index_js_2.AccessoryQuery(this.accessories, () => this.accessoryCache);
    }
    // ============================================================================
    // Lifecycle methods
    // ============================================================================
    async start() {
        return this.serverLifecycle.start(this.getLifecycleDeps());
    }
    async runServer() {
        return this.serverLifecycle.runServer(this.getLifecycleDeps());
    }
    async stop() {
        return this.serverLifecycle.stop(this.getLifecycleDeps(), this.accessories);
    }
    // ============================================================================
    // Accessory registration (Plugin API - matches HAP pattern)
    // ============================================================================
    async registerPlatformAccessories(pluginIdentifier, platformName, accessories) {
        for (const accessory of accessories) {
            await this.accessoryManager.registerAccessory(pluginIdentifier, platformName, accessory, this.getAccessoryManagerDeps());
        }
    }
    async unregisterAccessory(uuid) {
        return this.accessoryManager.unregisterAccessory(uuid, this.getAccessoryManagerDeps());
    }
    async unregisterPlatformAccessories(_pluginIdentifier, _platformName, accessories) {
        for (const accessory of accessories) {
            await this.accessoryManager.unregisterAccessory(accessory.UUID, this.getAccessoryManagerDeps());
        }
    }
    async updatePlatformAccessories(accessories) {
        if (!this.accessoryCache) {
            log.warn('Cannot update Matter platform accessories - cache not initialized');
            return;
        }
        for (const accessory of accessories) {
            const internal = accessory;
            if (!this.accessories.has(accessory.UUID)) {
                log.warn(`Cannot update Matter accessory ${accessory.UUID} - not registered in current session`);
                continue;
            }
            if (!this.accessoryCache.hasCached(accessory.UUID)) {
                log.warn(`Cannot update Matter accessory ${accessory.UUID} - not found in cache`);
                continue;
            }
            this.accessories.set(accessory.UUID, internal);
            log.debug(`Updated Matter accessory ${accessory.UUID} (${accessory.displayName})`);
        }
        this.accessoryCache.requestSave(this.accessories);
    }
    // ============================================================================
    // State management (Plugin API)
    // ============================================================================
    async updateAccessoryState(uuid, cluster, attributes, partId) {
        return this.stateManager.updateAccessoryState(uuid, cluster, attributes, partId);
    }
    getAccessoryState(uuid, cluster, partId) {
        return this.stateManager.getAccessoryState(uuid, cluster, partId);
    }
    async triggerCommand(uuid, cluster, command, args, partId) {
        return this.stateManager.triggerCommand(uuid, cluster, command, args, partId);
    }
    // ============================================================================
    // Accessory queries
    // ============================================================================
    getAccessories() {
        return this.accessoryQuery.getAccessories();
    }
    getAccessory(uuid) {
        return this.accessoryQuery.getAccessory(uuid);
    }
    getAllCachedAccessories() {
        return this.accessoryQuery.getAllCachedAccessories();
    }
    collectAccessories(bridgeUsername, bridgeType, bridgeName) {
        return this.accessoryQuery.collectAccessories(bridgeUsername, bridgeType, bridgeName);
    }
    getAccessoryInfo(uuid) {
        return this.accessoryQuery.getAccessoryInfo(uuid);
    }
    // ============================================================================
    // Fabric management
    // ============================================================================
    getFabricInfo() {
        return this.fabricManager.getFabricInfo();
    }
    isCommissioned() {
        return this.fabricManager.isCommissioned();
    }
    getCommissionedFabricCount() {
        return this.fabricManager.getCommissionedFabricCount();
    }
    async removeFabric(fabricIndex) {
        return this.fabricManager.removeFabric(fabricIndex);
    }
    hasFabric(fabricIndex) {
        return this.fabricManager.hasFabric(fabricIndex);
    }
    // ============================================================================
    // Commissioning info
    // ============================================================================
    getCommissioningInfo() {
        return {
            ...this.commissioningManager.commissioningInfo,
            serialNumber: this.config.serialNumber || this.config.uniqueId,
            passcode: this.commissioningManager.passcode,
            discriminator: this.commissioningManager.discriminator,
            commissioned: this.isCommissioned(),
        };
    }
    // ============================================================================
    // Server info & monitoring
    // ============================================================================
    getServerInfo() {
        return {
            running: this.isRunning,
            port: this.config.port || 5540,
            deviceCount: this.accessories.size,
            commissioned: this.isCommissioned(),
            fabricCount: this.getCommissionedFabricCount(),
            serialNumber: this.config.serialNumber || this.config.uniqueId,
        };
    }
    getStorageStats() {
        // Storage is now managed natively by matter.js
        return null;
    }
    isServerRunning() {
        return this.isRunning;
    }
    getDeviceTypes() {
        return types_js_1.deviceTypes;
    }
    getClusters() {
        return types_js_1.clusters;
    }
    enableStateMonitoring() {
        this.monitoringEnabled = true;
        log.debug('Matter state monitoring enabled');
    }
    disableStateMonitoring() {
        this.monitoringEnabled = false;
        log.debug('Matter state monitoring disabled');
    }
    isMonitoringEnabled() {
        return this.monitoringEnabled;
    }
    notifyStateChange(uuid, cluster, state, partId) {
        this.stateManager.notifyStateChange(uuid, cluster, state, partId);
    }
    // ============================================================================
    // Internal dependency builders for sub-modules
    // ============================================================================
    getCommissioningDeps() {
        return {
            config: this.config,
            serverNode: this.serverNode,
            matterStoragePath: this.serverLifecycle.matterStoragePath,
            serialNumber: this.config.serialNumber || this.config.uniqueId,
            emitter: this,
            fabricManager: this.fabricManager,
        };
    }
    getLifecycleDeps() {
        return {
            config: this.config,
            commissioningManager: this.commissioningManager,
            fabricManager: this.fabricManager,
            getCommissioningDeps: () => this.getCommissioningDeps(),
            accessoryCache: this.accessoryCache,
            setAccessoryCache: (cache) => {
                this.accessoryCache = cache;
            },
            setServerNode: (node) => {
                this.serverNode = node;
            },
            getServerNode: () => this.serverNode,
            setAggregator: (agg) => {
                this.aggregator = agg;
            },
            getAggregator: () => this.aggregator,
            setIsRunning: (running) => {
                this.isRunning = running;
            },
            getIsRunning: () => this.isRunning,
            cleanupHandlers: this.cleanupHandlers,
            shutdownHandler: this.shutdownHandler,
            setShutdownHandler: (handler) => {
                this.shutdownHandler = handler;
            },
            onStop: () => this.stop(),
        };
    }
    getAccessoryManagerDeps() {
        return {
            config: this.config,
            accessories: this.accessories,
            behaviorRegistry: this.behaviorRegistry,
            registryManager: this.registryManager,
            accessoryCache: this.accessoryCache,
            getServerNode: () => this.serverNode,
            getAggregator: () => this.aggregator,
            getIsRunning: () => this.isRunning,
            getMonitoringEnabled: () => this.monitoringEnabled,
            isCommissioned: () => this.isCommissioned(),
        };
    }
}
exports.MatterServer = MatterServer;
//# sourceMappingURL=server.js.map