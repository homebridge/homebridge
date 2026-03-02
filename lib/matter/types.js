"use strict";
/**
 * Matter Types for Homebridge Plugin API
 *
 * This module provides types and interfaces for plugin developers
 * to create Matter-compatible accessories.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.clusterNames = exports.deviceTypes = exports.devices = exports.clusters = exports.MatterNetworkError = exports.MatterDeviceError = exports.MatterStorageError = exports.MatterCommissioningError = exports.MatterError = exports.MatterErrorType = exports.MatterAccessoryEventTypes = void 0;
exports.hasEndpointState = hasEndpointState;
exports.updateEndpointState = updateEndpointState;
exports.getWindowCoveringCluster = getWindowCoveringCluster;
/**
 * Optimized Matter.js Device and Cluster Imports
 *
 * Imports Matter.js devices and clusters from individual files instead of barrel exports,
 * which dramatically reduces startup time.
 *
 * Why this matters:
 * - Barrel import: `import * as devices from '@matter/main/devices'` loads ALL 186+ exports (~800ms)
 * - Individual imports: Only loads the 23 devices we actually use (~50-100ms)
 * - Result: 50-100x faster on powerful machines, even more improvement on Raspberry Pi
 *
 * This optimization is especially important for users on resource-constrained devices like
 * Raspberry Pi where the difference can be several minutes of startup time.
 */
// Direct imports from individual cluster files
const air_quality_1 = require("@matter/main/clusters/air-quality");
const boolean_state_1 = require("@matter/main/clusters/boolean-state");
const carbon_monoxide_concentration_measurement_1 = require("@matter/main/clusters/carbon-monoxide-concentration-measurement");
const color_control_1 = require("@matter/main/clusters/color-control");
const door_lock_1 = require("@matter/main/clusters/door-lock");
const fan_control_1 = require("@matter/main/clusters/fan-control");
const level_control_1 = require("@matter/main/clusters/level-control");
const nitrogen_dioxide_concentration_measurement_1 = require("@matter/main/clusters/nitrogen-dioxide-concentration-measurement");
const on_off_1 = require("@matter/main/clusters/on-off");
const ozone_concentration_measurement_1 = require("@matter/main/clusters/ozone-concentration-measurement");
const pm10_concentration_measurement_1 = require("@matter/main/clusters/pm10-concentration-measurement");
const pm25_concentration_measurement_1 = require("@matter/main/clusters/pm25-concentration-measurement");
const rvc_operational_state_1 = require("@matter/main/clusters/rvc-operational-state");
const thermostat_1 = require("@matter/main/clusters/thermostat");
const window_covering_1 = require("@matter/main/clusters/window-covering");
// Direct imports from individual device files
const air_quality_sensor_1 = require("@matter/main/devices/air-quality-sensor");
const color_temperature_light_1 = require("@matter/main/devices/color-temperature-light");
const contact_sensor_1 = require("@matter/main/devices/contact-sensor");
const dimmable_light_1 = require("@matter/main/devices/dimmable-light");
const dimmable_plug_in_unit_1 = require("@matter/main/devices/dimmable-plug-in-unit");
const door_lock_2 = require("@matter/main/devices/door-lock");
const extended_color_light_1 = require("@matter/main/devices/extended-color-light");
const fan_1 = require("@matter/main/devices/fan");
const generic_switch_1 = require("@matter/main/devices/generic-switch");
const humidity_sensor_1 = require("@matter/main/devices/humidity-sensor");
const light_sensor_1 = require("@matter/main/devices/light-sensor");
const occupancy_sensor_1 = require("@matter/main/devices/occupancy-sensor");
const on_off_light_1 = require("@matter/main/devices/on-off-light");
const on_off_light_switch_1 = require("@matter/main/devices/on-off-light-switch");
const on_off_plug_in_unit_1 = require("@matter/main/devices/on-off-plug-in-unit");
const pump_1 = require("@matter/main/devices/pump");
const robotic_vacuum_cleaner_1 = require("@matter/main/devices/robotic-vacuum-cleaner");
const room_air_conditioner_1 = require("@matter/main/devices/room-air-conditioner");
const smoke_co_alarm_1 = require("@matter/main/devices/smoke-co-alarm");
const temperature_sensor_1 = require("@matter/main/devices/temperature-sensor");
const thermostat_2 = require("@matter/main/devices/thermostat");
const water_leak_detector_1 = require("@matter/main/devices/water-leak-detector");
const window_covering_2 = require("@matter/main/devices/window-covering");
/**
 * Matter Accessory Event Types
 *
 * Events that can be emitted by Matter accessories during their lifecycle.
 *
 * @example
 * ```typescript
 * Listen for when a Matter accessory is ready
 * const accessory: MatterAccessory = { ... };
 * api.matter.publishExternalAccessories('plugin-name', [accessory]);
 *
 * const internal = accessory as any;
 * internal._eventEmitter?.on(MatterAccessoryEventTypes.READY, (port: number) => {
 *   console.log(`Accessory ready on port ${port}`);
 * });
 * ```
 *
 * @group Matter Accessory
 */
