/**
 * Matter Types for Homebridge Plugin API
 *
 * This module provides types and interfaces for plugin developers
 * to create Matter-compatible accessories.
 */
import type { Endpoint, EndpointType } from '@matter/main';
import type { Behavior } from '@matter/node';
import type { UnknownContext } from '../platformAccessory.js';
import type { ClusterHandlerMap } from './clusterHandlerMap.js';
import type { ClusterStateMap } from './clusterStateMap.js';
import { EventEmitter } from 'node:events';
type BehaviorType = Behavior.Type;
export type { EndpointType };
/**
 * Handler context information
 * Provides information about which part of a composed device triggered the handler
 */
export interface MatterHandlerContext {
    /** Parent accessory UUID */
    uuid: string;
    /** Part ID if this handler was triggered from a part, undefined for main accessory */
    partId?: string;
}
/**
 * Matter command handler function type
 *
 * Handlers can be synchronous or asynchronous (returning a Promise).
 * The args parameter contains the command arguments passed by Matter.js (optional).
 * The context parameter provides information about which part triggered the handler (for composed devices).
 */
export type MatterCommandHandler<TArgs = unknown> = (args: TArgs, context?: MatterHandlerContext) => Promise<void> | void;
/**
 * Matter cluster handlers interface
 *
 * Maps command names to their handler functions.
 * Each command can have custom argument types.
 *
 * Note: Uses `any` instead of `unknown` to allow handlers to specify
 * their own argument types without TypeScript variance errors.
 * Handlers can still be strongly typed in their implementations.
 */
export interface MatterClusterHandlers {
    [commandName: string]: MatterCommandHandler<any>;
}
/**
 * Matter Accessory Part - Sub-device in a composed accessory
 *
 * Represents a child endpoint in a composed device (e.g., individual outlets in a power strip).
 * Parts are added as child endpoints to the main accessory.
 */
export interface MatterAccessoryPart {
    /** Unique identifier for this part within the accessory (e.g., 'outlet-1', 'light', 'shade') */
    id: string;
    /** Display name for this part (optional, defaults to parent's name + part id) */
    displayName?: string;
    /** Matter device type for this part */
    deviceType: EndpointType;
    /**
     * Initial cluster states for this part
     * Same format as `MatterAccessory.clusters`
     *
     * Known clusters get full autocomplete; unknown clusters use the fallback type.
     */
    clusters: {
        [K in keyof ClusterStateMap]?: Partial<ClusterStateMap[K]>;
    } & {
        [clusterName: string]: Record<string, unknown>;
    };
    /**
     * Handlers for this part's commands
     * Handlers receive context.partId to identify which part was triggered
     *
     * Known clusters get full autocomplete; unknown clusters use the fallback type.
     */
    handlers?: {
        [K in keyof ClusterHandlerMap]?: Partial<ClusterHandlerMap[K]>;
    } & {
        [clusterName: string]: MatterClusterHandlers;
    };
}
/**
 * Matter Accessory - Plugin API Interface
 *
 * This is the main interface that plugin developers use to register
 * Matter accessories with Homebridge.
 *
 * For composed devices (devices with multiple subcomponents), use the `parts` array
 * to define child endpoints. Each part appears as a separate device in the Home app.
 */
