/**
 * Fabric Manager
 *
 * Handles fabric info queries, commissioned status checks,
 * and fabric removal operations.
 */
import type { ServerNode } from '@matter/main';
export interface FabricInfo {
    fabricIndex: number;
    fabricId: string;
    nodeId: string;
    rootVendorId: number;
    label?: string;
}
export declare class FabricManager {
    private readonly getServerNode;
    private readonly getMatterStoragePath;
    constructor(getServerNode: () => ServerNode | null, getMatterStoragePath: () => string | undefined);
    /**
     * Get fabric information for commissioned controllers
     */
    getFabricInfo(): FabricInfo[];
    /**
     * Read fabric information from storage files
     */
    private readFabricsFromStorage;
    /**
     * Check if the server is commissioned
     */
    isCommissioned(): boolean;
    /**
     * Get the number of commissioned fabrics
     */
    getCommissionedFabricCount(): number;
    /**
     * Remove a specific fabric (controller) from the bridge
     */
    removeFabric(fabricIndex: number): Promise<void>;
    /**
     * Check if a specific fabric exists
     */
    hasFabric(fabricIndex: number): boolean;
}
//# sourceMappingURL=FabricManager.d.ts.map