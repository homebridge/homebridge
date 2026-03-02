/**
 * RvcOperationalState Cluster Behavior
 *
 * Handles robotic vacuum cleaner operational state commands
 */
import { RvcOperationalStateServer } from '@matter/main/behaviors/rvc-operational-state';
import { RvcOperationalState } from '@matter/main/clusters/rvc-operational-state';
/**
 * Custom RvcOperationalState Server that calls plugin handlers
 */
export declare class HomebridgeRvcOperationalStateServer extends RvcOperationalStateServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Sync current operational state to cache for UI updates
     * Helper method to avoid code duplication across command handlers
     */
    private syncOperationalStateToCache;
    /**
     * Handle pause command
     * Pauses the vacuum's current operation
     *
     * @returns Command response with error state
     */
    pause(): Promise<RvcOperationalState.OperationalCommandResponse>;
    /**
     * Handle resume command
     * Resumes the vacuum's paused operation
     *
     * @returns Command response with error state
     */
    resume(): Promise<RvcOperationalState.OperationalCommandResponse>;
    /**
     * Handle go home command
     * Sends the vacuum back to its charging dock
     *
     * @returns Command response with error state
     */
    goHome(): Promise<RvcOperationalState.OperationalCommandResponse>;
}
//# sourceMappingURL=RvcOperationalStateBehavior.d.ts.map