export interface MatterAccessory<T extends UnknownContext = UnknownContext> {
    /** Unique identifier for this accessory (must be unique across all accessories) */
    UUID: string;
    /** Display name for the accessory */
    displayName: string;
    /** Matter device type (e.g., OnOffLightDevice, DimmableLightDevice, etc.) */
    deviceType: EndpointType;
    /** Serial number for the device */
    serialNumber: string;
    /** Manufacturer name */
    manufacturer: string;
    /** Model name/identifier */
    model: string;
    /** Firmware revision (optional) */
    firmwareRevision?: string;
    /** Hardware revision (optional) */
    hardwareRevision?: string;
    /** Software version (optional) */
    softwareVersion?: string;
    /**
     * Plugin developer storage - persists across restarts
     * This is a way for plugin developers to store custom data with their accessory
     * Similar to `PlatformAccessory.context` for HAP accessories
     */
    context: T;
    /**
     * Initial cluster states
     * Key is the cluster name, value is an object of attribute name -> value
     *
     * Known clusters (onOff, levelControl, colorControl, etc.) provide full autocomplete.
     * Unknown clusters are still supported with the fallback `Record<string, unknown>` type.
     *
     * @example
     * ```typescript
     * clusters: {
     *   onOff: { onOff: true },
     *   levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 },
     * }
     * ```
     *
     * Note: If using `parts`, this is optional (main accessory may only be a container)
     */
    clusters?: {
        [K in keyof ClusterStateMap]?: Partial<ClusterStateMap[K]>;
    } & {
        [clusterName: string]: Record<string, unknown>;
    };
    /**
     * Handlers for Matter commands (Home app -> Device)
     *
     * These handlers are called when a user controls the accessory via the Home app.
     * Use handlers to send commands to your actual device (cloud API, local network, etc.).
     *
     * Known clusters (onOff, levelControl, colorControl, etc.) provide full autocomplete
     * for handler method names and argument types.
     *
     * @example
     * ```typescript
     * handlers: {
     *   onOff: {
     *     on: async () => { await device.turnOn() },
     *     off: async () => { await device.turnOff() },
     *   },
     *   levelControl: {
     *     moveToLevel: async (args) => {
     *       // args is typed as LevelControl.MoveToLevelRequest
     *       await device.setBrightness(args?.level ?? 0)
     *     },
     *   },
     * }
     * ```
     */
    handlers?: {
        [K in keyof ClusterHandlerMap]?: Partial<ClusterHandlerMap[K]>;
    } & {
        [clusterName: string]: MatterClusterHandlers;
    };
    /**
     * Optional: Get current state handler
     * Called when a Matter controller reads an attribute
     * If not provided, the last set value is returned
     *
     * @param cluster - Cluster name (e.g., 'onOff', 'levelControl')
     * @param attribute - Attribute name to read
     * @returns Current value of the attribute
     */
    getState?: (cluster: string, attribute: string) => Promise<unknown> | unknown;
    /**
     * Optional: Array of child endpoints (parts) for composed devices
     *
     * Use this to create devices with multiple independent subcomponents, such as:
     * - Power strip with multiple outlets
     * - Window covering with shade + light
     * - Multi-zone thermostat or speaker system
     *
     * Each part appears as a separate device in the Home app and can be controlled independently.
     *
     * Example:
     * ```typescript
     * parts: [
     *   {
     *     id: 'outlet-1',
     *     displayName: 'Outlet 1',
     *     deviceType: api.matter.deviceTypes.OnOffOutlet,
     *     clusters: { onOff: { onOff: false } },
     *     handlers: {
     *       onOff: {
     *         on: async (args, context) => {
     *           console.log(`Part ${context.partId} turned on`)
     *           await controlOutlet(1, true)
     *         }
     *       }
     *     }
     *   },
     *   // ... more outlets
     * ]
     * ```
     */
    parts?: MatterAccessoryPart[];
    /**
     * Event emitter for accessory lifecycle events.
     *
     * **Only available for external accessories** published via `api.matter.publishExternalAccessories()`.
     * This property is `undefined` for accessories registered via `api.matter.registerPlatformAccessories()`.
     *
     * The event emitter is created automatically when the accessory is published and allows
     * plugins to listen for the 'ready' event (fired when the Matter server starts).
     *
     * **HAP Equivalent:** Similar to accessing events on `PlatformAccessory._associatedHAPAccessory`
     *
     * @example
     * ```typescript
     * const accessory: MatterAccessory = { ... };
     * api.matter.publishExternalAccessories('plugin', [accessory]);
     *
     * // Listen for when the accessory is ready on the network
     * accessory._eventEmitter?.on(MatterAccessoryEventTypes.READY, (port) => {
     *   console.log(`Accessory ready on port ${port}`);
     *   // Safe to start device integration, polling, webhooks, etc.
     * });
     *
     * // Listen for commissioning events
     * accessory._eventEmitter?.on(MatterAccessoryEventTypes.COMMISSIONED, () => {
     *   console.log('Accessory paired with a controller');
     * });
     * ```
     *
     * @see MatterAccessoryEventTypes for available events
     */
    _eventEmitter?: MatterAccessoryEventEmitter;
}
/**
 * Matter Configuration (for bridge or child bridge)
 */
