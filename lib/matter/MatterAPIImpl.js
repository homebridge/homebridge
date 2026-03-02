"use strict";
/**
 * Matter API Implementation
 *
 * Implements the Matter API facade with lazy loading to optimize performance.
 *
 * Architecture:
 * - Separates Matter-specific logic from core HomebridgeAPI class
 * - Uses dynamic imports to prevent loading Matter.js at module parse time
 * - Loads Matter types on first access to `api.matter` properties
 * - Child bridges that don't use Matter have zero Matter.js overhead
 *
 * Performance Impact:
 * - Before: Every child bridge loaded ~800ms of Matter.js code (8-16s on RPi)
 * - After: Only child bridges using Matter load it on first access
 * - Improvement: 75-90% reduction in startup time for multi-bridge setups
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatterAPIImpl = void 0;
const logger_js_1 = require("../logger.js");
const index_js_1 = require("./index.js");
const log = logger_js_1.Logger.withPrefix('Matter/API');
// ============================================================================
// External Device Type Configuration
// ============================================================================
/**
 * Device types that require dedicated external bridges.
 *
 * Some Matter devices (like RoboticVacuumCleaner) are complex and must be
 * published on their own dedicated bridge, not added to the main/child bridge.
 */
const EXTERNAL_DEVICE_TYPES = [
    index_js_1.deviceTypes.RoboticVacuumCleaner,
];
/**
 * Check if a device type requires external bridge publishing.
 * Compares device type IDs for exact match against the external device types list.
 */
function requiresExternalBridge(deviceType) {
    return EXTERNAL_DEVICE_TYPES.some(externalType => externalType.deviceType === deviceType.deviceType);
}
// ============================================================================
/**
 * Validation error for Matter accessories
 */
class MatterAccessoryValidationError extends Error {
    accessory;
    constructor(message, accessory) {
        super(message);
        this.accessory = accessory;
        this.name = 'MatterAccessoryValidationError';
    }
}
/**
 * Implementation of the Matter API
 *
 * This facade provides Matter protocol support through the Homebridge API.
 * It uses lazy loading to prevent loading the heavy Matter.js library until
 * actually needed, improving startup performance for child bridges that don't
 * use Matter.
 *
 * Features:
 * - Lazy-loads Matter types on first access
 * - Validates accessories before registration
 * - Handles both bridge accessories and external standalone devices
 * - Provides detailed error messages for debugging
 * - Delegates to HomebridgeAPI for event emission and server access
 */
