/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */
import { FanControlServer } from '@matter/main/behaviors/fan-control';
/**
 * Custom FanControl Server that calls plugin handlers
 */
export declare class HomebridgeFanControlServer extends FanControlServer {
    #private;
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    initialize(): void;
}
//# sourceMappingURL=FanControlBehavior.d.ts.map