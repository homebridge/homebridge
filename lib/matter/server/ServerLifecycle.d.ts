/**
 * Server Lifecycle Manager
 *
 * Handles start(), stop(), cleanup(), waitForServerReady(),
 * runServer(), createServerNodeWithRecovery(), and storage setup.
 */
import type { ServerNode } from '@matter/main';
import type { MatterAccessoryCache } from '../accessoryCache.js';
import type { MatterServerConfig } from '../sharedTypes.js';
import type { CommissioningDeps, CommissioningManager } from './CommissioningManager.js';
import type { FabricManager } from './FabricManager.js';
import { Endpoint, ServerNode as MatterServerNode } from '@matter/main';
import { AggregatorEndpoint as AggregatorEndpointType } from '@matter/main/endpoints';
export interface ServerLifecycleDeps {
    config: MatterServerConfig;
    commissioningManager: CommissioningManager;
    fabricManager: FabricManager;
    getCommissioningDeps: () => CommissioningDeps;
    accessoryCache: MatterAccessoryCache | null;
    setAccessoryCache: (cache: MatterAccessoryCache) => void;
    setServerNode: (node: ServerNode | null) => void;
    getServerNode: () => ServerNode | null;
    setAggregator: (agg: Endpoint<typeof AggregatorEndpointType> | null) => void;
    getAggregator: () => Endpoint<typeof AggregatorEndpointType> | null;
    setIsRunning: (running: boolean) => void;
    getIsRunning: () => boolean;
    cleanupHandlers: Array<() => void | Promise<void>>;
    shutdownHandler: (() => Promise<void>) | null;
    setShutdownHandler: (handler: (() => Promise<void>) | null) => void;
    onStop: () => Promise<void>;
}
export declare class ServerLifecycle {
    matterStoragePath?: string;
    /**
     * Create ServerNode with automatic recovery from corrupted storage
     */
    createServerNodeWithRecovery(nodeOptions: Parameters<typeof MatterServerNode.create>[0], sanitizedId: string): Promise<ServerNode>;
    /**
     * Set up and validate storage
     */
    setupStorage(config: MatterServerConfig): Promise<MatterAccessoryCache>;
    /**
     * Start the Matter server
     */
    start(deps: ServerLifecycleDeps): Promise<void>;
    /**
     * Run the server after devices have been added (for external accessory mode)
     */
    runServer(deps: ServerLifecycleDeps): Promise<void>;
    /**
     * Start the server node, wait for it to be ready, load cache, and update commissioning info.
     * Shared by both start() (non-external mode) and runServer() (deferred external mode).
     */
    private startServerNode;
    /**
     * Wait for the server to be ready
     */
    waitForServerReady(deps: ServerLifecycleDeps, maxWaitTime?: number): Promise<void>;
    /**
     * Stop the Matter server
     */
    stop(deps: ServerLifecycleDeps, accessories: Map<string, any>): Promise<void>;
    /**
     * Cleanup resources
     */
    cleanup(deps: ServerLifecycleDeps): Promise<void>;
}
//# sourceMappingURL=ServerLifecycle.d.ts.map