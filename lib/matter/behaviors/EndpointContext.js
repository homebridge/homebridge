"use strict";
/**
 * Endpoint Context Utilities
 *
 * Provides a way to attach context (like RegistryManager) to Matter.js endpoints.
 * This allows multiple MatterServer instances to coexist independently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setRegistryManager = setRegistryManager;
exports.getRegistryManager = getRegistryManager;
/**
 * Symbol for storing RegistryManager on endpoints
 * Using a Symbol prevents naming conflicts with Matter.js properties
 */
const REGISTRY_MANAGER_KEY = Symbol('homebridgeRegistryManager');
/**
 * Attach a RegistryManager to an endpoint.
 * Behaviors can then access their registry via this endpoint context.
 */
function setRegistryManager(endpoint, registryManager) {
    endpoint[REGISTRY_MANAGER_KEY] = registryManager;
}
/**
 * Get the RegistryManager attached to an endpoint
 * Throws if no RegistryManager is attached (programming error)
 */
function getRegistryManager(endpoint) {
    const registryManager = endpoint[REGISTRY_MANAGER_KEY];
    if (!registryManager) {
        throw new Error(`No RegistryManager attached to endpoint ${endpoint.id}. This is a programming error.`);
    }
    return registryManager;
}
//# sourceMappingURL=EndpointContext.js.map