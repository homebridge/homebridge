/**
 * Registry Manager
 *
 * Manages the mapping between endpoints and their behavior registries.
 * Each MatterServer instance creates its own RegistryManager, which is then
 * attached to endpoints via EndpointContext. This design allows multiple
 * MatterServer instances (main bridge + external accessories) to coexist
 * without registry conflicts.
 */
import type { BehaviorRegistry } from './BehaviorRegistry.js';
/**
 * Registry manager for a specific MatterServer instance.
 * Each MatterServer creates its own RegistryManager instance.
 */
export declare class RegistryManager {
    private endpointToRegistry;
    /**
     * Register a registry for a specific endpoint
     */
    registerEndpoint(endpointId: string, registry: BehaviorRegistry): void;
    /**
     * Get the registry for a specific endpoint
     */
    getRegistry(endpointId: string): BehaviorRegistry;
    /**
     * Unregister an endpoint (cleanup)
     */
    unregisterEndpoint(endpointId: string): void;
    /**
     * Clear all registrations (for cleanup/testing)
     */
    clear(): void;
    /**
     * Get statistics
     */
    getStats(): {
        endpointCount: number;
        endpoints: string[];
    };
}
//# sourceMappingURL=RegistryManager.d.ts.map