export interface MatterConfig extends Record<string, unknown> {
    /** Port for Matter server (optional, will auto-assign if not specified) */
    port?: number;
    /** Name for the Matter bridge (optional) */
    name?: string;
}
/**
 * Matter Server Events
 *
 * Currently empty - all events removed as they were unused.
 * Status information is queried on-demand rather than pushed via events.
 */
export interface MatterServerEvents {
    'commissioning-status-changed': (commissioned: boolean, fabricCount: number) => void;
}
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
export declare enum MatterAccessoryEventTypes {
    /**
     * Emitted when the Matter server is ready and the accessory is available on the network.
     * This is the main event to listen for to know when an external accessory is ready.
     *
     * **HAP Equivalent:** `AccessoryEventTypes.ADVERTISED`
     *
     * @param port - The port number the Matter server is listening on
     */
    READY = "ready"
}
/**
 * Matter Accessory Event Emitter Interface
 *
 * Defines the typed event emitter interface for Matter accessories.
 * This interface extends Node's EventEmitter to provide type-safe event handling
 * for Matter accessory lifecycle events.
 *
 * **Usage Pattern:**
 * ```typescript
 * const accessory: MatterAccessory = { ... };
 * api.matter.publishExternalAccessories('plugin-name', [accessory]);
 *
 * Access the event emitter (note: created during registration)
 * const internal = accessory as InternalMatterAccessory;
 * internal._eventEmitter?.on(MatterAccessoryEventTypes.READY, (port: number) => {
 *   console.log(`Accessory ready on port ${port}`);
 * });
 * ```
 *
 * @group Matter Accessory
 */
export interface MatterAccessoryEventEmitter extends EventEmitter {
    /** Register listener for 'ready' event (fired when accessory is available on network) */
    on: (event: 'ready', listener: (port: number) => void) => this;
    /** Emit 'ready' event */
    emit: (event: 'ready', port: number) => boolean;
}
/**
 * Internal representation of a part endpoint
 */
export interface InternalMatterAccessoryPart extends MatterAccessoryPart {
    /** Matter.js endpoint instance for this part */
    endpoint?: Endpoint;
}
/**
 * Internal Matter accessory representation
 * (Used internally by MatterServer)
 *
 * @internal
 */
export interface InternalMatterAccessory extends MatterAccessory {
    /** Plugin identifier (set when registered) */
    _associatedPlugin?: string;
    /** Platform name (set when registered) */
    _associatedPlatform?: string;
    /** Matter.js endpoint instance */
    endpoint?: Endpoint;
    /** Whether this accessory is currently registered */
    registered: boolean;
    /** Internal part endpoints (if using parts) */
    _parts?: InternalMatterAccessoryPart[];
}
/**
 * Matter error type enum (for error handler categorization)
 */
export declare enum MatterErrorType {
    INITIALIZATION = "INITIALIZATION",
    NETWORK = "NETWORK",
    COMMISSIONING = "COMMISSIONING",
    DEVICE_SYNC = "DEVICE_SYNC",
    SERVER = "SERVER",
    STORAGE = "STORAGE",
    CONFIGURATION = "CONFIGURATION",
    DEVICE_ERROR = "DEVICE_ERROR",
    UNKNOWN = "UNKNOWN"
}
/**
 * Matter error details interface
 */
export interface MatterErrorDetails {
    type?: MatterErrorType;
    recoverable?: boolean;
    code?: string;
    context?: string;
    originalError?: Error;
}
/**
 * Matter error types
 */
export declare class MatterError extends Error {
    readonly code: string;
    readonly details?: MatterErrorDetails | undefined;
    readonly type: MatterErrorType;
    readonly timestamp: Date;
    readonly recoverable: boolean;
    constructor(message: string, code: string, details?: MatterErrorDetails | undefined);
}
export declare class MatterCommissioningError extends MatterError {
    constructor(message: string, details?: MatterErrorDetails);
}
export declare class MatterStorageError extends MatterError {
    constructor(message: string, details?: MatterErrorDetails);
}
export declare class MatterDeviceError extends MatterError {
    constructor(message: string, details?: MatterErrorDetails);
}
export declare class MatterNetworkError extends MatterError {
    constructor(message: string, details?: MatterErrorDetails);
}
/**
 * Matter device types
 *
 * All supported Matter device types, imported from individual files for optimal performance.
 */
