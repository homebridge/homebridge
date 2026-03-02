"use strict";
/**
 * WindowCovering Cluster Behavior
 *
 * Handles window covering commands for blinds, shades, and curtains
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeWindowCoveringServer = void 0;
const window_covering_1 = require("@matter/main/behaviors/window-covering");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * WindowCovering state property names
 * These correspond to the Matter.js WindowCovering cluster attribute names
 */
const WindowCoveringStateProps = {
    targetPositionLiftPercent100ths: 'targetPositionLiftPercent100ths',
    currentPositionLiftPercent100ths: 'currentPositionLiftPercent100ths',
    targetPositionTiltPercent100ths: 'targetPositionTiltPercent100ths',
    currentPositionTiltPercent100ths: 'currentPositionTiltPercent100ths',
};
/**
 * Custom WindowCovering Server that calls plugin handlers
 */
class HomebridgeWindowCoveringServer extends window_covering_1.WindowCoveringBaseServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Sync window covering position state to cache
     * @param endpointId - The endpoint ID
     * @param targetProperty - Target position property name (e.g., 'targetPositionLiftPercent100ths')
     * @param currentProperty - Current position property name (e.g., 'currentPositionLiftPercent100ths')
     */
    syncPositionStateToCache(endpointId, targetProperty, currentProperty) {
        const registry = this.getRegistry();
        const currentState = this.state;
        const stateUpdate = {};
        if (currentState[targetProperty] !== undefined) {
            stateUpdate[targetProperty] = currentState[targetProperty];
        }
        if (currentState[currentProperty] !== undefined) {
            stateUpdate[currentProperty] = currentState[currentProperty];
        }
        registry.syncStateToCache(endpointId, 'windowCovering', stateUpdate);
    }
    async upOrOpen() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'windowCovering', 'upOrOpen');
            // Only reached if handler succeeded - update Matter state
            await super.upOrOpen();
            // Sync state to cache - window covering opening
            this.syncPositionStateToCache(endpointId, WindowCoveringStateProps.targetPositionLiftPercent100ths, WindowCoveringStateProps.currentPositionLiftPercent100ths);
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
            throw new types_1.StatusResponseError(`Failed to open window covering: ${message}`, types_1.Status.Failure);
        }
    }
    async downOrClose() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'windowCovering', 'downOrClose');
            // Only reached if handler succeeded - update Matter state
            await super.downOrClose();
            // Sync state to cache - window covering closing
            this.syncPositionStateToCache(endpointId, WindowCoveringStateProps.targetPositionLiftPercent100ths, WindowCoveringStateProps.currentPositionLiftPercent100ths);
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
            throw new types_1.StatusResponseError(`Failed to close window covering: ${message}`, types_1.Status.Failure);
        }
    }
    async stopMotion() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'windowCovering', 'stopMotion');
            // Only reached if handler succeeded - update Matter state
            await super.stopMotion();
            // Sync state to cache - window covering stopped
            this.syncPositionStateToCache(endpointId, WindowCoveringStateProps.targetPositionLiftPercent100ths, WindowCoveringStateProps.currentPositionLiftPercent100ths);
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
            throw new types_1.StatusResponseError(`Failed to stop window covering: ${message}`, types_1.Status.Failure);
        }
    }
    async goToLiftPercentage(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'windowCovering', 'goToLiftPercentage', request);
            // Only reached if handler succeeded - update Matter state
            await super.goToLiftPercentage(request);
            // Sync state to cache - window covering moving to target position
            this.syncPositionStateToCache(endpointId, WindowCoveringStateProps.targetPositionLiftPercent100ths, WindowCoveringStateProps.currentPositionLiftPercent100ths);
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
            throw new types_1.StatusResponseError(`Failed to set window covering position: ${message}`, types_1.Status.Failure);
        }
    }
    async goToTiltPercentage(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'windowCovering', 'goToTiltPercentage', request);
            // Only reached if handler succeeded - update Matter state
            await super.goToTiltPercentage(request);
            // Sync state to cache - window covering tilting to target angle
            this.syncPositionStateToCache(endpointId, WindowCoveringStateProps.targetPositionTiltPercent100ths, WindowCoveringStateProps.currentPositionTiltPercent100ths);
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
            throw new types_1.StatusResponseError(`Failed to set window covering tilt: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeWindowCoveringServer = HomebridgeWindowCoveringServer;
//# sourceMappingURL=WindowCoveringBehavior.js.map