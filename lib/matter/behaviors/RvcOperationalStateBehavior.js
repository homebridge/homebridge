"use strict";
/**
 * RvcOperationalState Cluster Behavior
 *
 * Handles robotic vacuum cleaner operational state commands
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeRvcOperationalStateServer = void 0;
const rvc_operational_state_1 = require("@matter/main/behaviors/rvc-operational-state");
const rvc_operational_state_2 = require("@matter/main/clusters/rvc-operational-state");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom RvcOperationalState Server that calls plugin handlers
 */
class HomebridgeRvcOperationalStateServer extends rvc_operational_state_1.RvcOperationalStateServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Sync current operational state to cache for UI updates
     * Helper method to avoid code duplication across command handlers
     */
    syncOperationalStateToCache() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        const currentState = this.state;
        if (currentState.operationalState !== undefined) {
            registry.syncStateToCache(endpointId, 'rvcOperationalState', {
                operationalState: currentState.operationalState,
            });
        }
    }
    /**
     * Handle pause command
     * Pauses the vacuum's current operation
     *
     * @returns Command response with error state
     */
    async pause() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'rvcOperationalState', 'pause');
            // Only reached if handler succeeded - return success response
            // Don't call super.pause() as the plugin handler already updated state via API
            // Sync state to cache (operational state should be updated by plugin via updateAccessoryState)
            this.syncOperationalStateToCache();
            return {
                commandResponseState: {
                    errorStateId: rvc_operational_state_2.RvcOperationalState.ErrorState.NoError,
                },
            };
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
            throw new types_1.StatusResponseError(`Failed to pause: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle resume command
     * Resumes the vacuum's paused operation
     *
     * @returns Command response with error state
     */
    async resume() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'rvcOperationalState', 'resume');
            // Only reached if handler succeeded - return success response
            // Don't call super.resume() as the plugin handler already updated state via API
            // Sync state to cache (operational state should be updated by plugin via updateAccessoryState)
            this.syncOperationalStateToCache();
            return {
                commandResponseState: {
                    errorStateId: rvc_operational_state_2.RvcOperationalState.ErrorState.NoError,
                },
            };
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
            throw new types_1.StatusResponseError(`Failed to resume: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle go home command
     * Sends the vacuum back to its charging dock
     *
     * @returns Command response with error state
     */
    async goHome() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'rvcOperationalState', 'goHome');
            // Only reached if handler succeeded - return success response
            // Sync state to cache (operational state should be updated by plugin via updateAccessoryState)
            this.syncOperationalStateToCache();
            return {
                commandResponseState: {
                    errorStateId: rvc_operational_state_2.RvcOperationalState.ErrorState.NoError,
                },
            };
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
            throw new types_1.StatusResponseError(`Failed to go home: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeRvcOperationalStateServer = HomebridgeRvcOperationalStateServer;
//# sourceMappingURL=RvcOperationalStateBehavior.js.map