var MatterAccessoryEventTypes;
(function (MatterAccessoryEventTypes) {
    /**
     * Emitted when the Matter server is ready and the accessory is available on the network.
     * This is the main event to listen for to know when an external accessory is ready.
     *
     * **HAP Equivalent:** `AccessoryEventTypes.ADVERTISED`
     *
     * @param port - The port number the Matter server is listening on
     */
    MatterAccessoryEventTypes["READY"] = "ready";
})(MatterAccessoryEventTypes || (exports.MatterAccessoryEventTypes = MatterAccessoryEventTypes = {}));
/**
 * Matter error type enum (for error handler categorization)
 */
var MatterErrorType;
(function (MatterErrorType) {
    MatterErrorType["INITIALIZATION"] = "INITIALIZATION";
    MatterErrorType["NETWORK"] = "NETWORK";
    MatterErrorType["COMMISSIONING"] = "COMMISSIONING";
    MatterErrorType["DEVICE_SYNC"] = "DEVICE_SYNC";
    MatterErrorType["SERVER"] = "SERVER";
    MatterErrorType["STORAGE"] = "STORAGE";
    MatterErrorType["CONFIGURATION"] = "CONFIGURATION";
    MatterErrorType["DEVICE_ERROR"] = "DEVICE_ERROR";
    MatterErrorType["UNKNOWN"] = "UNKNOWN";
})(MatterErrorType || (exports.MatterErrorType = MatterErrorType = {}));
/**
 * Matter error types
 */
class MatterError extends Error {
    code;
    details;
    type;
    timestamp;
    recoverable;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'MatterError';
        this.type = details?.type ?? MatterErrorType.UNKNOWN;
        this.timestamp = new Date();
        this.recoverable = details?.recoverable ?? true;
    }
}
exports.MatterError = MatterError;
class MatterCommissioningError extends MatterError {
    constructor(message, details) {
        super(message, 'COMMISSIONING_ERROR', { ...details, type: MatterErrorType.COMMISSIONING });
        this.name = 'MatterCommissioningError';
    }
}
exports.MatterCommissioningError = MatterCommissioningError;
class MatterStorageError extends MatterError {
    constructor(message, details) {
        super(message, 'STORAGE_ERROR', { ...details, type: MatterErrorType.STORAGE });
        this.name = 'MatterStorageError';
    }
}
exports.MatterStorageError = MatterStorageError;
class MatterDeviceError extends MatterError {
    constructor(message, details) {
        super(message, 'DEVICE_ERROR', { ...details, type: MatterErrorType.DEVICE_ERROR });
        this.name = 'MatterDeviceError';
    }
}
exports.MatterDeviceError = MatterDeviceError;
class MatterNetworkError extends MatterError {
    constructor(message, details) {
        super(message, 'NETWORK_ERROR', { ...details, type: MatterErrorType.NETWORK });
        this.name = 'MatterNetworkError';
    }
}
exports.MatterNetworkError = MatterNetworkError;
/**
 * Matter device types
 *
 * All supported Matter device types, imported from individual files for optimal performance.
 */
