/**
 * Matter Types for Homebridge Plugin API
 *
 * This module provides types and interfaces for plugin developers
 * to create Matter-compatible accessories.
 */

import type { Endpoint, EndpointType } from '@matter/main'
import type { Behavior } from '@matter/node'

import type { UnknownContext } from '../platformAccessory.js'
import type { ClusterHandlerMap } from './clusterHandlerMap.js'
import type { ClusterStateMap } from './clusterStateMap.js'

import { EventEmitter } from 'node:events'

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
import { AirQuality } from '@matter/main/clusters/air-quality'
import { BooleanState } from '@matter/main/clusters/boolean-state'
import { CarbonMonoxideConcentrationMeasurement } from '@matter/main/clusters/carbon-monoxide-concentration-measurement'
import { ColorControl } from '@matter/main/clusters/color-control'
import { DoorLock } from '@matter/main/clusters/door-lock'
import { FanControl } from '@matter/main/clusters/fan-control'
import { LevelControl } from '@matter/main/clusters/level-control'
import { NitrogenDioxideConcentrationMeasurement } from '@matter/main/clusters/nitrogen-dioxide-concentration-measurement'
import { OnOff } from '@matter/main/clusters/on-off'
import { OzoneConcentrationMeasurement } from '@matter/main/clusters/ozone-concentration-measurement'
import { Pm10ConcentrationMeasurement } from '@matter/main/clusters/pm10-concentration-measurement'
import { Pm25ConcentrationMeasurement } from '@matter/main/clusters/pm25-concentration-measurement'
import { RvcOperationalState } from '@matter/main/clusters/rvc-operational-state'
import { Thermostat } from '@matter/main/clusters/thermostat'
import { ValveConfigurationAndControl } from '@matter/main/clusters/valve-configuration-and-control'
import { WindowCovering } from '@matter/main/clusters/window-covering'
// Direct imports from individual device files
import { AirQualitySensorDevice } from '@matter/main/devices/air-quality-sensor'
import { ColorTemperatureLightDevice } from '@matter/main/devices/color-temperature-light'
import { ContactSensorDevice } from '@matter/main/devices/contact-sensor'
import { DimmableLightDevice } from '@matter/main/devices/dimmable-light'
import { DimmablePlugInUnitDevice } from '@matter/main/devices/dimmable-plug-in-unit'
import { DoorLockDevice } from '@matter/main/devices/door-lock'
import { ExtendedColorLightDevice } from '@matter/main/devices/extended-color-light'
import { FanDevice } from '@matter/main/devices/fan'
import { GenericSwitchDevice } from '@matter/main/devices/generic-switch'
import { HumiditySensorDevice } from '@matter/main/devices/humidity-sensor'
import { LightSensorDevice } from '@matter/main/devices/light-sensor'
import { OccupancySensorDevice } from '@matter/main/devices/occupancy-sensor'
import { OnOffLightDevice } from '@matter/main/devices/on-off-light'
import { OnOffLightSwitchDevice } from '@matter/main/devices/on-off-light-switch'
import { OnOffPlugInUnitDevice } from '@matter/main/devices/on-off-plug-in-unit'
import { PumpDevice } from '@matter/main/devices/pump'
import { RoboticVacuumCleanerDevice, RoboticVacuumCleanerRequirements } from '@matter/main/devices/robotic-vacuum-cleaner'
import { RoomAirConditionerDevice } from '@matter/main/devices/room-air-conditioner'
import { SmokeCoAlarmDevice } from '@matter/main/devices/smoke-co-alarm'
import { TemperatureSensorDevice } from '@matter/main/devices/temperature-sensor'
import { ThermostatDevice, ThermostatRequirements } from '@matter/main/devices/thermostat'
import { WaterLeakDetectorDevice } from '@matter/main/devices/water-leak-detector'
import { WaterValveDevice, WaterValveRequirements } from '@matter/main/devices/water-valve'
import { WindowCoveringDevice } from '@matter/main/devices/window-covering'
import { BridgedNodeEndpoint } from '@matter/main/endpoints/bridged-node'

type BehaviorType = Behavior.Type

// Re-export Matter.js types for plugin use
export type { EndpointType }

/**
 * Handler context information
 * Provides information about which part of a composed device triggered the handler
 */
export interface MatterHandlerContext {
  /** Parent accessory UUID */
  uuid: string

  /** Part ID if this handler was triggered from a part, undefined for main accessory */
  partId?: string
}

/**
 * Matter command handler function type
 *
 * Handlers can be synchronous or asynchronous (returning a Promise).
 * The args parameter contains the command arguments passed by Matter.js (optional).
 * The context parameter provides information about which part triggered the handler (for composed devices).
 */
