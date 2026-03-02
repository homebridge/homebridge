"use strict";
/**
 * Base class for Matter bridge managers
 * Contains shared logic for handling Matter accessory control and state updates
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseMatterManager = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const logger_js_1 = require("../logger.js");
const user_js_1 = require("../user.js");
const mac_js_1 = require("../util/mac.js");
const ClusterCommandMapper_js_1 = require("./ClusterCommandMapper.js");
const log = logger_js_1.Logger.withPrefix('Matter/BaseManager');
/**
 * Base Matter Manager
 * Provides common functionality for both main bridge and child bridge Matter managers
 */
class BaseMatterManager {
    matterServer;
    externalMatterServers = new Map();
    pluginManager;
    constructor(pluginManager) {
        this.pluginManager = pluginManager;
    }
    /**
     * Get an external Matter server by accessory UUID
     *
     * @param uuid - Accessory UUID
     * @returns Matter server instance or undefined if not found
     */
    getExternalServer(uuid) {
        return this.externalMatterServers.get(uuid);
    }
    /**
     * Handle Matter accessory command (triggers user handlers)
     * This is for UI/external control that should invoke plugin handlers
     * Checks both external servers and bridge server
     */
    async handleTriggerCommand(uuid, cluster, attributes, partId) {
        // Map attributes to command using centralized mapper
        const commandMapping = (0, ClusterCommandMapper_js_1.mapAttributesToCommand)(cluster, attributes);
        // Debug logging
        log.debug(`handleTriggerCommand: uuid=${uuid}, cluster=${cluster}, partId=${partId}`);
        log.debug(`Attributes: ${JSON.stringify(attributes)}`);
        log.debug(`Command mapping: ${commandMapping ? JSON.stringify(commandMapping) : 'null (state-only update)'}`);
        log.debug(`External servers count: ${this.externalMatterServers.size}`);
        if (this.externalMatterServers.size > 0) {
            log.debug(`External server UUIDs: ${Array.from(this.externalMatterServers.keys()).join(', ')}`);
        }
        // Check if this is an external accessory first
        const externalServer = this.externalMatterServers.get(uuid);
        if (externalServer) {
            log.debug(`Found external server for ${uuid}`);
            if (commandMapping) {
                // Explicit command invocation
                await externalServer.triggerCommand(uuid, cluster, commandMapping.command, commandMapping.args, partId);
            }
            else {
                // State-only update (triggers change handlers automatically)
                await externalServer.updateAccessoryState(uuid, cluster, attributes, partId);
            }
            return;
        }
        // Otherwise, try the bridge Matter server
        if (!this.matterServer) {
            // This is expected when accessory is on a different bridge - throw error for proper handling
            log.debug(`No matterServer and external server not found for ${uuid}`);
            throw new Error(`Accessory ${uuid} not found on this bridge`);
        }
        log.debug(`Trying matterServer for ${uuid}`);
        if (commandMapping) {
            // Explicit command invocation
            await this.matterServer.triggerCommand(uuid, cluster, commandMapping.command, commandMapping.args, partId);
        }
        else {
            // State-only update (triggers change handlers automatically)
            await this.matterServer.updateAccessoryState(uuid, cluster, attributes, partId);
        }
    }
    /**
     * Handle Matter accessory state updates
     * Checks both external servers and bridge server
     */
    async handleUpdateAccessoryState(uuid, cluster, attributes, partId) {
        // Check if this is an external accessory first
        const externalServer = this.externalMatterServers.get(uuid);
        if (externalServer) {
            await externalServer.updateAccessoryState(uuid, cluster, attributes, partId);
            return;
        }
        // Otherwise, try the bridge Matter server
        if (!this.matterServer) {
            // This is expected when accessory is on a different bridge - throw error for proper handling
            throw new Error(`Accessory ${uuid} not found on this bridge`);
        }
        await this.matterServer.updateAccessoryState(uuid, cluster, attributes, partId);
    }
    /**
     * Enable state monitoring on all Matter servers
     */
    enableStateMonitoring() {
        this.matterServer?.enableStateMonitoring();
        for (const externalServer of this.externalMatterServers.values()) {
            externalServer.enableStateMonitoring();
        }
    }
    /**
     * Disable state monitoring on all Matter servers
     */
    disableStateMonitoring() {
        this.matterServer?.disableStateMonitoring();
        for (const externalServer of this.externalMatterServers.values()) {
            externalServer.disableStateMonitoring();
        }
    }
    /**
     * Restore cached Matter accessories (matching HAP pattern)
     */
    restoreCachedAccessories(keepOrphaned) {
        if (!this.matterServer) {
            return;
        }
        const cachedAccessories = this.matterServer.getAllCachedAccessories();
        log.debug(`Restoring ${cachedAccessories.length} cached Matter accessories`);
        for (const cachedAccessory of cachedAccessories) {
            let plugin = this.pluginManager.getPlugin(cachedAccessory.plugin);
            if (!plugin) {
                try {
                    // Try to find plugin by platform name (handles plugin renames)
                    plugin = this.pluginManager.getPluginByActiveDynamicPlatform(cachedAccessory.platform);
                    if (plugin) {
                        log.info(`When searching for the associated plugin of the Matter accessory '${cachedAccessory.displayName}' `
                            + `it seems like the plugin name changed from '${cachedAccessory.plugin}' to '${plugin.getPluginIdentifier()}'. Plugin association is now being transformed!`);
                    }
                }
                catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    log.warn(`Could not find the associated plugin for the Matter accessory '${cachedAccessory.displayName}'. `
                        + `Tried to find the plugin by the platform name but ${errorMessage}`);
                }
            }
            const platformPlugin = plugin && plugin.getActiveDynamicPlatform(cachedAccessory.platform);
            if (!platformPlugin) {
                log.warn(`Failed to find plugin to handle Matter accessory ${cachedAccessory.displayName} (plugin: ${cachedAccessory.plugin}, platform: ${cachedAccessory.platform})`);
                if (!keepOrphaned) {
                    log.info(`Removing orphaned Matter accessory ${cachedAccessory.displayName}`);
                    this.matterServer.unregisterAccessory(cachedAccessory.uuid).catch((error) => {
                        log.warn(`Failed to unregister orphaned Matter accessory ${cachedAccessory.displayName}:`, error);
                    });
                }
            }
            else {
                // Call configureMatterAccessory if the plugin implements it
                if (platformPlugin.configureMatterAccessory) {
                    log.debug(`Calling configureMatterAccessory for ${cachedAccessory.displayName}`);
                    // Deserialize from cache format to MatterAccessory for plugin
                    const accessory = this.deserializeMatterAccessory(cachedAccessory);
                    platformPlugin.configureMatterAccessory(accessory);
                }
                else {
                    log.debug(`Platform ${cachedAccessory.platform} does not implement configureMatterAccessory`);
                }
            }
        }
    }
    /**
     * Handle registration of Matter platform accessories
     */
    async handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories) {
        if (!this.matterServer) {
            log.warn('Cannot register Matter accessories - Matter server is not running');
            return;
        }
        await this.matterServer.registerPlatformAccessories(pluginIdentifier, platformName, accessories);
    }
    /**
     * Handle updating Matter platform accessories in the cache
     * Checks both external servers and bridge server
     */
    async handleUpdatePlatformAccessories(accessories) {
        const bridgeAccessories = [];
        // Route each accessory to the appropriate server
        for (const accessory of accessories) {
            const externalServer = this.externalMatterServers.get(accessory.UUID);
            if (externalServer) {
                // Update external accessory
                await externalServer.updatePlatformAccessories([accessory]);
            }
            else {
                // Collect accessories for bridge server
                bridgeAccessories.push(accessory);
            }
        }
        // Update accessories on bridge server if any
        if (bridgeAccessories.length > 0) {
            if (!this.matterServer) {
                log.warn('Cannot update Matter platform accessories - Matter server is not running');
                return;
            }
            await this.matterServer.updatePlatformAccessories(bridgeAccessories);
        }
    }
    /**
     * Handle unregistration of Matter platform accessories
     */
    async handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories) {
        if (!this.matterServer) {
            log.warn('Cannot unregister Matter accessories - Matter server is not running');
            return;
        }
        await this.matterServer.unregisterPlatformAccessories(pluginIdentifier, platformName, accessories);
    }
    /**
     * Handle unregistration of external Matter accessories
     * Stops dedicated servers and cleans up storage
     */
    async handleUnregisterExternalAccessories(accessories) {
        log.info(`Unregistering ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'}`);
        for (const accessory of accessories) {
            try {
                // Check if this external server exists
                const matterServer = this.externalMatterServers.get(accessory.UUID);
                if (!matterServer) {
                    log.warn(`External Matter accessory ${accessory.displayName} (${accessory.UUID}) is not registered`);
                    continue;
                }
                log.info(`Stopping external Matter server for ${accessory.displayName}`);
                // Stop the Matter server
                await matterServer.stop();
                // Remove from the map
                this.externalMatterServers.delete(accessory.UUID);
                // Clean up storage folder
                // Generate the same uniqueId that was used when creating the server
                const advertiseAddress = (0, mac_js_1.generate)(accessory.UUID);
                const uniqueId = advertiseAddress.replace(/:/g, '');
                const storagePath = node_path_1.default.join(user_js_1.User.matterPath(), uniqueId);
                try {
                    log.debug(`Removing Matter storage for external accessory at: ${storagePath}`);
                    (0, node_fs_1.rmSync)(storagePath, { recursive: true, force: true });
                    log.info(`✓ Cleaned up storage for external Matter accessory: ${accessory.displayName}`);
                }
                catch (error) {
                    log.error(`Failed to clean up storage for external Matter accessory ${accessory.displayName}:`, error);
                }
                log.info(`✓ External Matter accessory unregistered: ${accessory.displayName}`);
            }
            catch (error) {
                log.error(`Failed to unregister external Matter accessory ${accessory.displayName}:`, error);
            }
        }
    }
    /**
     * Deserialize SerializedMatterAccessory from cache to MatterAccessory for plugin use
     * Converts internal cache format to the public API format plugins expect
     */
    deserializeMatterAccessory(serialized) {
        return {
            UUID: serialized.uuid, // Convert lowercase uuid to uppercase UUID
            displayName: serialized.displayName,
            deviceType: serialized.deviceType, // Type info only (full EndpointType not restorable from cache)
            serialNumber: serialized.serialNumber,
            manufacturer: serialized.manufacturer,
            model: serialized.model,
            firmwareRevision: serialized.firmwareRevision,
            hardwareRevision: serialized.hardwareRevision,
            softwareVersion: serialized.softwareVersion,
            context: serialized.context ?? {}, // Ensure non-optional context
            clusters: serialized.clusters,
            parts: serialized.parts, // Part types not fully restorable from cache
            // Note: handlers and getState are not restored from cache - plugins must provide these
        };
    }
}
exports.BaseMatterManager = BaseMatterManager;
//# sourceMappingURL=BaseMatterManager.js.map