declare const devices: {
    AirQualitySensorDevice: any;
    ColorTemperatureLightDevice: any;
    ContactSensorDevice: any;
    DimmableLightDevice: any;
    DimmablePlugInUnitDevice: any;
    DoorLockDevice: any;
    ExtendedColorLightDevice: any;
    FanDevice: any;
    GenericSwitchDevice: any;
    HumiditySensorDevice: any;
    LightSensorDevice: any;
    OccupancySensorDevice: any;
    OnOffLightDevice: any;
    OnOffLightSwitchDevice: any;
    OnOffPlugInUnitDevice: any;
    PumpDevice: any;
    RoboticVacuumCleanerDevice: any;
    RoboticVacuumCleanerRequirements: any;
    RoomAirConditionerDevice: any;
    SmokeCoAlarmDevice: any;
    TemperatureSensorDevice: any;
    ThermostatDevice: any;
    ThermostatRequirements: any;
    WaterLeakDetectorDevice: any;
    WindowCoveringDevice: any;
};
/**
 * Matter cluster types
 *
 * All supported Matter cluster types, imported from individual files for optimal performance.
 */
declare const clusters: {
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
export { clusters, devices };
/**
 * Friendly device type names for the Plugin API
 * Maps simplified names to actual Matter.js device types
 */
export declare const deviceTypes: {
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
export declare const clusterNames: {
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
 * Type for Matter cluster names
 * Provides type safety for cluster name strings
 */
export type MatterClusterName = typeof clusterNames[keyof typeof clusterNames];
/**
 * Type-safe accessory map for MatterServer
 */
export type MatterAccessoryMap = Map<string, InternalMatterAccessory>;
/**
 * Type representing an Endpoint with settable state
 *
 * This type is used when we need to check if an endpoint has a state
 * object and a set method. The state structure varies by device type,
 * so we use a generic Record type.
 */
export type EndpointWithSettableState = Endpoint & {
    state: Record<string, unknown>;
    set: (values: Record<string, Record<string, unknown>>) => Promise<void>;
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
export declare function hasEndpointState(endpoint: Endpoint): endpoint is EndpointWithSettableState;
/**
 * Safely update endpoint state
 * Uses the Endpoint's set method to update cluster attributes
 *
 * @param endpoint - The Matter endpoint
 * @param cluster - Cluster name
 * @param attributes - Attributes to update
 * @throws {Error} If endpoint does not support state updates
 */
export declare function updateEndpointState(endpoint: Endpoint, cluster: string, attributes: Record<string, unknown>): Promise<void>;
/**
 * Device type with behaviors (internal Matter.js structure)
 * Used when we need to check if a device type supports .with()
 */
export interface DeviceTypeWithBehaviors extends EndpointType {
    with: (...behaviors: BehaviorType[]) => DeviceTypeWithBehaviors;
}
/**
 * WindowCovering cluster with dynamic attributes
 */
export interface WindowCoveringCluster {
    type?: number;
    configStatus?: {
        operational?: boolean;
        onlineReserved?: boolean;
        liftMovementReversed?: boolean;
        liftPositionAware?: boolean;
        tiltPositionAware?: boolean;
        liftEncoderControlled?: boolean;
        tiltEncoderControlled?: boolean;
    };
    targetPositionLiftPercent100ths?: number;
    currentPositionLiftPercent100ths?: number;
    targetPositionTiltPercent100ths?: number;
    currentPositionTiltPercent100ths?: number;
    operationalStatus?: {
        global: number;
        lift: number;
        tilt: number;
    };
}
/**
 * Type-safe cluster access for WindowCovering
 */
export declare function getWindowCoveringCluster(accessory: MatterAccessory): WindowCoveringCluster | undefined;
/**
 * Events emitted by MatterServer
 */
export interface MatterServerEvents {
    'commissioning-status-changed': (commissioned: boolean, fabricCount: number) => void;
    'stateChange': (data: {
        uuid: string;
        cluster: string;
        state: Record<string, unknown>;
        partId?: string;
    }) => void;
}
//# sourceMappingURL=types.d.ts.map