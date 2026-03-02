/**
 * Endpoint Context Utilities
 *
 * Provides a way to attach context (like RegistryManager) to Matter.js endpoints.
 * This allows multiple MatterServer instances to coexist independently.
 */
import type { Endpoint } from '@matter/main';
import type { RegistryManager } from './RegistryManager.js';
/**
 * Symbol for storing RegistryManager on endpoints
 * Using a Symbol prevents naming conflicts with Matter.js properties
 */
declare const REGISTRY_MANAGER_KEY: unique symbol;
/**
 * Extended Endpoint interface with Homebridge context
 */
export interface EndpointWithContext extends Endpoint {
    [REGISTRY_MANAGER_KEY]?: RegistryManager;
}
/**
 * Attach a RegistryManager to an endpoint.
 * Behaviors can then access their registry via this endpoint context.
 */
export declare function setRegistryManager(endpoint: Endpoint, registryManager: RegistryManager): void;
/**
 * Get the RegistryManager attached to an endpoint
 * Throws if no RegistryManager is attached (programming error)
 */
export declare function getRegistryManager(endpoint: Endpoint): RegistryManager;
export {};
//# sourceMappingURL=EndpointContext.d.ts.map