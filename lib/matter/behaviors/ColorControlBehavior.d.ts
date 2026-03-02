/**
 * ColorControl Cluster Behavior
 *
 * Handles color control commands for RGB lights and color temperature lights
 */
import type { ColorControl } from '@matter/main/clusters';
import { ColorControlServer } from '@matter/main/behaviors/color-control';
/**
 * Custom ColorControl Server that calls plugin handlers
 *
 * ColorControl handles color changes for lights (hue, saturation, XY color, color temperature).
 * Plugin developers can override these *Logic methods to handle color changes in their hardware.
 *
 * Features (Xy, ColorTemperature, HueSaturation) are added by the device type, not this behavior.
 * This ensures each device only gets the features it needs.
 */
export declare class HomebridgeColorControlServer extends ColorControlServer {
    /**
     * Get the registry for this behavior's endpoint
     */
    private getRegistry;
    /**
     * Called when color temperature is changed
     * @param colorTemperatureMireds - Target color temperature in mireds (micro reciprocal degrees)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    moveToColorTemperatureLogic(colorTemperatureMireds: number, transitionTime: number): Promise<void>;
    /**
     * Called when hue and saturation are changed together
     * @param hue - Target hue value (0-254 for normal hue, 0-65535 for enhanced hue)
     * @param saturation - Target saturation value (0-254)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    moveToHueAndSaturationLogic(hue: number, saturation: number, transitionTime: number): Promise<void>;
    /**
     * Called when XY color coordinates are changed
     * @param targetX - Target X value (0-65535 representing 0.0-1.0 in CIE color space)
     * @param targetY - Target Y value (0-65535 representing 0.0-1.0 in CIE color space)
     * @param transitionTime - Transition time in seconds (0 = as fast as possible)
     */
    moveToColorLogic(targetX: number, targetY: number, transitionTime: number): Promise<void>;
    /**
     * Called when hue is changed individually
     * @param targetHue - Target hue value
     * @param direction - Direction to move (shortest, longest, up, down)
     * @param transitionTime - Transition time in seconds
     * @param isEnhancedHue - Whether this is enhanced hue (16-bit) or normal hue (8-bit)
     */
    moveToHueLogic(targetHue: number, direction: ColorControl.Direction, transitionTime: number, isEnhancedHue?: boolean): Promise<void>;
    /**
     * Called when saturation is changed individually
     * @param targetSaturation - Target saturation value (0-254)
     * @param transitionTime - Transition time in seconds
     */
    moveToSaturationLogic(targetSaturation: number, transitionTime: number): Promise<void>;
    /**
     * Called when all color movement should be stopped
     */
    stopAllColorMovement(): Promise<void>;
}
//# sourceMappingURL=ColorControlBehavior.d.ts.map