"use strict";
/**
 * ServiceArea Cluster Behavior
 *
 * Handles service area selection for robotic vacuum cleaners
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeServiceAreaServer = void 0;
const service_area_1 = require("@matter/main/behaviors/service-area");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom ServiceArea Server that calls plugin handlers
 */
class HomebridgeServiceAreaServer extends service_area_1.ServiceAreaServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Sync current service area state to cache for UI updates
     * Helper method to avoid code duplication
     *
     * @param includeProgress - Whether to include progress information in the sync
     */
    syncServiceAreaStateToCache(includeProgress = false) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        const currentState = this.state;
        const stateUpdate = {};
        if (currentState.selectedAreas !== undefined) {
            stateUpdate.selectedAreas = currentState.selectedAreas;
        }
        if (currentState.currentArea !== undefined) {
            stateUpdate.currentArea = currentState.currentArea;
        }
        if (includeProgress && currentState.progress !== undefined) {
            stateUpdate.progress = currentState.progress;
        }
        if (Object.keys(stateUpdate).length > 0) {
            registry.syncStateToCache(endpointId, 'serviceArea', stateUpdate);
        }
    }
    /**
     * Handle select areas command
     * Allows user to select which areas the vacuum should clean
     *
     * @param request - Area selection request with area IDs to clean
     * @returns Response indicating success or failure
     */
    async selectAreas(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'serviceArea', 'selectAreas', request);
            // Only reached if handler succeeded - call base implementation
            const result = await super.selectAreas(request);
            // Sync state to cache
            this.syncServiceAreaStateToCache();
            return result;
        }
        catch (error) {
            // If user handler already threw a StatusResponseError, propagate it as-is
            // This sends a proper Matter protocol error response to the controller
            if (errors_js_1.MatterStatus.isMatterProtocolError(error)) {
                throw error;
            }
            // For other errors, wrap in appropriate StatusResponseError
            // This prevents the endpoint from crashing and keeps the device online
            const message = error instanceof Error ? error.message : String(error);
            throw new types_1.StatusResponseError(`Failed to select areas: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle skip area command
     * Allows user to skip cleaning a specific area
     *
     * @param request - Skip area request with area ID to skip
     * @returns Response indicating success or failure
     */
    async skipArea(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'serviceArea', 'skipArea', request);
            // Only reached if handler succeeded - call base implementation
            const result = await super.skipArea(request);
            // Sync state to cache (include progress for skip operations)
            this.syncServiceAreaStateToCache(true);
            return result;
        }
        catch (error) {
            // If user handler already threw a StatusResponseError, propagate it as-is
            // This sends a proper Matter protocol error response to the controller
            if (errors_js_1.MatterStatus.isMatterProtocolError(error)) {
                throw error;
            }
            // For other errors, wrap in appropriate StatusResponseError
            // This prevents the endpoint from crashing and keeps the device online
            const message = error instanceof Error ? error.message : String(error);
            throw new types_1.StatusResponseError(`Failed to skip area: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeServiceAreaServer = HomebridgeServiceAreaServer;
//# sourceMappingURL=ServiceAreaBehavior.js.map