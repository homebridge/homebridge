/**
 * WindowCovering Cluster Behavior
 *
 * Handles window covering commands for blinds, shades, and curtains
 */
import type { WindowCovering } from '@matter/main/clusters';
import { WindowCoveringBaseServer } from '@matter/main/behaviors/window-covering';
/**
 * Custom WindowCovering Server that calls plugin handlers
 */
export declare class HomebridgeWindowCoveringServer extends WindowCoveringBaseServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Sync window covering position state to cache
     * @param endpointId - The endpoint ID
     * @param targetProperty - Target position property name (e.g., 'targetPositionLiftPercent100ths')
     * @param currentProperty - Current position property name (e.g., 'currentPositionLiftPercent100ths')
     */
    private syncPositionStateToCache;
    upOrOpen(): Promise<void>;
    downOrClose(): Promise<void>;
    stopMotion(): Promise<void>;
    goToLiftPercentage(request: WindowCovering.GoToLiftPercentageRequest): Promise<void>;
    goToTiltPercentage(request: WindowCovering.GoToTiltPercentageRequest): Promise<void>;
}
//# sourceMappingURL=WindowCoveringBehavior.d.ts.map