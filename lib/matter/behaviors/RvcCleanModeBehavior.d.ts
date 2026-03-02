/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */
import { RvcCleanModeServer } from '@matter/main/behaviors/rvc-clean-mode';
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
 * Custom RvcCleanMode Server that calls plugin handlers
 */
export declare class HomebridgeRvcCleanModeServer extends RvcCleanModeServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Handle change to mode command
     * Changes the vacuum's cleaning mode (e.g., quick clean, deep clean, spot clean)
     *
     * @param request - Mode change request containing the new mode
     * @returns Response indicating success or failure
     */
    changeToMode(request: ChangeToModeRequest): Promise<ChangeToModeResponse>;
}
export {};
//# sourceMappingURL=RvcCleanModeBehavior.d.ts.map