/**
 * ServiceArea Cluster Behavior
 *
 * Handles service area selection for robotic vacuum cleaners
 */
import type { ServiceArea } from '@matter/main/clusters';
import { ServiceAreaServer } from '@matter/main/behaviors/service-area';
/**
 * Custom ServiceArea Server that calls plugin handlers
 */
export declare class HomebridgeServiceAreaServer extends ServiceAreaServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Sync current service area state to cache for UI updates
     * Helper method to avoid code duplication
     *
     * @param includeProgress - Whether to include progress information in the sync
     */
    private syncServiceAreaStateToCache;
    /**
     * Handle select areas command
     * Allows user to select which areas the vacuum should clean
     *
     * @param request - Area selection request with area IDs to clean
     * @returns Response indicating success or failure
     */
    selectAreas(request: ServiceArea.SelectAreasRequest): Promise<ServiceArea.SelectAreasResponse>;
    /**
     * Handle skip area command
     * Allows user to skip cleaning a specific area
     *
     * @param request - Skip area request with area ID to skip
     * @returns Response indicating success or failure
     */
    skipArea(request: ServiceArea.SkipAreaRequest): Promise<ServiceArea.SkipAreaResponse>;
}
//# sourceMappingURL=ServiceAreaBehavior.d.ts.map