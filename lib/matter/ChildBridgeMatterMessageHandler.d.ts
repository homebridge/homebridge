/**
 * Child Bridge Matter Message Handler
 *
 * Handles Matter-related message processing for child bridges.
 * Extracted from childBridgeFork.ts to minimize changes to core files.
 */
import type { ChildBridgeMatterManager } from './ChildBridgeMatterManager.js';
/**
 * Matter message handler for child bridge processes
 * Provides methods to handle Matter-specific requests from the parent process
 */
export declare class ChildBridgeMatterMessageHandler {
    private matterManager;
    private bridgeUsername;
    private sendMessage;
    constructor(matterManager: ChildBridgeMatterManager | undefined, bridgeUsername: string, sendMessage: (type: string, data: unknown) => void);
    /**
     * Handle start Matter monitoring request from parent process
     */
    handleStartMatterMonitoring(): void;
    /**
     * Handle stop Matter monitoring request from parent process
     */
    handleStopMatterMonitoring(): void;
    /**
     * Handle get Matter accessories request from parent process
     */
    handleGetMatterAccessories(data?: {
        correlationId?: string;
    }): void;
    /**
     * Handle get Matter accessory info request from parent process
     */
    handleGetMatterAccessoryInfo(data: {
        uuid: string;
        correlationId?: string;
    }): void;
    /**
     * Handle Matter accessory control request from parent process
     */
    handleMatterAccessoryControl(data: {
        uuid: string;
        cluster: string;
        attributes: Record<string, unknown>;
        partId?: string;
        correlationId?: string;
    }): void;
}
//# sourceMappingURL=ChildBridgeMatterMessageHandler.d.ts.map