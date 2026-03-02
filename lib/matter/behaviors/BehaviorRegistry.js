"use strict";
/**
 * Behavior Registry
 *
 * Manages handler registration and accessory state for a MatterServer instance.
 * Each MatterServer has its own BehaviorRegistry for isolated state management.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BehaviorRegistry = void 0;
const logger_js_1 = require("../../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/Behaviors');
/**
 * Registry for behavior handlers and accessory state.
 * Each MatterServer instance has its own BehaviorRegistry.
 */
class BehaviorRegistry {
    // Handler storage: endpointId -> clusterName -> commandName -> handler
    handlers = new Map();
    // Part endpoint mapping: endpointId -> { parentUuid, partId }
    partEndpoints = new Map();
    // Reference to accessories map (not owned by registry)
    accessoriesMap;
    // Reference to MatterServer for state change notifications
    server;
    constructor(accessoriesMap, server) {
        this.accessoriesMap = accessoriesMap;
        this.server = server;
    }
    /**
     * Set the MatterServer reference (called after server is created)
     */
    setServer(server) {
        this.server = server;
    }
    /**
     * Register a command handler for an endpoint
     */
    registerHandler(endpointId, clusterName, commandName, handler) {
        if (!this.handlers.has(endpointId)) {
            this.handlers.set(endpointId, new Map());
        }
        const endpointHandlers = this.handlers.get(endpointId);
        if (!endpointHandlers.has(clusterName)) {
            endpointHandlers.set(clusterName, new Map());
        }
        const clusterHandlers = endpointHandlers.get(clusterName);
        clusterHandlers.set(commandName, handler);
        log.debug(`Registered handler: ${endpointId}.${clusterName}.${commandName}`);
    }
    /**
     * Get a registered handler
     */
    getHandler(endpointId, clusterName, commandName) {
        return this.handlers.get(endpointId)?.get(clusterName)?.get(commandName);
    }
    /**
     * Execute a handler if it exists
     *
     * @param endpointId - Endpoint identifier
     * @param clusterName - Cluster name
     * @param commandName - Command name
     * @param args - Optional arguments to pass to the handler
     * @param context - Optional context information
     * @returns True if handler was found and executed, false otherwise
     */
    async executeHandler(endpointId, clusterName, commandName, args, context) {
        const handler = this.getHandler(endpointId, clusterName, commandName);
        if (!handler) {
            log.warn(`No handler registered for ${endpointId}.${clusterName}.${commandName}`);
            return false;
        }
        try {
            await handler(args, context);
            return true;
        }
        catch (error) {
            log.error(`Handler error for ${endpointId}.${clusterName}.${commandName}:`, error);
            throw error;
        }
    }
    /**
     * Register a part endpoint mapping
     */
    registerPartEndpoint(endpointId, parentUuid, partId) {
        this.partEndpoints.set(endpointId, { parentUuid, partId });
        log.debug(`Registered part endpoint: ${endpointId} -> ${parentUuid}.${partId}`);
    }
    /**
     * Get part endpoint info
     */
    getPartEndpointInfo(endpointId) {
        return this.partEndpoints.get(endpointId);
    }
    /**
     * Sync cluster state to cache
     * Updates the accessory's cached cluster state when values change
     */
    syncStateToCache(endpointId, clusterName, attributes) {
        // Check if this is a part endpoint
        const partInfo = this.partEndpoints.get(endpointId);
        if (partInfo) {
            // Update part cluster state
            const accessory = this.accessoriesMap.get(partInfo.parentUuid);
            if (!accessory?._parts) {
                return;
            }
            const part = accessory._parts.find(p => p.id === partInfo.partId);
            if (!part?.clusters) {
                return;
            }
            if (!part.clusters[clusterName]) {
                part.clusters[clusterName] = {};
            }
            part.clusters[clusterName] = {
                ...part.clusters[clusterName],
                ...attributes,
            };
            log.debug(`Synced ${clusterName} state to cache for part ${partInfo.partId}:`, attributes);
            // Notify server of state change (for UI updates)
            if (this.server) {
                this.server.notifyStateChange(partInfo.parentUuid, clusterName, attributes, partInfo.partId);
            }
        }
        else {
            // Update main accessory cluster state
            const accessory = this.accessoriesMap.get(endpointId);
            if (!accessory?.clusters) {
                return;
            }
            if (!accessory.clusters[clusterName]) {
                accessory.clusters[clusterName] = {};
            }
            accessory.clusters[clusterName] = {
                ...accessory.clusters[clusterName],
                ...attributes,
            };
            log.debug(`Synced ${clusterName} state to cache for ${endpointId}:`, attributes);
            // Notify server of state change (for UI updates)
            if (this.server) {
                this.server.notifyStateChange(endpointId, clusterName, attributes);
            }
        }
    }
    /**
     * Clear all handlers (for cleanup)
     */
    clear() {
        this.handlers.clear();
        this.partEndpoints.clear();
    }
    /**
     * Get statistics
     */
    getStats() {
        let handlerCount = 0;
        for (const endpointHandlers of this.handlers.values()) {
            for (const clusterHandlers of endpointHandlers.values()) {
                handlerCount += clusterHandlers.size;
            }
        }
        return {
            handlerCount,
            partCount: this.partEndpoints.size,
        };
    }
}
exports.BehaviorRegistry = BehaviorRegistry;
//# sourceMappingURL=BehaviorRegistry.js.map