const devices = {
    AirQualitySensorDevice: air_quality_sensor_1.AirQualitySensorDevice,
    ColorTemperatureLightDevice: color_temperature_light_1.ColorTemperatureLightDevice,
    ContactSensorDevice: contact_sensor_1.ContactSensorDevice,
    DimmableLightDevice: dimmable_light_1.DimmableLightDevice,
    DimmablePlugInUnitDevice: dimmable_plug_in_unit_1.DimmablePlugInUnitDevice,
    DoorLockDevice: door_lock_2.DoorLockDevice,
    ExtendedColorLightDevice: extended_color_light_1.ExtendedColorLightDevice,
    FanDevice: fan_1.FanDevice,
    GenericSwitchDevice: generic_switch_1.GenericSwitchDevice,
    HumiditySensorDevice: humidity_sensor_1.HumiditySensorDevice,
    LightSensorDevice: light_sensor_1.LightSensorDevice,
    OccupancySensorDevice: occupancy_sensor_1.OccupancySensorDevice,
    OnOffLightDevice: on_off_light_1.OnOffLightDevice,
    OnOffLightSwitchDevice: on_off_light_switch_1.OnOffLightSwitchDevice,
    OnOffPlugInUnitDevice: on_off_plug_in_unit_1.OnOffPlugInUnitDevice,
    PumpDevice: pump_1.PumpDevice,
    RoboticVacuumCleanerDevice: robotic_vacuum_cleaner_1.RoboticVacuumCleanerDevice,
    RoboticVacuumCleanerRequirements: robotic_vacuum_cleaner_1.RoboticVacuumCleanerRequirements,
    RoomAirConditionerDevice: room_air_conditioner_1.RoomAirConditionerDevice,
    SmokeCoAlarmDevice: smoke_co_alarm_1.SmokeCoAlarmDevice,
    TemperatureSensorDevice: temperature_sensor_1.TemperatureSensorDevice,
    ThermostatDevice: thermostat_2.ThermostatDevice,
    ThermostatRequirements: thermostat_2.ThermostatRequirements,
    WaterLeakDetectorDevice: water_leak_detector_1.WaterLeakDetectorDevice,
    WindowCoveringDevice: window_covering_2.WindowCoveringDevice,
};
exports.devices = devices;
/**
 * Matter cluster types
 *
 * All supported Matter cluster types, imported from individual files for optimal performance.
 */
const clusters = {
    AirQuality: air_quality_1.AirQuality,
    BooleanState: boolean_state_1.BooleanState,
    CarbonMonoxideConcentrationMeasurement: carbon_monoxide_concentration_measurement_1.CarbonMonoxideConcentrationMeasurement,
    ColorControl: color_control_1.ColorControl,
    DoorLock: door_lock_1.DoorLock,
    FanControl: fan_control_1.FanControl,
    LevelControl: level_control_1.LevelControl,
    NitrogenDioxideConcentrationMeasurement: nitrogen_dioxide_concentration_measurement_1.NitrogenDioxideConcentrationMeasurement,
    OnOff: on_off_1.OnOff,
    OzoneConcentrationMeasurement: ozone_concentration_measurement_1.OzoneConcentrationMeasurement,
    Pm10ConcentrationMeasurement: pm10_concentration_measurement_1.Pm10ConcentrationMeasurement,
    Pm25ConcentrationMeasurement: pm25_concentration_measurement_1.Pm25ConcentrationMeasurement,
    RvcOperationalState: rvc_operational_state_1.RvcOperationalState,
    Thermostat: thermostat_1.Thermostat,
    WindowCovering: window_covering_1.WindowCovering,
};
exports.clusters = clusters;
/**
 * Friendly device type names for the Plugin API
 * Maps simplified names to actual Matter.js device types
 */
