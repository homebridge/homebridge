/**
 * RvcRunMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner run mode changes
 */
import { RvcRunModeServer } from '@matter/main/behaviors/rvc-run-mode';
/**
 * Request type for changeToMode command
 */
interface ChangeToModeRequest {
    newMode: number;
}
/**
 * Response type for changeToMode command
 */
interface ChangeToModeResponse {
    status: number;
    statusText: string;
}
/**
 * Custom RvcRunMode Server that calls plugin handlers
 */
export declare class HomebridgeRvcRunModeServer extends RvcRunModeServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Handle change to mode command
     * Changes the vacuum's run mode (e.g., cleaning, idle, mapping)
     *
     * @param request - Mode change request containing the new mode
     * @returns Response indicating success or failure
     */
    changeToMode(request: ChangeToModeRequest): Promise<ChangeToModeResponse>;
}
export {};
//# sourceMappingURL=RvcRunModeBehavior.d.ts.map