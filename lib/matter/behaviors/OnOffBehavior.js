"use strict";
/**
 * OnOff Cluster Behavior
 *
 * Handles on/off commands for lights, switches, and outlets
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeOnOffServer = void 0;
const on_off_1 = require("@matter/main/behaviors/on-off");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
class HomebridgeOnOffServer extends on_off_1.OnOffServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Handle 'on' command
     */
    async on() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'onOff', 'on');
            // Only reached if handler succeeded - update Matter state
            await super.on();
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'onOff', { onOff: true });
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
            throw new types_1.StatusResponseError(`Failed to turn on: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle 'off' command
     */
    async off() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'onOff', 'off');
            // Only reached if handler succeeded - update Matter state
            await super.off();
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'onOff', { onOff: false });
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
            throw new types_1.StatusResponseError(`Failed to turn off: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Handle 'toggle' command
     */
    async toggle() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'onOff', 'toggle');
            // Only reached if handler succeeded - update Matter state
            await super.toggle();
            // Sync state to cache (toggle changes the value)
            const currentState = this.state;
            const newState = !currentState.onOff;
            registry.syncStateToCache(endpointId, 'onOff', { onOff: newState });
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
            throw new types_1.StatusResponseError(`Failed to toggle: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeOnOffServer = HomebridgeOnOffServer;
//# sourceMappingURL=OnOffBehavior.js.map