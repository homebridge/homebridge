"use strict";
/**
 * LevelControl Cluster Behavior
 *
 * Handles brightness/level control for dimmable lights
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeLevelControlServer = void 0;
const level_control_1 = require("@matter/main/behaviors/level-control");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
class HomebridgeLevelControlServer extends level_control_1.LevelControlServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Handle moveToLevel command
     */
    async moveToLevel(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'levelControl', 'moveToLevel', request);
            // Only reached if handler succeeded - update Matter state
            await super.moveToLevel(request);
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'levelControl', {
                currentLevel: request.level,
            });
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
            throw new types_1.StatusResponseError(`Failed to set level: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle move command
     */
    async move(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'levelControl', 'move', request);
            // Only reached if handler succeeded
            await super.move(request);
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
            throw new types_1.StatusResponseError(`Failed to move level: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle step command
     */
    async step(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'levelControl', 'step', request);
            // Only reached if handler succeeded
            await super.step(request);
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
            throw new types_1.StatusResponseError(`Failed to step level: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle stop command
     */
    async stop(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'levelControl', 'stop', request);
            // Only reached if handler succeeded
            await super.stop(request);
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
            throw new types_1.StatusResponseError(`Failed to stop level change: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle moveToLevelWithOnOff command
     */
    async moveToLevelWithOnOff(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'levelControl', 'moveToLevelWithOnOff', request);
            // Only reached if handler succeeded - update Matter state
            await super.moveToLevelWithOnOff(request);
            // Sync level state to cache
            registry.syncStateToCache(endpointId, 'levelControl', {
                currentLevel: request.level,
            });
            // Update OnOff cluster state through Matter.js to trigger subscription reports
            const targetOnOff = request.level > 0;
            // This is critical for the Home app to receive the state change
            // Using 'as any' because endpoint.set() type doesn't know about dynamically added clusters
            // The onOff cluster may be present on this endpoint at runtime but isn't in the compile-time type
            await this.endpoint.set({
                onOff: {
                    onOff: targetOnOff,
                },
            });
            registry.syncStateToCache(endpointId, 'onOff', {
                onOff: targetOnOff,
            });
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
            throw new types_1.StatusResponseError(`Failed to set level with on/off: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeLevelControlServer = HomebridgeLevelControlServer;
//# sourceMappingURL=LevelControlBehavior.js.map