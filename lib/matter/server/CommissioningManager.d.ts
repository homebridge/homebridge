/**
 * Commissioning Manager
 *
 * Handles passcode generation, discriminator generation, credential persistence,
 * QR code rendering, commissioning event listeners, and commissioning file updates.
 */
import type { ServerNode } from '@matter/main';
import type { EventEmitter } from 'node:events';
import type { MatterServerConfig } from '../sharedTypes.js';
import type { FabricManager } from './FabricManager.js';
export interface CommissioningInfo {
    qrCode?: string;
    manualPairingCode?: string;
    qrCodeUrl?: string;
}
export interface CommissioningDeps {
    config: MatterServerConfig;
    serverNode: ServerNode | null;
    matterStoragePath?: string;
    serialNumber?: string;
    emitter: EventEmitter;
    fabricManager: FabricManager;
}
export declare class CommissioningManager {
    passcode: number;
    discriminator: number;
    readonly vendorId: number;
    readonly productId: number;
    commissioningInfo: CommissioningInfo;
    constructor();
    /**
     * Generate a secure random passcode
     * According to Matter spec, passcode must be:
     * - 8 digits (00000001 to 99999998)
     * - Not in the invalid list
     * - Not sequential or repeating patterns
     */
    generateSecurePasscode(): number;
    /**
     * Validate a passcode according to Matter specifications
     */
    isValidPasscode(passcode: number): boolean;
    /**
     * Generate a random discriminator
     * According to Matter spec, discriminator must be:
     * - 12 bits (0-4095)
     * - Should be random for security
     */
    generateRandomDiscriminator(): number;
    /**
     * Load or generate commissioning credentials (passcode and discriminator)
     * Reads/writes a simple credentials.json file in the bridge storage directory.
     */
    loadOrGenerateCredentials(matterStoragePath: string): Promise<void>;
    /**
     * Generate and display commissioning information
     */
    generateCommissioningInfo(deps: CommissioningDeps): Promise<void>;
    /**
     * Set up Matter.js commissioning event listeners
     */
    setupCommissioningEventListeners(deps: CommissioningDeps): void;
    /**
     * Update commissioning info file when commissioning state changes
     */
    updateCommissioningFile(deps: CommissioningDeps): Promise<void>;
}
//# sourceMappingURL=CommissioningManager.d.ts.map