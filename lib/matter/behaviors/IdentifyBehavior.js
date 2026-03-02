"use strict";
/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeIdentifyServer = void 0;
const identify_1 = require("@matter/main/behaviors/identify");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom Identify Server that calls plugin handlers
 */
class HomebridgeIdentifyServer extends identify_1.IdentifyServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    async identify(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'identify', 'identify', request);
            // Only reached if handler succeeded - call base implementation
            return await super.identify(request);
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
            throw new types_1.StatusResponseError(`Failed to identify: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeIdentifyServer = HomebridgeIdentifyServer;
//# sourceMappingURL=IdentifyBehavior.js.map