export type MatterCommandHandler<TArgs = unknown> = (args: TArgs, context?: MatterHandlerContext) => Promise<void> | void

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
  [commandName: string]: MatterCommandHandler<any>
}

/**
 * Matter Accessory Part - Sub-device in a composed accessory
 *
 * Represents a child endpoint in a composed device (e.g., individual outlets in a power strip).
 * Parts are added as child endpoints to the main accessory.
 */
export interface MatterAccessoryPart {
  /** Unique identifier for this part within the accessory (e.g., 'outlet-1', 'light', 'shade') */
  id: string

  /** Display name for this part (optional, defaults to parent's name + part id) */
  displayName?: string

  /** Matter device type for this part */
  deviceType: EndpointType

  /**
   * Initial cluster states for this part
   * Same format as `MatterAccessory.clusters`
   *
   * Known clusters get full autocomplete; unknown clusters use the fallback type.
   */
  clusters: {
    [K in keyof ClusterStateMap]?: Partial<ClusterStateMap[K]>
  } & {
    [clusterName: string]: Record<string, unknown>
  }

  /**
   * Handlers for this part's commands
   * Handlers receive context.partId to identify which part was triggered
   *
   * Known clusters get full autocomplete; unknown clusters use the fallback type.
   */
  handlers?: {
    [K in keyof ClusterHandlerMap]?: Partial<ClusterHandlerMap[K]>
  } & {
    [clusterName: string]: MatterClusterHandlers
  }
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
  UUID: string

  /** Display name for the accessory */
  displayName: string

  /** Matter device type (e.g., OnOffLightDevice, DimmableLightDevice, etc.) */
  deviceType: EndpointType

  /** Serial number for the device */
  serialNumber: string

  /** Manufacturer name */
  manufacturer: string

  /** Model name/identifier */
  model: string

  /** Firmware revision (optional) */
  firmwareRevision?: string

  /** Hardware revision (optional) */
  hardwareRevision?: string

  /** Software version (optional) */
  softwareVersion?: string

  /**
   * Plugin developer storage - persists across restarts
   * This is a way for plugin developers to store custom data with their accessory
   * Similar to `PlatformAccessory.context` for HAP accessories
   */
  context: T

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
    [K in keyof ClusterStateMap]?: Partial<ClusterStateMap[K]>
  } & {
    [clusterName: string]: Record<string, unknown>
  }

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
    [K in keyof ClusterHandlerMap]?: Partial<ClusterHandlerMap[K]>
  } & {
    [clusterName: string]: MatterClusterHandlers
  }

  /**
   * Optional: Get current state handler
   * Called when a Matter controller reads an attribute
   * If not provided, the last set value is returned
   *
   * @param cluster - Cluster name (e.g., 'onOff', 'levelControl')
   * @param attribute - Attribute name to read
   * @returns Current value of the attribute
   */
  getState?: (cluster: string, attribute: string) => Promise<unknown> | unknown

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
   *     deviceType: api.matter!.deviceTypes.OnOffOutlet,
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
  parts?: MatterAccessoryPart[]

  /**
   * Event emitter for accessory lifecycle events.
   *
   * **Only available for external accessories** published via `api.matter?.publishExternalAccessories()`.
   * This property is `undefined` for accessories registered via `api.matter?.registerPlatformAccessories()`.
   *
   * The event emitter is created automatically when the accessory is published and allows
   * plugins to listen for the 'ready' event (fired when the Matter server starts).
   *
   * **HAP Equivalent:** Similar to accessing events on `PlatformAccessory._associatedHAPAccessory`
   *
   * @example
   * ```typescript
   * const accessory: MatterAccessory = { ... };
   * api.matter?.publishExternalAccessories('plugin', [accessory]);
   *
   * // Listen for when the accessory is ready on the network
   * accessory._eventEmitter?.on(MatterAccessoryEventTypes.READY, (port) => {
   *   console.log(`Accessory ready on port ${port}`);
   *   // Safe to start device integration, polling, webhooks, etc.
   * });
   * ```
   *
   * @see MatterAccessoryEventTypes for available events
   */
  _eventEmitter?: MatterAccessoryEventEmitter
}

/**
 * Matter Configuration (for bridge or child bridge)
 */
export interface MatterConfig extends Record<string, unknown> {
  /** Port for Matter server (optional, will auto-assign if not specified) */
  port?: number

  /** Name for the Matter bridge (optional) */
  name?: string

  /**
   * When `false`, Matter is configured but not advertised — the config block
   * and the on-disk commissioning storage are preserved, so it can be
   * re-enabled without re-commissioning. Missing/`true` means enabled. This
   * mirrors how `bridge.hap.enabled: false` disables HAP without losing pairing data.
   */
  enabled?: boolean

