/**
 * Behavior Registry
 *
 * Manages handler registration and accessory state for a MatterServer instance.
 * Each MatterServer has its own BehaviorRegistry for isolated state management.
 */
import type { MatterServer } from '../server.js';
import type { InternalMatterAccessory, MatterHandlerContext } from '../types.js';
/**
 * Handler function signature
 * Matches the signature from types.ts to maintain compatibility with user-defined handlers
 */
export type MatterCommandHandler = (args?: unknown, context?: MatterHandlerContext) => void | Promise<void>;
/**
 * Accessory map type
 */
export type MatterAccessoryMap = Map<string, InternalMatterAccessory>;
/**
 * Registry for behavior handlers and accessory state.
 * Each MatterServer instance has its own BehaviorRegistry.
 */
export declare class BehaviorRegistry {
    private handlers;
    private partEndpoints;
    private accessoriesMap;
    private server?;
    constructor(accessoriesMap: MatterAccessoryMap, server?: MatterServer);
    /**
     * Set the MatterServer reference (called after server is created)
     */
    setServer(server: MatterServer): void;
    /**
     * Register a command handler for an endpoint
     */
    registerHandler(endpointId: string, clusterName: string, commandName: string, handler: MatterCommandHandler): void;
    /**
     * Get a registered handler
     */
    getHandler(endpointId: string, clusterName: string, commandName: string): MatterCommandHandler | undefined;
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
    executeHandler(endpointId: string, clusterName: string, commandName: string, args?: unknown, context?: MatterHandlerContext): Promise<boolean>;
    /**
     * Register a part endpoint mapping
     */
    registerPartEndpoint(endpointId: string, parentUuid: string, partId: string): void;
    /**
     * Get part endpoint info
     */
    getPartEndpointInfo(endpointId: string): {
        parentUuid: string;
        partId: string;
    } | undefined;
    /**
     * Sync cluster state to cache
     * Updates the accessory's cached cluster state when values change
     */
    syncStateToCache(endpointId: string, clusterName: string, attributes: Record<string, unknown>): void;
    /**
     * Clear all handlers (for cleanup)
     */
    clear(): void;
    /**
     * Get statistics
     */
    getStats(): {
        handlerCount: number;
        partCount: number;
    };
}
//# sourceMappingURL=BehaviorRegistry.d.ts.map