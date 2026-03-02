"use strict";
/**
 * DoorLock Cluster Behavior
 *
 * Handles door lock commands for smart locks
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeDoorLockServer = void 0;
const door_lock_1 = require("@matter/main/behaviors/door-lock");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom DoorLock Server that calls plugin handlers
 */
class HomebridgeDoorLockServer extends door_lock_1.DoorLockServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    async lockDoor() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'doorLock', 'lockDoor');
            // Only reached if handler succeeded - update Matter state
            await super.lockDoor();
            // Sync lock state to cache
            const currentState = this.state;
            if (currentState.lockState !== undefined) {
                registry.syncStateToCache(endpointId, 'doorLock', { lockState: currentState.lockState });
            }
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
            throw new types_1.StatusResponseError(`Failed to lock door: ${message}`, types_1.Status.Failure);
        }
    }
    async unlockDoor() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'doorLock', 'unlockDoor');
            // Only reached if handler succeeded - update Matter state
            await super.unlockDoor();
            // Sync lock state to cache
            const currentState = this.state;
            if (currentState.lockState !== undefined) {
                registry.syncStateToCache(endpointId, 'doorLock', { lockState: currentState.lockState });
            }
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
            throw new types_1.StatusResponseError(`Failed to unlock door: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeDoorLockServer = HomebridgeDoorLockServer;
//# sourceMappingURL=DoorLockBehavior.js.map