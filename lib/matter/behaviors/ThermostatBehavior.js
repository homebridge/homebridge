"use strict";
/**
 * Thermostat Cluster Behavior
 *
 * Handles thermostat commands for heating and cooling systems
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeThermostatServer = void 0;
const thermostat_1 = require("@matter/main/behaviors/thermostat");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom Thermostat Server that calls plugin handlers
 */
class HomebridgeThermostatServer extends thermostat_1.ThermostatServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    initialize() {
        super.initialize();
        // React to systemMode attribute changes (off, heat, cool, auto, etc.)
        this.reactTo(this.events.systemMode$Changed, this.#handleSystemModeChange, { offline: true });
        // React to occupiedHeatingSetpoint attribute changes (target heating temperature)
        // Using 'as any' because these events are feature-dependent (Heating/Cooling features)
        // and may not be present in the base events type at compile time
        const events = this.events;
        if (events.occupiedHeatingSetpoint$Changing) {
            this.reactTo(events.occupiedHeatingSetpoint$Changing, this.#handleOccupiedHeatingSetpointChanging, { offline: true });
        }
        // React to occupiedCoolingSetpoint attribute changes (target cooling temperature)
        if (events.occupiedCoolingSetpoint$Changing) {
            this.reactTo(events.occupiedCoolingSetpoint$Changing, this.#handleOccupiedCoolingSetpointChanging, { offline: true });
        }
    }
    async #handleSystemModeChange(value, oldValue) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'thermostat', 'systemModeChange', { systemMode: value, oldSystemMode: oldValue });
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'thermostat', { systemMode: value });
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
            throw new types_1.StatusResponseError(`Failed to change system mode: ${message}`, types_1.Status.Failure);
        }
    }
    async #handleOccupiedHeatingSetpointChanging(value) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        // Using 'as any' because occupiedHeatingSetpoint is feature-dependent (Heating feature)
        const oldValue = this.state.occupiedHeatingSetpoint;
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'thermostat', 'occupiedHeatingSetpointChange', { occupiedHeatingSetpoint: value, oldOccupiedHeatingSetpoint: oldValue });
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'thermostat', { occupiedHeatingSetpoint: value });
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
            throw new types_1.StatusResponseError(`Failed to change heating setpoint: ${message}`, types_1.Status.Failure);
        }
    }
    async #handleOccupiedCoolingSetpointChanging(value) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        // Using 'as any' because occupiedCoolingSetpoint is feature-dependent (Cooling feature)
        const oldValue = this.state.occupiedCoolingSetpoint;
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'thermostat', 'occupiedCoolingSetpointChange', { occupiedCoolingSetpoint: value, oldOccupiedCoolingSetpoint: oldValue });
            // Sync state to cache
            registry.syncStateToCache(endpointId, 'thermostat', { occupiedCoolingSetpoint: value });
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
            throw new types_1.StatusResponseError(`Failed to change cooling setpoint: ${message}`, types_1.Status.Failure);
        }
    }
    async setpointRaiseLower(request) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'thermostat', 'setpointRaiseLower', request);
            // Only reached if handler succeeded - update Matter state
            await super.setpointRaiseLower(request);
            // Sync thermostat setpoints to cache
            // Using 'as any' because these properties are feature-dependent (Heating/Cooling features)
            // and may not be present in the base state type at compile time
            const currentState = this.state;
            const stateUpdate = {};
            if (currentState.occupiedCoolingSetpoint !== undefined) {
                stateUpdate.occupiedCoolingSetpoint = currentState.occupiedCoolingSetpoint;
            }
            if (currentState.occupiedHeatingSetpoint !== undefined) {
                stateUpdate.occupiedHeatingSetpoint = currentState.occupiedHeatingSetpoint;
            }
            registry.syncStateToCache(endpointId, 'thermostat', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to adjust setpoint: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeThermostatServer = HomebridgeThermostatServer;
//# sourceMappingURL=ThermostatBehavior.js.map