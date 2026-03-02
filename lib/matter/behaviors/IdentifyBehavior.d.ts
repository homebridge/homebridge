/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */
import type { Identify } from '@matter/main/clusters';
import { IdentifyServer } from '@matter/main/behaviors/identify';
/**
 * Custom Identify Server that calls plugin handlers
 */
export declare class HomebridgeIdentifyServer extends IdentifyServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    identify(request: Identify.IdentifyRequest): Promise<void>;
}
//# sourceMappingURL=IdentifyBehavior.d.ts.map