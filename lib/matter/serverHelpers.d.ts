/**
 * Helper functions for MatterServer.registerAccessory()
 * Extracted from the monolithic 521-line function for better maintainability
 */
import type { EndpointType } from '@matter/main';
import type { Behavior } from '@matter/node';
import type { MatterAccessory } from './types.js';
/**
 * Type representing a behavior class (constructor)
 */
type BehaviorType = Behavior.Type;
/**
 * Cluster IDs from Matter specification
 * Using Matter.js Cluster references instead of magic numbers
 */
export declare const CLUSTER_IDS: {
    readonly AIR_QUALITY: any;
    readonly CARBON_MONOXIDE_CONCENTRATION: any;
    readonly COLOR_CONTROL: any;
    readonly DOOR_LOCK: any;
    readonly LEVEL_CONTROL: any;
    readonly NITROGEN_DIOXIDE_CONCENTRATION: any;
    readonly ON_OFF: any;
    readonly OZONE_CONCENTRATION: any;
    readonly PM10_CONCENTRATION: any;
    readonly PM25_CONCENTRATION: any;
    readonly THERMOSTAT: any;
    readonly WINDOW_COVERING: any;
};
/**
 * Validates required fields on a Matter accessory
 * @throws MatterDeviceError if validation fails
 */
export declare function validateAccessoryRequiredFields(accessory: MatterAccessory): void;
/**
 * Generic feature detection from device type behaviors
 * Extracts supported features from a device type's cluster definition
 *
 * @param deviceType - The Matter device type
 * @param clusterIdOrName - Cluster ID (number) or name (string)
 * @param featureExtractor - Function to extract feature names from supportedFeatures
 * @returns Array of detected features or null if cluster not found
 */
export declare function detectBehaviorFeatures(deviceType: EndpointType, clusterIdOrName: number | string, featureExtractor: (supportedFeatures: Record<string, boolean>) => string[]): string[] | null;
/**
 * Extract ColorControl features from supportedFeatures
 */
export declare function extractColorControlFeatures(supportedFeatures: Record<string, boolean>): string[];
/**
 * Extract Thermostat features from supportedFeatures
 */
export declare function extractThermostatFeatures(supportedFeatures: Record<string, boolean>): string[];
/**
 * Determine ColorControl features based on handlers
 * Only includes features that have corresponding handler methods
 */
export declare function determineColorControlFeaturesFromHandlers(handlers: Record<string, unknown>): string[];
/**
 * Detect WindowCovering features from accessory attributes
 * Auto-detects Lift and Tilt capabilities based on cluster attributes
 *
 * @param accessory - Matter accessory to inspect
 * @returns Array of detected feature names
 */
export declare function detectWindowCoveringFeatures(accessory: MatterAccessory): string[];
/**
 * Detect ServiceArea features from cluster attributes
 */
export declare function detectServiceAreaFeatures(serviceAreaCluster: Record<string, unknown> | undefined): string[];
/**
 * Apply WindowCovering features to device type
 */
export declare function applyWindowCoveringFeatures(deviceType: EndpointType, accessory: MatterAccessory, features: string[]): EndpointType;
/**
 * Build custom behaviors for RoboticVacuumCleaner devices
 */
export declare function buildRvcCustomBehaviors(accessory: MatterAccessory, serviceAreaFeatures: string[] | null): BehaviorType[];
/**
 * Apply detected features to a behavior class
 */
export declare function applyFeaturesToBehavior(behaviorClass: BehaviorType, features: string[] | null, clusterName: string): BehaviorType;
export {};
//# sourceMappingURL=serverHelpers.d.ts.map