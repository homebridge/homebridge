"use strict";
/**
 * ColorControl Cluster Behavior
 *
 * Handles color control commands for RGB lights and color temperature lights
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HomebridgeColorControlServer = void 0;
const color_control_1 = require("@matter/main/behaviors/color-control");
const types_1 = require("@matter/main/types");
const errors_js_1 = require("../errors.js");
const EndpointContext_js_1 = require("./EndpointContext.js");
/**
 * Custom ColorControl Server that calls plugin handlers
 *
 * ColorControl handles color changes for lights (hue, saturation, XY color, color temperature).
 * Plugin developers can override these *Logic methods to handle color changes in their hardware.
 *
 * Features (Xy, ColorTemperature, HueSaturation) are added by the device type, not this behavior.
 * This ensures each device only gets the features it needs.
 */
class HomebridgeColorControlServer extends color_control_1.ColorControlServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    getRegistry() {
        return (0, EndpointContext_js_1.getRegistryManager)(this.endpoint).getRegistry(this.endpoint.id);
    }
    /**
     * Called when color temperature is changed
     * @param colorTemperatureMireds - Target color temperature in mireds (micro reciprocal degrees)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    async moveToColorTemperatureLogic(colorTemperatureMireds, transitionTime) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'moveToColorTemperatureLogic', { colorTemperatureMireds, transitionTime });
            // Only reached if handler succeeded - update Matter state
            await super.moveToColorTemperatureLogic(colorTemperatureMireds, transitionTime);
            // Sync color temperature to cache
            // Note: We extract the specific numeric value from the complex Matter.js state type
            const currentState = this.state;
            if (currentState.colorTemperatureMireds !== undefined) {
                registry.syncStateToCache(endpointId, 'colorControl', {
                    colorTemperatureMireds: currentState.colorTemperatureMireds,
                });
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
            throw new types_1.StatusResponseError(`Failed to set color temperature: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Called when hue and saturation are changed together
     * @param hue - Target hue value (0-254 for normal hue, 0-65535 for enhanced hue)
     * @param saturation - Target saturation value (0-254)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    async moveToHueAndSaturationLogic(hue, saturation, transitionTime) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'moveToHueAndSaturationLogic', { hue, saturation, transitionTime });
            // Only reached if handler succeeded - update Matter state
            await super.moveToHueAndSaturationLogic(hue, saturation, transitionTime);
            // Sync hue and saturation to cache
            const currentState = this.state;
            const stateUpdate = {};
            if (currentState.currentHue !== undefined) {
                stateUpdate.currentHue = currentState.currentHue;
            }
            if (currentState.currentSaturation !== undefined) {
                stateUpdate.currentSaturation = currentState.currentSaturation;
            }
            registry.syncStateToCache(endpointId, 'colorControl', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to set hue and saturation: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Called when XY color coordinates are changed
     * @param targetX - Target X value (0-65535 representing 0.0-1.0 in CIE color space)
     * @param targetY - Target Y value (0-65535 representing 0.0-1.0 in CIE color space)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    async moveToColorLogic(targetX, targetY, transitionTime) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'moveToColorLogic', { targetX, targetY, transitionTime });
            // Only reached if handler succeeded - update Matter state
            await super.moveToColorLogic(targetX, targetY, transitionTime);
            // Sync XY color to cache
            const currentState = this.state;
            const stateUpdate = {};
            if (currentState.currentX !== undefined) {
                stateUpdate.currentX = currentState.currentX;
            }
            if (currentState.currentY !== undefined) {
                stateUpdate.currentY = currentState.currentY;
            }
            registry.syncStateToCache(endpointId, 'colorControl', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to set XY color: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Called when hue is changed individually
     * @param targetHue - Target hue value
     * @param direction - Direction to move (shortest, longest, up, down)
     * @param transitionTime - Transition time in seconds
     * @param isEnhancedHue - Whether this is enhanced hue (16-bit) or normal hue (8-bit)
     */
    async moveToHueLogic(targetHue, direction, transitionTime, isEnhancedHue = false) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'moveToHueLogic', { targetHue, direction, transitionTime, isEnhancedHue });
            // Only reached if handler succeeded - update Matter state
            await super.moveToHueLogic(targetHue, direction, transitionTime, isEnhancedHue);
            // Sync hue to cache
            const currentState = this.state;
            const stateUpdate = {};
            if (isEnhancedHue && currentState.enhancedCurrentHue !== undefined) {
                stateUpdate.enhancedCurrentHue = currentState.enhancedCurrentHue;
            }
            else if (currentState.currentHue !== undefined) {
                stateUpdate.currentHue = currentState.currentHue;
            }
            registry.syncStateToCache(endpointId, 'colorControl', stateUpdate);
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
            throw new types_1.StatusResponseError(`Failed to set hue: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Called when saturation is changed individually
     * @param targetSaturation - Target saturation value (0-254)
     * @param transitionTime - Transition time in seconds
     */
    async moveToSaturationLogic(targetSaturation, transitionTime) {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'moveToSaturationLogic', { targetSaturation, transitionTime });
            // Only reached if handler succeeded - update Matter state
            await super.moveToSaturationLogic(targetSaturation, transitionTime);
            // Sync saturation to cache
            const currentState = this.state;
            if (currentState.currentSaturation !== undefined) {
                registry.syncStateToCache(endpointId, 'colorControl', {
                    currentSaturation: currentState.currentSaturation,
                });
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
            throw new types_1.StatusResponseError(`Failed to set saturation: ${message}`, types_1.Status.Failure);
        }
    }
    /**
     * Called when all color movement should be stopped
     */
    async stopAllColorMovement() {
        const endpointId = this.endpoint.id;
        const registry = this.getRegistry();
        try {
            // Execute user handler
            await registry.executeHandler(endpointId, 'colorControl', 'stopAllColorMovement');
            // Only reached if handler succeeded - update Matter state
            await super.stopAllColorMovement();
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
            throw new types_1.StatusResponseError(`Failed to stop color movement: ${message}`, types_1.Status.Failure);
        }
    }
}
exports.HomebridgeColorControlServer = HomebridgeColorControlServer;
//# sourceMappingURL=ColorControlBehavior.js.map