/**
 * State Manager
 *
 * Handles accessory state updates, state retrieval, command triggering,
 * and state change notifications.
 */
import type { EventEmitter } from 'node:events';
import type { InternalMatterAccessory } from '../types.js';
export declare class StateManager {
    private readonly accessories;
    private readonly emitter;
    private readonly getMonitoringEnabled;
    constructor(accessories: Map<string, InternalMatterAccessory>, emitter: EventEmitter, getMonitoringEnabled: () => boolean);
    /**
     * Update the state of a Matter accessory (Plugin API)
     */
    updateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>;
    /**
     * Get a Matter accessory's current state
     */
    getAccessoryState(uuid: string, cluster: string, partId?: string): Record<string, unknown> | undefined;
    /**
     * Trigger a command on a Matter accessory
     */
    triggerCommand(uuid: string, cluster: string, command: string, args?: Record<string, unknown>, partId?: string): Promise<void>;
    /**
     * Notify that an accessory's state has changed
     */
    notifyStateChange(uuid: string, cluster: string, state: Record<string, unknown>, partId?: string): void;
}
//# sourceMappingURL=StateManager.d.ts.map