"use strict";
/**
 * Fabric Manager
 *
 * Handles fabric info queries, commissioned status checks,
 * and fabric removal operations.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FabricManager = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const logger_js_1 = require("../../logger.js");
const types_js_1 = require("../types.js");
const log = logger_js_1.Logger.withPrefix('Matter/Server');
class FabricManager {
    getServerNode;
    getMatterStoragePath;
    constructor(getServerNode, getMatterStoragePath) {
        this.getServerNode = getServerNode;
        this.getMatterStoragePath = getMatterStoragePath;
    }
    /**
     * Get fabric information for commissioned controllers
     */
    getFabricInfo() {
        try {
            const serverNode = this.getServerNode();
            if (!serverNode) {
                return [];
            }
            // Use the server node's commissioning state to read fabric info
            const env = serverNode.env;
            if (!env) {
                return [];
            }
            // Try reading from the server node's state
            try {
                const serverState = serverNode;
                const fabrics = serverState?.state?.operationalCredentials?.fabrics;
                if (Array.isArray(fabrics) && fabrics.length > 0) {
                    return fabrics.map((fabric) => ({
                        fabricIndex: fabric.fabricIndex || 0,
                        fabricId: fabric.fabricId?.toString() || '',
                        nodeId: fabric.nodeId?.toString() || '',
                        rootVendorId: fabric.rootVendorId || 0,
                        label: fabric.label || '',
                    }));
                }
            }
            catch {
                // Fallback to checking storage
            }
            // Fallback: read from disk storage
            return this.readFabricsFromStorage();
        }
        catch (error) {
            log.debug('Failed to get fabric info:', error);
            return [];
        }
    }
    /**
     * Read fabric information from storage files
     */
    readFabricsFromStorage() {
        try {
            const storagePath = this.getMatterStoragePath();
            if (!storagePath) {
                return [];
            }
            // Try to read the storage file synchronously for backwards compatibility
            // Look for JSON files that might contain fabric data
            const files = node_fs_1.default.readdirSync(storagePath).filter((f) => f.endsWith('.json'));
            for (const file of files) {
                try {
                    const data = JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(storagePath, file), 'utf-8'));
                    // Check for fabrics data in various storage key formats
                    const fabricsData = data?.['fabrics.fabrics'] || data?.fabrics?.fabrics;
                    if (Array.isArray(fabricsData) && fabricsData.length > 0) {
                        return fabricsData.map((fabric) => ({
                            fabricIndex: fabric.fabricIndex || 0,
                            fabricId: fabric.fabricId?.value?.toString() || fabric.fabricId?.toString() || '',
                            nodeId: fabric.nodeId?.value?.toString() || fabric.nodeId?.toString() || '',
                            rootVendorId: fabric.rootVendorId || 0,
                            label: fabric.label || '',
                        }));
                    }
                }
                catch {
                    // Skip files that can't be parsed
                }
            }
            return [];
        }
        catch {
            return [];
        }
    }
    /**
     * Check if the server is commissioned
     */
    isCommissioned() {
        try {
            const serverNode = this.getServerNode();
            if (serverNode) {
                // Try to check commissioned state from the server node
                try {
                    const serverState = serverNode;
                    const commissioned = serverState?.state?.commissioning?.commissioned;
                    if (commissioned === true) {
                        return true;
                    }
                }
                catch {
                    // Fallback
                }
            }
            // Fallback to checking fabric count
            const fabrics = this.getFabricInfo();
            return fabrics.length > 0;
        }
        catch (error) {
            log.debug('Failed to check commissioned status:', error);
            return false;
        }
    }
    /**
     * Get the number of commissioned fabrics
     */
    getCommissionedFabricCount() {
        return this.getFabricInfo().length;
    }
    /**
     * Remove a specific fabric (controller) from the bridge
     */
    async removeFabric(fabricIndex) {
        const serverNode = this.getServerNode();
        if (!serverNode) {
            throw new types_js_1.MatterDeviceError('Matter server not started');
        }
        try {
            log.info(`Removing fabric ${fabricIndex}...`);
            const serverState = serverNode;
            const removeFabric = serverState?.state?.commissioning?.removeFabric;
            if (typeof removeFabric !== 'function') {
                throw new types_js_1.MatterDeviceError('Fabric removal not supported by Matter.js version');
            }
            await removeFabric(fabricIndex);
            log.info(`Fabric ${fabricIndex} removed successfully`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(`Failed to remove fabric ${fabricIndex}:`, error);
            throw new types_js_1.MatterDeviceError(`Failed to remove fabric: ${errorMessage}`, {
                originalError: error instanceof Error ? error : undefined,
            });
        }
    }
    /**
     * Check if a specific fabric exists
     */
    hasFabric(fabricIndex) {
        const fabrics = this.getFabricInfo();
        return fabrics.some(f => f.fabricIndex === fabricIndex);
    }
}
exports.FabricManager = FabricManager;
//# sourceMappingURL=FabricManager.js.map