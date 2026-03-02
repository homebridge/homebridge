/**
 * Matter IPC Types
 *
 * Type definitions for Matter protocol IPC communication between
 * main Homebridge process and child bridges.
 */
/**
 * Matter event types
 */
export type MatterEventType = 'monitoringStarted' | 'monitoringStopped' | 'accessoriesData' | 'accessoryInfoData' | 'accessoryControlResponse' | 'accessoryUpdate' | 'accessoryAdded' | 'accessoryRemoved' | 'externalBridgeRegistration';
/**
 * Matter event payload structure
 */
export interface MatterEvent<T = unknown> {
    type: MatterEventType;
    correlationId?: string;
    data?: T;
}
/**
 * Matter server status information for IPC communication
 */
export interface MatterStatusInfo {
    enabled: boolean;
    port?: number;
    setupUri?: string;
    pin?: string;
    serialNumber?: string;
    commissioned?: boolean;
    deviceCount?: number;
}
/**
 * Server status update message sent from Homebridge to parent process
 */
export interface ServerStatusUpdate {
    status: string;
    paired: boolean | null;
    setupUri: string | null;
    name: string;
    username: string;
    pin: string;
    matter: MatterStatusInfo;
}
//# sourceMappingURL=ipc-types.d.ts.map