  /**
   * When `true`, the Matter bridge node itself is NOT advertised, but plugins
   * MAY still publish external Matter accessories (each gets its own pairing
   * via `api.matter.publishExternalAccessories`). The Matter API surface
   * (`api.matter`) is still made available to plugins; only the bridge
   * aggregator is suppressed.
   *
   * Intended to be paired with `enabled: false`; if `externalsOnly: true` is
   * set on its own, validation warns and normalises `enabled` to `false`
   * rather than rejecting the config. Mirrors the behaviour of
   * `bridge.hap.externalsOnly`.
   */
  externalsOnly?: boolean
}

// Note: the canonical MatterServerEvents declaration is at the bottom of this file.
// A second declaration here is unnecessary; TypeScript would merge it silently and
// the comment ("Currently empty - all events removed") was misleading because the
// file's other declaration adds two events.

/**
 * Matter Accessory Event Types
 *
 * Events that can be emitted by Matter accessories during their lifecycle.
 *
 * @example
 * ```typescript
 * Listen for when a Matter accessory is ready
 * const accessory: MatterAccessory = { ... };
 * api.matter?.publishExternalAccessories('plugin-name', [accessory]);
 *
 * const internal = accessory as any;
 * internal._eventEmitter?.on(MatterAccessoryEventTypes.READY, (port: number) => {
 *   console.log(`Accessory ready on port ${port}`);
 * });
 * ```
 *
 * @group Matter Accessory
 */
export enum MatterAccessoryEventTypes {
  /**
   * Emitted when the Matter server is ready and the accessory is available on the network.
   * This is the main event to listen for to know when an external accessory is ready.
   *
   * **HAP Equivalent:** `AccessoryEventTypes.ADVERTISED`
   *
   * @param port - The port number the Matter server is listening on
   */
  READY = 'ready',
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
 * api.matter?.publishExternalAccessories('plugin-name', [accessory]);
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
  on: (event: 'ready', listener: (port: number) => void) => this

  /** Emit 'ready' event */
  emit: (event: 'ready', port: number) => boolean
}

/**
 * Internal representation of a part endpoint
 */
export interface InternalMatterAccessoryPart extends MatterAccessoryPart {
  /** Matter.js endpoint instance for this part */
  endpoint?: Endpoint
}

/**
 * Internal Matter accessory representation
 * (Used internally by MatterServer)
 *
 * @internal
 */
export interface InternalMatterAccessory extends MatterAccessory {
  /** Plugin identifier (set when registered) */
  _associatedPlugin?: string

  /** Platform name (set when registered) */
  _associatedPlatform?: string

  /** Matter.js endpoint instance */
  endpoint?: Endpoint

  /** Whether this accessory is currently registered */
  registered: boolean

  /** Internal part endpoints (if using parts) */
  _parts?: InternalMatterAccessoryPart[]

  // Note: _eventEmitter is now inherited from MatterAccessory (available on public interface)
}

/**
 * Matter error type enum (for error handler categorization)
 */
// Internal Matter error class hierarchy lives in `./MatterError.ts` so the
// lightweight `ChildBridgeMatterMessageHandler` can `instanceof`-check the
// routing sentinel without transitively loading this file's heavy
// `@matter/*` runtime imports. Re-exported here so all existing consumers
// importing from `./types.js` keep working.
export {
  MatterAccessoryNotOnBridgeError,
  MatterCommissioningError,
  MatterDeviceError,
  MatterError,
  type MatterErrorDetails,
  MatterErrorType,
  MatterNetworkError,
  MatterStorageError,
} from './MatterError.js'

/**
 * Matter device types
 *
 * All supported Matter device types, imported from individual files for optimal performance.
 */
const devices = {
  AirQualitySensorDevice,
  ColorTemperatureLightDevice,
  ContactSensorDevice,
  DimmableLightDevice,
  DimmablePlugInUnitDevice,
  DoorLockDevice,
  ExtendedColorLightDevice,
  FanDevice,
  GenericSwitchDevice,
  HumiditySensorDevice,
  LightSensorDevice,
  OccupancySensorDevice,
  OnOffLightDevice,
  OnOffLightSwitchDevice,
  OnOffPlugInUnitDevice,
  PumpDevice,
  RoboticVacuumCleanerDevice,
  RoboticVacuumCleanerRequirements,
  RoomAirConditionerDevice,
  SmokeCoAlarmDevice,
  TemperatureSensorDevice,
  ThermostatDevice,
  ThermostatRequirements,
  WaterLeakDetectorDevice,
  WaterValveDevice,
  WaterValveRequirements,
  WindowCoveringDevice,
}

/**
 * Matter cluster types
 *
 * All supported Matter cluster types, imported from individual files for optimal performance.
 */
