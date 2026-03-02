/**
 * LevelControl Cluster Behavior
 *
 * Handles brightness/level control for dimmable lights
 */
import type { LevelControl } from '@matter/main/clusters/level-control';
import { LevelControlServer } from '@matter/main/behaviors/level-control';
export declare class HomebridgeLevelControlServer extends LevelControlServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Handle moveToLevel command
     */
    moveToLevel(request: LevelControl.MoveToLevelRequest): Promise<void>;
    /**
     * Handle move command
     */
    move(request: LevelControl.MoveRequest): Promise<void>;
    /**
     * Handle step command
     */
    step(request: LevelControl.StepRequest): Promise<void>;
    /**
     * Handle stop command
     */
    stop(request: LevelControl.StopRequest): Promise<void>;
    /**
     * Handle moveToLevelWithOnOff command
     */
    moveToLevelWithOnOff(request: LevelControl.MoveToLevelRequest): Promise<void>;
}
//# sourceMappingURL=LevelControlBehavior.d.ts.map