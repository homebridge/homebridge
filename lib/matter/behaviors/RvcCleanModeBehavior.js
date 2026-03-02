"use strict";
/**
 * RvcCleanMode Cluster Behavior
 *
 * Handles robotic vacuum cleaner cleaning mode changes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeRvcCleanModeServer = void 0;
const rvc_clean_mode_1 = require("@matter/main/behaviors/rvc-clean-mode");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom RvcCleanMode Server that calls plugin handlers
 */
class HomebridgeRvcCleanModeServer extends rvc_clean_mode_1.RvcCleanModeServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Handle change to mode command
     * Changes the vacuum's cleaning mode (e.g., quick clean, deep clean, spot clean)
     *
     * @param request - Mode change request containing the new mode
     * @returns Response indicating success or failure
     */
    async changeToMode(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'rvcCleanMode', 'changeToMode', request);
            // Only reached if handler succeeded - call base implementation
            const result = await super.changeToMode(request);
            // Sync state to cache (the current mode is in request.newMode)
            if (request?.newMode !== undefined) {
                registry.syncStateToCache(endpointId, 'rvcCleanMode', { currentMode: request.newMode });
            }
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
            throw new types_1.StatusResponseError(`Failed to change clean mode: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeRvcCleanModeServer = HomebridgeRvcCleanModeServer;
//# sourceMappingURL=RvcCleanModeBehavior.js.map