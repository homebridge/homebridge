/**
 * Matter API Implementation
 *
 * Implements the Matter API facade with lazy loading to optimize performance.
 *
 * Architecture:
 * - Separates Matter-specific logic from core HomebridgeAPI class
 * - Uses dynamic imports to prevent loading Matter.js at module parse time
 * - Loads Matter types on first access to `api.matter` properties
 * - Child bridges that don't use Matter have zero Matter.js overhead
 *
 * Performance Impact:
 * - Before: Every child bridge loaded ~800ms of Matter.js code (8-16s on RPi)
 * - After: Only child bridges using Matter load it on first access
 * - Improvement: 75-90% reduction in startup time for multi-bridge setups
 */
import type { HomebridgeAPI, MatterAPI, PlatformName, PluginIdentifier } from '../api.js';
import type { MatterAccessory } from './index.js';
/**
 * Implementation of the Matter API
 *
 * This facade provides Matter protocol support through the Homebridge API.
 * It uses lazy loading to prevent loading the heavy Matter.js library until
 * actually needed, improving startup performance for child bridges that don't
 * use Matter.
 *
 * Features:
 * - Lazy-loads Matter types on first access
 * - Validates accessories before registration
 * - Handles both bridge accessories and external standalone devices
 * - Provides detailed error messages for debugging
 * - Delegates to HomebridgeAPI for event emission and server access
 */
export declare class MatterAPIImpl implements MatterAPI {
    private readonly api;
    constructor(api: HomebridgeAPI);
    /**
     * Validate a Matter accessory has required fields
     * @throws MatterAccessoryValidationError if validation fails
     */
    private validateAccessory;
    /**
     * Validate an array of accessories, logging errors for invalid ones
     * @returns Array of valid accessories only
     */
    private validateAccessories;
    /**
     * Validate cluster name is valid
     *
     * @param clusterName - Cluster name to validate
     * @param context - Context string for error messages
     */
    private validateClusterName;
    /**
     * UUID generator (alias of api.hap.uuid for convenience)
     */
    get uuid(): any;
    /**
     * Matter device types for creating accessories
     */
    get deviceTypes(): {
        readonly OnOffLight: any;
        readonly DimmableLight: any;
        readonly ColorTemperatureLight: any;
        readonly ExtendedColorLight: any;
        readonly OnOffSwitch: any;
        readonly OnOffOutlet: any;
        readonly DimmableOutlet: any;
        readonly AirQualitySensor: any;
        readonly TemperatureSensor: any;
        readonly HumiditySensor: any;
        readonly LightSensor: any;
        readonly MotionSensor: any;
        readonly ContactSensor: any;
        readonly LeakSensor: any;
        readonly SmokeSensor: any;
        readonly Thermostat: any;
        readonly Fan: any;
        readonly DoorLock: any;
        readonly WindowCovering: any;
        readonly RoboticVacuumCleaner: any;
        readonly GenericSwitch: any;
        readonly Pump: any;
        readonly RoomAirConditioner: any;
    };
    /**
     * Matter clusters - Direct access to Matter.js cluster definitions
     */
    get clusters(): {
        AirQuality: any;
        BooleanState: any;
        CarbonMonoxideConcentrationMeasurement: any;
        ColorControl: any;
        DoorLock: any;
        FanControl: any;
        LevelControl: any;
        NitrogenDioxideConcentrationMeasurement: any;
        OnOff: any;
        OzoneConcentrationMeasurement: any;
        Pm10ConcentrationMeasurement: any;
        Pm25ConcentrationMeasurement: any;
        RvcOperationalState: any;
        Thermostat: any;
        WindowCovering: any;
    };
    /**
     * Matter cluster names for type safety and autocomplete
     */
    get clusterNames(): {
        readonly OnOff: "onOff";
        readonly LevelControl: "levelControl";
        readonly ColorControl: "colorControl";
        readonly DoorLock: "doorLock";
        readonly WindowCovering: "windowCovering";
        readonly Thermostat: "thermostat";
        readonly FanControl: "fanControl";
        readonly AirQuality: "airQuality";
        readonly CarbonMonoxideConcentrationMeasurement: "carbonMonoxideConcentrationMeasurement";
        readonly NitrogenDioxideConcentrationMeasurement: "nitrogenDioxideConcentrationMeasurement";
        readonly OzoneConcentrationMeasurement: "ozoneConcentrationMeasurement";
        readonly Pm10ConcentrationMeasurement: "pm10ConcentrationMeasurement";
        readonly Pm25ConcentrationMeasurement: "pm25ConcentrationMeasurement";
        readonly TemperatureMeasurement: "temperatureMeasurement";
        readonly RelativeHumidityMeasurement: "relativeHumidityMeasurement";
        readonly IlluminanceMeasurement: "illuminanceMeasurement";
        readonly OccupancySensing: "occupancySensing";
        readonly BooleanState: "booleanState";
        readonly SmokeCoAlarm: "smokeCoAlarm";
        readonly RvcRunMode: "rvcRunMode";
        readonly RvcOperationalState: "rvcOperationalState";
        readonly RvcCleanMode: "rvcCleanMode";
        readonly ServiceArea: "serviceArea";
        readonly PumpConfigurationAndControl: "pumpConfigurationAndControl";
        readonly Identify: "identify";
        readonly BasicInformation: "basicInformation";
        readonly BridgedDeviceBasicInformation: "bridgedDeviceBasicInformation";
    };
    /**
     * Matter types - Access to Matter.js cluster type definitions and enums
     */
    get types(): {
        AirQuality: any;
        BooleanState: any;
        CarbonMonoxideConcentrationMeasurement: any;
        ColorControl: any;
        DoorLock: any;
        FanControl: any;
        LevelControl: any;
        NitrogenDioxideConcentrationMeasurement: any;
        OnOff: any;
        OzoneConcentrationMeasurement: any;
        Pm10ConcentrationMeasurement: any;
        Pm25ConcentrationMeasurement: any;
        RvcOperationalState: any;
        Thermostat: any;
        WindowCovering: any;
    };
    /**
     * Register Matter platform accessories
     * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that need dedicated bridges
     * Validates accessories before registration
     * Returns a promise that resolves when all accessories are fully registered
     */
    registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]): Promise<void>;
    /**
     * Update Matter platform accessories in the cache
     * Similar to api.updatePlatformAccessories() for HAP accessories
     */
    updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void>;
    /**
     * Unregister Matter platform accessories
     * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that have dedicated bridges
     */
    unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]): Promise<void>;
    /**
     * Update a Matter accessory's cluster state
     * Validates inputs before updating
     */
    updateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>;
    /**
     * Get a Matter accessory's current cluster state
     * Checks both external servers and main bridge server
     * Validates inputs before retrieving state
     */
    getAccessoryState(uuid: string, cluster: string, partId?: string): Promise<Record<string, unknown> | undefined>;
}
//# sourceMappingURL=MatterAPIImpl.d.ts.map