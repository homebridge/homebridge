/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks
 */
import { DoorLockServer } from '@matter/main/behaviors/door-lock';
/**
 * Custom DoorLock Server that calls plugin handlers
 */
export declare class HomebridgeDoorLockServer extends DoorLockServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    lockDoor(): Promise<void>;
    unlockDoor(): Promise<void>;
}
//# sourceMappingURL=DoorLockBehavior.d.ts.map