const clusters = {
  AirQuality,
  BooleanState,
  CarbonMonoxideConcentrationMeasurement,
  ColorControl,
  DoorLock,
  FanControl,
  LevelControl,
  NitrogenDioxideConcentrationMeasurement,
  OnOff,
  OzoneConcentrationMeasurement,
  Pm10ConcentrationMeasurement,
  Pm25ConcentrationMeasurement,
  RvcOperationalState,
  Thermostat,
  ValveConfigurationAndControl,
  WindowCovering,
}

// Export Matter.js clusters and devices for direct access
// Note: types.ts is only imported by MatterServer, MatterBridgeManager, etc.
// which are themselves lazy-loaded, so these imports only happen when Matter is used
export { clusters, devices }

/**
 * Friendly device type names for the Plugin API
 * Maps simplified names to actual Matter.js device types
 */
export const deviceTypes = {
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

  // Water Valve
  WaterValve: devices.WaterValveDevice.with(devices.WaterValveRequirements.ValveConfigurationAndControlServer),

  // Other
  GenericSwitch: devices.GenericSwitchDevice,
  Pump: devices.PumpDevice,
  RoomAirConditioner: devices.RoomAirConditionerDevice,

  // Composed device container — use as parent for accessories with parts.
  // Children appear as a single accessory in Apple Home, expandable into separate tiles.
  BridgedNode: BridgedNodeEndpoint,
} as const

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
export const clusterNames = {
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

  // Power
  PowerSource: 'powerSource',

  // Pump & Other
  PumpConfigurationAndControl: 'pumpConfigurationAndControl',

  // Valve
  ValveConfigurationAndControl: 'valveConfigurationAndControl',

  // Identification
  Identify: 'identify',

  // Switch (GenericSwitch - stateless remotes and buttons)
  Switch: 'switch',

  // Device Information (read-only, set during registration)
  BasicInformation: 'basicInformation',
  BridgedDeviceBasicInformation: 'bridgedDeviceBasicInformation',
} as const

/**
 * Type for Matter cluster names
 * Provides type safety for cluster name strings
 */
export type MatterClusterName = typeof clusterNames[keyof typeof clusterNames]

/**
 * Type-safe accessory map for MatterServer
 */
export type MatterAccessoryMap = Map<string, InternalMatterAccessory>

/**
 * Type representing an Endpoint with settable state
 *
 * This type is used when we need to check if an endpoint has a state
 * object and a set method. The state structure varies by device type,
 * so we use a generic Record type.
 */
export type EndpointWithSettableState = Endpoint & {
  state: Record<string, unknown>
  set: (values: Record<string, Record<string, unknown>>) => Promise<void>
}

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
export function hasEndpointState(endpoint: Endpoint): endpoint is EndpointWithSettableState {
  return 'state' in endpoint
    && typeof (endpoint as { state?: unknown }).state === 'object'
    && (endpoint as { state?: unknown }).state !== null
    && 'set' in endpoint
    && typeof (endpoint as { set?: unknown }).set === 'function'
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
export async function updateEndpointState(
  endpoint: Endpoint,
  cluster: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  if (!hasEndpointState(endpoint)) {
    throw new Error('Endpoint does not support state updates')
  }

  const updateObject = { [cluster]: attributes }
  await endpoint.set(updateObject)
}

/**
 * Device type with behaviors (internal Matter.js structure)
 * Used when we need to check if a device type supports .with()
 */
export interface DeviceTypeWithBehaviors extends EndpointType {
  with: (...behaviors: BehaviorType[]) => DeviceTypeWithBehaviors
}

/**
 * WindowCovering cluster with dynamic attributes
 */
export interface WindowCoveringCluster {
  type?: number
  configStatus?: {
    operational?: boolean
    onlineReserved?: boolean
    liftMovementReversed?: boolean
    liftPositionAware?: boolean
    tiltPositionAware?: boolean
    liftEncoderControlled?: boolean
    tiltEncoderControlled?: boolean
  }
  targetPositionLiftPercent100ths?: number
  currentPositionLiftPercent100ths?: number
  targetPositionTiltPercent100ths?: number
  currentPositionTiltPercent100ths?: number
  operationalStatus?: {
    global: number
    lift: number
    tilt: number
  }
}

/**
 * Type-safe cluster access for WindowCovering
 */
export function getWindowCoveringCluster(accessory: MatterAccessory): WindowCoveringCluster | undefined {
  return accessory.clusters?.windowCovering as WindowCoveringCluster | undefined
}

/**
 * Events emitted by MatterServer
 */
export interface MatterServerEvents {
  'commissioning-status-changed': (commissioned: boolean, fabricCount: number) => void
  'stateChange': (data: { uuid: string, cluster: string, state: Record<string, unknown>, partId?: string }) => void
}