class MatterAPIImpl {
    api;
    constructor(api) {
        this.api = api;
    }
    /**
     * Validate a Matter accessory has required fields
     * @throws MatterAccessoryValidationError if validation fails
     */
    validateAccessory(accessory, context) {
        if (!accessory.UUID) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory missing required 'UUID' field`, accessory);
        }
        if (!accessory.displayName) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory '${accessory.UUID}' missing required 'displayName' field`, accessory);
        }
        if (!accessory.deviceType) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'deviceType' field`, accessory);
        }
        if (!accessory.manufacturer) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'manufacturer' field`, accessory);
        }
        if (!accessory.model) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'model' field`, accessory);
        }
        if (!accessory.serialNumber) {
            throw new MatterAccessoryValidationError(`${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'serialNumber' field`, accessory);
        }
    }
    /**
     * Validate an array of accessories, logging errors for invalid ones
     * @returns Array of valid accessories only
     */
    validateAccessories(accessories, context) {
        const validAccessories = [];
        for (const accessory of accessories) {
            try {
                this.validateAccessory(accessory, context);
                validAccessories.push(accessory);
            }
            catch (error) {
                if (error instanceof MatterAccessoryValidationError) {
                    log.error(error.message);
                    log.error('This accessory will not be registered. Please fix the issue in your plugin.');
                }
                else {
                    log.error(`${context}: Unexpected error validating accessory:`, error);
                }
            }
        }
        return validAccessories;
    }
    /**
     * Validate cluster name is valid
     *
     * @param clusterName - Cluster name to validate
     * @param context - Context string for error messages
     */
    validateClusterName(clusterName, context) {
        // Check if cluster name is in the known cluster names
        const validClusterNames = Object.values(index_js_1.clusterNames);
        if (!validClusterNames.includes(clusterName)) {
            log.warn(`${context}: Unknown cluster name '${clusterName}'. This might cause issues. `
                + `Valid clusters: ${validClusterNames.join(', ')}`);
        }
    }
    /**
     * UUID generator (alias of api.hap.uuid for convenience)
     */
    get uuid() {
        return this.api.hap.uuid;
    }
    /**
     * Matter device types for creating accessories
     */
    get deviceTypes() {
        return index_js_1.deviceTypes;
    }
    /**
     * Matter clusters - Direct access to Matter.js cluster definitions
     */
    get clusters() {
        return index_js_1.clusters;
    }
    /**
     * Matter cluster names for type safety and autocomplete
     */
    get clusterNames() {
        return index_js_1.clusterNames;
    }
    /**
     * Matter types - Access to Matter.js cluster type definitions and enums
     */
    get types() {
        return index_js_1.MatterTypes;
    }
    /**
     * Register Matter platform accessories
     * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that need dedicated bridges
     * Validates accessories before registration
     * Returns a promise that resolves when all accessories are fully registered
     */
    async registerPlatformAccessories(pluginIdentifier, platformName, accessories) {
        if (accessories.length === 0) {
            log.warn(`${pluginIdentifier}: Attempted to register 0 Matter accessories`);
            return;
        }
        // Validate all accessories before registration
        const validAccessories = this.validateAccessories(accessories, `registerPlatformAccessories (${pluginIdentifier}/${platformName})`);
        if (validAccessories.length === 0) {
            log.error(`${pluginIdentifier}: All ${accessories.length} Matter accessories failed validation`);
            return;
        }
        if (validAccessories.length < accessories.length) {
            log.warn(`${pluginIdentifier}: ${accessories.length - validAccessories.length} of ${accessories.length} Matter accessories failed validation`);
        }
        // Split accessories into normal (bridge) and external (standalone) based on device type
        const normalAccessories = [];
        const externalAccessories = [];
        for (const accessory of validAccessories) {
            if (requiresExternalBridge(accessory.deviceType)) {
                externalAccessories.push(accessory);
            }
            else {
                normalAccessories.push(accessory);
            }
        }
        // Handle normal accessories (added to bridge)
        if (normalAccessories.length > 0) {
            // Add plugin/platform association
            normalAccessories.forEach((accessory) => {
                const internal = accessory;
                internal._associatedPlugin = pluginIdentifier;
                internal._associatedPlatform = platformName;
            });
            log.debug(`${pluginIdentifier}: Registering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1 ? 'y' : 'ies'} for platform '${platformName}'`);
            this.api.emit("registerMatterPlatformAccessories" /* InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES */, pluginIdentifier, platformName, normalAccessories);
        }
        // Handle external accessories (standalone bridges)
        if (externalAccessories.length > 0) {
            // Add plugin association (no platform for external)
            externalAccessories.forEach((accessory) => {
                const internal = accessory;
                internal._associatedPlugin = pluginIdentifier;
            });
            log.debug(`${pluginIdentifier}: Publishing ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1 ? 'y' : 'ies'} (${externalAccessories.map(a => a.displayName).join(', ')})`);
            // Create a promise to track when external publishing completes
            const registrationId = `${pluginIdentifier}-${Date.now()}-${Math.random()}`;
            const registrationPromise = new Promise((resolve) => {
                // Store the resolve function so it can be called when publishing completes
                // Access internal properties through type assertion
                const internalApi = this.api;
                if (!internalApi._pendingExternalRegistrations) {
                    internalApi._pendingExternalRegistrations = new Map();
                }
                internalApi._pendingExternalRegistrations.set(registrationId, resolve);
            });
            // Emit event with registration ID
            this.api.emit("publishExternalMatterAccessories" /* InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES */, externalAccessories, registrationId);
            // Wait for external publishing to complete
            await registrationPromise;
        }
    }
    /**
     * Update Matter platform accessories in the cache
     * Similar to api.updatePlatformAccessories() for HAP accessories
     */
    async updatePlatformAccessories(accessories) {
        if (accessories.length === 0) {
            log.warn('Attempted to update 0 Matter platform accessories');
            return;
        }
        log.debug(`Updating ${accessories.length} Matter platform accessor${accessories.length === 1 ? 'y' : 'ies'} in cache`);
        // Emit event for Server/ChildBridgeFork to handle
        this.api.emit("updateMatterPlatformAccessories" /* InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES */, accessories);
    }
    /**
     * Unregister Matter platform accessories
     * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that have dedicated bridges
     */
    async unregisterPlatformAccessories(pluginIdentifier, platformName, accessories) {
        if (accessories.length === 0) {
            log.warn(`${pluginIdentifier}: Attempted to unregister 0 Matter accessories`);
            return;
        }
        // Split accessories into normal (bridge) and external (standalone) based on device type
        const normalAccessories = [];
        const externalAccessories = [];
        for (const accessory of accessories) {
            if (requiresExternalBridge(accessory.deviceType)) {
                externalAccessories.push(accessory);
            }
            else {
                normalAccessories.push(accessory);
            }
        }
        // Handle normal accessories (on bridge)
        if (normalAccessories.length > 0) {
            log.debug(`${pluginIdentifier}: Unregistering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1 ? 'y' : 'ies'} from platform '${platformName}'`);
            this.api.emit("unregisterMatterPlatformAccessories" /* InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES */, pluginIdentifier, platformName, normalAccessories);
        }
        // Handle external accessories (standalone bridges)
        if (externalAccessories.length > 0) {
            log.debug(`${pluginIdentifier}: Unregistering ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1 ? 'y' : 'ies'} (${externalAccessories.map(a => a.displayName).join(', ')})`);
            this.api.emit("unregisterExternalMatterAccessories" /* InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES */, externalAccessories);
        }
    }
    /**
     * Update a Matter accessory's cluster state
     * Validates inputs before updating
     */
    async updateAccessoryState(uuid, cluster, attributes, partId) {
        // Validate inputs
        if (!uuid) {
            log.error('updateAccessoryState: uuid parameter is required');
            return;
        }
        if (!cluster) {
            log.error(`updateAccessoryState: cluster parameter is required for accessory ${uuid}`);
            return;
        }
        if (!attributes || Object.keys(attributes).length === 0) {
            log.warn(`updateAccessoryState: No attributes provided for accessory ${uuid}, cluster ${cluster}`);
            return;
        }
        // Validate cluster name (warning only, don't block)
        this.validateClusterName(cluster, `updateAccessoryState (${uuid})`);
        log.debug(`Updating Matter accessory state: uuid=${uuid}, cluster=${cluster}, attributes=${Object.keys(attributes).join(', ')}${partId ? `, partId=${partId}` : ''}`);
        // Emit the event (listeners will be called synchronously by EventEmitter)
        this.api.emit("updateMatterAccessoryState" /* InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE */, uuid, cluster, attributes, partId);
    }
    /**
     * Get a Matter accessory's current cluster state
     * Checks both external servers and main bridge server
     * Validates inputs before retrieving state
     */
    async getAccessoryState(uuid, cluster, partId) {
        // Validate inputs
        if (!uuid) {
            log.error('getAccessoryState: uuid parameter is required');
            return undefined;
        }
        if (!cluster) {
            log.error(`getAccessoryState: cluster parameter is required for accessory ${uuid}`);
            return undefined;
        }
        // Validate cluster name (warning only, don't block)
        this.validateClusterName(cluster, `getAccessoryState (${uuid})`);
        log.debug(`Getting Matter accessory state: uuid=${uuid}, cluster=${cluster}${partId ? `, partId=${partId}` : ''}`);
        // Check external servers first (for accessories like robot vacuums)
        const internalApi = this.api;
        const matterManager = internalApi._matterManager;
        if (matterManager) {
            const externalServer = matterManager.getExternalServer(uuid);
            if (externalServer) {
                return externalServer.getAccessoryState(uuid, cluster, partId);
            }
        }
        // Otherwise, try the main bridge server
        const matterServer = internalApi._matterServer;
        if (!matterServer) {
            log.debug(`getAccessoryState: Matter server not available for accessory ${uuid}`);
            return undefined;
        }
        return matterServer.getAccessoryState(uuid, cluster, partId);
    }
}
exports.MatterAPIImpl = MatterAPIImpl;
//# sourceMappingURL=MatterAPIImpl.js.map