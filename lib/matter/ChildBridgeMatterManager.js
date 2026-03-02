"use strict";
/**
 * Child Bridge Matter Manager
 *
 * Manages Matter server lifecycle and accessories for child bridges.
 * This class extracts Matter-specific logic from childBridgeFork.ts to minimize changes to core files.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildBridgeMatterManager = void 0;
const node_process_1 = __importDefault(require("node:process"));
const logger_js_1 = require("../logger.js");
const user_js_1 = require("../user.js");
const BaseMatterManager_js_1 = require("./BaseMatterManager.js");
const ExternalMatterAccessoryPublisher_js_1 = require("./ExternalMatterAccessoryPublisher.js");
const server_js_1 = require("./server.js");
const utils_js_1 = require("./utils.js");
const log = logger_js_1.Logger.withPrefix('Matter/ChildManager');
/**
 * Manages Matter server and accessories for a child bridge
 */
class ChildBridgeMatterManager extends BaseMatterManager_js_1.BaseMatterManager {
    bridgeConfig;
    bridgeOptions;
    api;
    externalPortService;
    // Matter configuration from bridge config
    matterConfig;
    // Stored serial number for status updates
    matterSerialNumber;
    constructor(bridgeConfig, bridgeOptions, api, externalPortService, pluginManager) {
        super(pluginManager);
        this.bridgeConfig = bridgeConfig;
        this.bridgeOptions = bridgeOptions;
        this.api = api;
        this.externalPortService = externalPortService;
        this.matterConfig = bridgeConfig.matter;
    }
    /**
     * Initialize Matter server for child bridge if enabled
     * @param onCommissioningChanged Optional callback when commissioning status changes
     */
    async initialize(onCommissioningChanged) {
        // Check if Matter is configured
        if (!this.matterConfig) {
            return;
        }
        log.debug(`Child bridge ${this.bridgeConfig.username} has Matter config (Combined HAP+Matter), starting Matter server`);
        // If Matter doesn't have a port configured, allocate one
        if (!this.matterConfig.port) {
            // Generate a unique username for Matter port allocation
            const matterUsername = (0, utils_js_1.appendUsernameSuffix)(this.bridgeConfig.username, 'MATTER');
            const matterPort = await this.externalPortService.requestPort(matterUsername);
            if (!matterPort) {
                throw new Error('Failed to allocate Matter port for child bridge. '
                    + 'Please specify a port manually in the _bridge.matter configuration, or free up ports in the configured range.');
            }
            this.matterConfig.port = matterPort;
            log.debug(`Allocated Matter port: ${this.matterConfig.port} (HAP port: ${this.bridgeConfig.port})`);
        }
        // Start Matter server
        await this.startMatterServer(this.matterConfig);
        // Listen for commissioning status changes to update parent process
        if (onCommissioningChanged && this.matterServer) {
            this.matterServer.on('commissioning-status-changed', (commissioned, fabricCount) => {
                log.info(`Matter commissioning status changed for child bridge ${this.bridgeConfig.username}: commissioned=${commissioned}, fabricCount=${fabricCount}`);
                onCommissioningChanged();
            });
        }
        // Listen for state changes and forward to parent process
        if (this.matterServer) {
            this.matterServer.on('stateChange', ({ uuid, cluster, state, partId }) => {
                if (node_process_1.default.send) {
                    node_process_1.default.send({
                        id: 'matterEvent',
                        data: {
                            type: 'accessoryUpdate',
                            data: {
                                uuid,
                                cluster,
                                state,
                                partId,
                            },
                        },
                    });
                }
            });
        }
    }
    /**
     * Start Matter server for child bridge
     */
    async startMatterServer(matterConfig) {
        log.info(`Starting Matter server for child bridge ${this.bridgeConfig.username}`);
        // Create Matter server with the provided configuration
        const serialNumber = this.bridgeConfig.username.replace(/:/g, '');
        // Normalize bind config to array format
        const networkInterfaces = (0, utils_js_1.normalizeBindConfig)(this.bridgeConfig.bind);
        this.matterServer = new server_js_1.MatterServer({
            port: matterConfig.port || 5540,
            uniqueId: serialNumber,
            storagePath: user_js_1.User.matterPath(),
            debugModeEnabled: this.bridgeOptions.debugModeEnabled,
            manufacturer: this.bridgeConfig.manufacturer,
            model: this.bridgeConfig.model,
            firmwareRevision: this.bridgeConfig.firmwareRevision,
            serialNumber,
            networkInterfaces,
        });
        await this.matterServer.start();
        // Inform the API that Matter is enabled
        this.api._setMatterEnabled(true);
        // Set the Matter server reference for API methods like getAccessoryState
        this.api._setMatterServer(this.matterServer);
        const commissioningInfo = this.matterServer.getCommissioningInfo();
        log.info(`Matter server started for child bridge ${this.bridgeConfig.username} with commissioning info:`, commissioningInfo);
        // Store the serial number for status updates
        this.matterSerialNumber = commissioningInfo.serialNumber;
        // Set up event listeners for Matter API calls
        this.setupEventListeners();
    }
    /**
     * Set up Matter API event listeners
     */
    setupEventListeners() {
        this.api.on("publishExternalMatterAccessories" /* InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES */, (accessories, registrationId) => {
            this.handlePublishExternalAccessories(accessories, registrationId).catch((error) => {
                log.error('Failed to publish external Matter accessories:', error);
                // Make sure to resolve the registration even on error
                this.api._resolveExternalRegistration(registrationId);
            });
        });
        this.api.on("registerMatterPlatformAccessories" /* InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES */, (pluginIdentifier, platformName, accessories) => {
            this.handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories).catch((error) => {
                log.error(`Failed to register Matter accessories for ${pluginIdentifier}:`, error);
            });
        });
        this.api.on("updateMatterPlatformAccessories" /* InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES */, (accessories) => {
            this.handleUpdatePlatformAccessories(accessories).catch((error) => {
                log.error('Failed to update Matter platform accessories:', error);
            });
        });
        this.api.on("unregisterMatterPlatformAccessories" /* InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES */, (pluginIdentifier, platformName, accessories) => {
            this.handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories).catch((error) => {
                log.error(`Failed to unregister Matter accessories for ${pluginIdentifier}:`, error);
            });
        });
        this.api.on("unregisterExternalMatterAccessories" /* InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES */, (accessories) => {
            this.handleUnregisterExternalAccessories(accessories).catch((error) => {
                log.error('Failed to unregister external Matter accessories:', error);
            });
        });
        this.api.on("updateMatterAccessoryState" /* InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE */, (uuid, cluster, attributes, partId) => {
            this.handleUpdateAccessoryState(uuid, cluster, attributes, partId).catch((error) => {
                log.error(`Failed to update Matter accessory state for ${uuid}:`, error);
            });
        });
    }
    /**
     * Handle external Matter accessories - each gets its own dedicated Matter server
     * This is required for devices like Robotic Vacuum Cleaners that Apple Home
     * requires to be on their own bridge.
     */
    async handlePublishExternalAccessories(accessories, registrationId) {
        log.info(`Publishing ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from child bridge ${this.bridgeConfig.username}`);
        try {
            // Normalize bind config to array format (inherit from bridge)
            const networkInterfaces = (0, utils_js_1.normalizeBindConfig)(this.bridgeConfig.bind);
            for (const accessory of accessories) {
                try {
                    // Check if already published
                    if (this.externalMatterServers.has(accessory.UUID)) {
                        log.warn(`External Matter accessory ${accessory.displayName} (${accessory.UUID}) is already published`);
                        continue;
                    }
                    // Publish the accessory using shared helper
                    const result = await (0, ExternalMatterAccessoryPublisher_js_1.publishExternalMatterAccessory)(accessory, {
                        portService: this.externalPortService,
                        networkInterfaces,
                        debugModeEnabled: this.bridgeOptions.debugModeEnabled,
                    });
                    if (!result) {
                        // Validation or publishing failed (errors already logged by helper)
                        continue;
                    }
                    // Store the server instance
                    this.externalMatterServers.set(accessory.UUID, result.server);
                    // Listen for state changes and forward to parent process
                    // (same pattern as the child bridge server listener in initialize())
                    result.server.on('stateChange', ({ uuid, cluster, state, partId }) => {
                        if (node_process_1.default.send) {
                            node_process_1.default.send({
                                id: 'matterEvent',
                                data: {
                                    type: 'accessoryUpdate',
                                    data: {
                                        uuid,
                                        cluster,
                                        state,
                                        partId,
                                    },
                                },
                            });
                        }
                    });
                    // Register the external bridge username with parent process for routing
                    // Send via IPC to parent - parent will register in externalMatterBridgeRegistry
                    if (node_process_1.default.send) {
                        node_process_1.default.send({
                            id: 'matterEvent',
                            data: {
                                type: 'externalBridgeRegistration',
                                data: {
                                    externalBridgeUsername: result.username,
                                    childBridgeUsername: this.bridgeConfig.username,
                                },
                            },
                        });
                    }
                    // Log commissioning info
                    if (result.commissioningInfo.qrCode && result.commissioningInfo.manualPairingCode) {
                        log.info(`📱 Commissioning codes for ${accessory.displayName}:`);
                        log.info(`   QR Code: ${result.commissioningInfo.qrCode}`);
                        log.info(`   Manual Code: ${result.commissioningInfo.manualPairingCode}`);
                    }
                }
                catch (error) {
                    log.error(`Failed to publish external Matter accessory ${accessory.displayName}:`, error);
                }
            }
        }
        finally {
            // Notify that registration is complete (whether successful or not)
            this.api._resolveExternalRegistration(registrationId);
        }
    }
    /**
     * Get Matter status information for IPC communication
     * Returns undefined if Matter is not enabled for this child bridge
     */
    getMatterStatusInfo() {
        if (!this.matterConfig || !this.matterServer) {
            return undefined;
        }
        const commissioningInfo = this.matterServer.getCommissioningInfo();
        return {
            qrCode: commissioningInfo.qrCode,
            manualPairingCode: commissioningInfo.manualPairingCode,
            serialNumber: this.matterSerialNumber || commissioningInfo.serialNumber,
            commissioned: commissioningInfo.commissioned || false,
            deviceCount: this.matterServer.getAccessories().length,
        };
    }
    /**
     * Check if Matter is enabled for this child bridge
     */
    isMatterEnabled() {
        return this.matterServer !== undefined;
    }
    /**
     * Enable state monitoring on all Matter servers
     * Override to add bridge-specific logging
     */
    enableStateMonitoring() {
        log.debug(`Enabling Matter state monitoring for child bridge ${this.bridgeConfig.username}`);
        super.enableStateMonitoring();
    }
    /**
     * Disable state monitoring on all Matter servers
     * Override to add bridge-specific logging
     */
    disableStateMonitoring() {
        log.debug(`Disabling Matter state monitoring for child bridge ${this.bridgeConfig.username}`);
        super.disableStateMonitoring();
    }
    /**
     * Collect all Matter accessories for UI display
     */
    collectAllAccessories() {
        const accessories = [];
        if (this.matterServer) {
            const serverAccessories = this.matterServer.collectAccessories(this.bridgeConfig.username, 'child', this.bridgeConfig.name || 'Child Bridge');
            accessories.push(...serverAccessories);
        }
        // Collect from external servers
        for (const server of this.externalMatterServers.values()) {
            const externalAccessories = server.collectAccessories(server.username, 'external', server.bridgeName);
            accessories.push(...externalAccessories);
        }
        return accessories;
    }
    /**
     * Get detailed info for a specific Matter accessory
     *
     * @param uuid - Accessory UUID
     * @returns Accessory info or undefined if not found
     */
    getAccessoryInfo(uuid) {
        // Check main server
        if (this.matterServer) {
            const info = this.matterServer.getAccessoryInfo(uuid);
            if (info) {
                return info;
            }
        }
        // Check external servers
        for (const server of this.externalMatterServers.values()) {
            const info = server.getAccessoryInfo(uuid);
            if (info) {
                return info;
            }
        }
        return undefined;
    }
    /**
     * Teardown Matter servers
     */
    async teardown() {
        // Stop main Matter server if it was initialized
        if (this.matterServer) {
            log.debug(`Stopping Matter server for child bridge ${this.bridgeConfig.username}`);
            try {
                await this.matterServer.stop();
            }
            catch (error) {
                log.error('Error stopping Matter server:', error);
            }
        }
        // Stop all external Matter servers
        for (const [uuid, matterServer] of this.externalMatterServers) {
            log.debug(`Stopping external Matter server for ${uuid}`);
            try {
                await matterServer.stop();
            }
            catch (error) {
                log.error(`Error stopping external Matter server for ${uuid}:`, error);
            }
        }
        this.externalMatterServers.clear();
    }
}
exports.ChildBridgeMatterManager = ChildBridgeMatterManager;
//# sourceMappingURL=ChildBridgeMatterManager.js.map