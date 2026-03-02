"use strict";
/**
 * Registry Manager
 *
 * Manages the mapping between endpoints and their behavior registries.
 * Each MatterServer instance creates its own RegistryManager, which is then
 * attached to endpoints via EndpointContext. This design allows multiple
 * MatterServer instances (main bridge + external accessories) to coexist
 * without registry conflicts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryManager = void 0;
const logger_js_1 = require("../../logger.js");
const log = logger_js_1.Logger.withPrefix('Matter/RegistryManager');
/**
 * Registry manager for a specific MatterServer instance.
 * Each MatterServer creates its own RegistryManager instance.
 */
class RegistryManager {
    endpointToRegistry = new Map();
    /**
     * Register a registry for a specific endpoint
     */
    registerEndpoint(endpointId, registry) {
        this.endpointToRegistry.set(endpointId, registry);
        log.debug(`Registered registry for endpoint: ${endpointId}`);
    }
    /**
     * Get the registry for a specific endpoint
     */
    getRegistry(endpointId) {
        const registry = this.endpointToRegistry.get(endpointId);
        if (!registry) {
            throw new Error(`No registry found for endpoint ${endpointId}. Available endpoints: ${Array.from(this.endpointToRegistry.keys()).join(', ')}`);
        }
        return registry;
    }
    /**
     * Unregister an endpoint (cleanup)
     */
    unregisterEndpoint(endpointId) {
        this.endpointToRegistry.delete(endpointId);
        log.debug(`Unregistered endpoint: ${endpointId}`);
    }
    /**
     * Clear all registrations (for cleanup/testing)
     */
    clear() {
        this.endpointToRegistry.clear();
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            endpointCount: this.endpointToRegistry.size,
            endpoints: Array.from(this.endpointToRegistry.keys()),
        };
    }
}
exports.RegistryManager = RegistryManager;
//# sourceMappingURL=RegistryManager.js.map