exports.deviceTypes = {
    // Lighting
    OnOffLight: devices.OnOffLightDevice,
    DimmableLight: devices.DimmableLightDevice,
    ColorTemperatureLight: devices.ColorTemperatureLightDevice,
    ExtendedColorLight: devices.ExtendedColorLightDevice,
    // Switches & Outlets
    OnOffSwitch: devices.OnOffLightSwitchDevice,
    OnOffOutlet: devices.OnOffPlugInUnitDevice,
    DimmableOutlet: devices.DimmablePlugInUnitDevice,
    // Sensors
    AirQualitySensor: devices.AirQualitySensorDevice,
    TemperatureSensor: devices.TemperatureSensorDevice,
    HumiditySensor: devices.HumiditySensorDevice,
    LightSensor: devices.LightSensorDevice,
    MotionSensor: devices.OccupancySensorDevice,
    ContactSensor: devices.ContactSensorDevice,
    LeakSensor: devices.WaterLeakDetectorDevice,
    SmokeSensor: devices.SmokeCoAlarmDevice,
    // HVAC
    Thermostat: devices.ThermostatDevice.with(devices.ThermostatRequirements.ThermostatServer.with('Heating', 'Cooling', 'AutoMode', 'Occupancy')),
    Fan: devices.FanDevice,
    // Security
    DoorLock: devices.DoorLockDevice,
    // Window Coverings (features will be auto-detected based on accessory attributes)
    WindowCovering: devices.WindowCoveringDevice,
    // Appliances
    // RVC optional clusters (RvcCleanMode, ServiceArea) are added dynamically in matterServer
    // based on whether they're defined in the accessory configuration
    RoboticVacuumCleaner: devices.RoboticVacuumCleanerDevice,
    // Other
    GenericSwitch: devices.GenericSwitchDevice,
    Pump: devices.PumpDevice,
    RoomAirConditioner: devices.RoomAirConditionerDevice,
};
/**
 * Matter Cluster Names
 * Commonly used cluster names for type safety and autocomplete
 * Use these with api.updateMatterAccessoryState() and api.getAccessoryState()
 *
 * @example
 * ```typescript
 * With autocomplete and type safety:
 * api.updateMatterAccessoryState(uuid, api.matterClusterNames.OnOff, { onOff: true })
 * api.getAccessoryState(uuid, api.matterClusterNames.LevelControl)
 * ```
 */
exports.clusterNames = {
    // Control Clusters
    OnOff: 'onOff',
    LevelControl: 'levelControl',
    ColorControl: 'colorControl',
    DoorLock: 'doorLock',
    WindowCovering: 'windowCovering',
    Thermostat: 'thermostat',
    FanControl: 'fanControl',
    // Sensor Clusters
    AirQuality: 'airQuality',
    CarbonMonoxideConcentrationMeasurement: 'carbonMonoxideConcentrationMeasurement',
    NitrogenDioxideConcentrationMeasurement: 'nitrogenDioxideConcentrationMeasurement',
    OzoneConcentrationMeasurement: 'ozoneConcentrationMeasurement',
    Pm10ConcentrationMeasurement: 'pm10ConcentrationMeasurement',
    Pm25ConcentrationMeasurement: 'pm25ConcentrationMeasurement',
    TemperatureMeasurement: 'temperatureMeasurement',
    RelativeHumidityMeasurement: 'relativeHumidityMeasurement',
    IlluminanceMeasurement: 'illuminanceMeasurement',
    OccupancySensing: 'occupancySensing',
    BooleanState: 'booleanState',
    SmokeCoAlarm: 'smokeCoAlarm',
    // Robotic Vacuum Cleaner Clusters
    RvcRunMode: 'rvcRunMode',
    RvcOperationalState: 'rvcOperationalState',
    RvcCleanMode: 'rvcCleanMode',
    ServiceArea: 'serviceArea',
    // Pump & Other
    PumpConfigurationAndControl: 'pumpConfigurationAndControl',
    // Identification
    Identify: 'identify',
    // Device Information (read-only, set during registration)
    BasicInformation: 'basicInformation',
    BridgedDeviceBasicInformation: 'bridgedDeviceBasicInformation',
};
/**
 * Check if endpoint has state property (type guard)
 *
 * We use a runtime check to determine if an endpoint has a settable state.
 * This is necessary because Endpoint's state structure is complex and varies
 * based on device type.
 *
 * @param endpoint - The endpoint to check
 * @returns True if endpoint has state and set method
 */
function hasEndpointState(endpoint) {
    return 'state' in endpoint
        && typeof endpoint.state === 'object'
        && endpoint.state !== null
        && 'set' in endpoint
        && typeof endpoint.set === 'function';
}
/**
 * Safely update endpoint state
 * Uses the Endpoint's set method to update cluster attributes
 *
 * @param endpoint - The Matter endpoint
 * @param cluster - Cluster name
 * @param attributes - Attributes to update
 * @throws {Error} If endpoint does not support state updates
 */
async function updateEndpointState(endpoint, cluster, attributes) {
    if (!hasEndpointState(endpoint)) {
        throw new Error('Endpoint does not support state updates');
    }
    const updateObject = { [cluster]: attributes };
    await endpoint.set(updateObject);
}
/**
 * Type-safe cluster access for WindowCovering
 */
function getWindowCoveringCluster(accessory) {
    return accessory.clusters?.windowCovering;
}
//# sourceMappingURL=types.js.map