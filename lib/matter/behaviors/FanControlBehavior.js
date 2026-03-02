"use strict";
/**
 * FanControl Cluster Behavior
 *
 * Handles fan control commands for fans
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeFanControlServer = void 0;
const fan_control_1 = require("@matter/main/behaviors/fan-control");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom FanControl Server that calls plugin handlers
 */
class HomebridgeFanControlServer extends fan_control_1.FanControlServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    initialize() {
        super.initialize();
        // React to fanMode attribute changes (on/off)
        this.reactTo(this.events.fanMode$Changed, this.#handleFanModeChange, { offline: true });
        // React to percentSetting attribute changes (speed)
        this.reactTo(this.events.percentSetting$Changed, this.#handlePercentSettingChange, { offline: true });
    }
    async #handleFanModeChange(value, oldValue) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'fanControl', 'fanModeChange', { fanMode: value, oldFanMode: oldValue });
            // Sync state to cache
            // When turning off (fanMode = 0), also set percentSetting and percentCurrent to 0
            // This ensures the UI correctly reflects the off state
            const stateUpdate = { fanMode: value };
            if (value === 0) {
                stateUpdate.percentSetting = 0;
                stateUpdate.percentCurrent = 0;
            }
            registry.syncStateToCache(endpointId, 'fanControl', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to change fan mode: ${message}`, types_1.Status.Failure);
        }
    }
    async #handlePercentSettingChange(value, oldValue) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'fanControl', 'percentSettingChange', { percentSetting: value, oldPercentSetting: oldValue });
            // Sync state to cache
            // When setting to 0%, also set fanMode to 0 (Off) for UI consistency
            const stateUpdate = {
                percentSetting: value ?? undefined,
                percentCurrent: value ?? undefined,
            };
            if (value === 0) {
                stateUpdate.fanMode = 0;
            }
            registry.syncStateToCache(endpointId, 'fanControl', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to change fan speed: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeFanControlServer = HomebridgeFanControlServer;
//# sourceMappingURL=FanControlBehavior.js.map