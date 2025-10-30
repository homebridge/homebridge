/**
 * Matter Types for Homebridge Plugin API
 *
 * This module provides types and interfaces for plugin developers
 * to create Matter-compatible accessories.
 */

import type { Endpoint, EndpointType } from '@matter/main'

import { EventEmitter } from 'node:events'

import * as clusters from '@matter/main/clusters'
import * as devices from '@matter/main/devices'

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
export type MatterCommandHandler<TArgs = unknown> = (args?: TArgs, context?: MatterHandlerContext) => Promise<void> | void

/**
 * Matter cluster handlers interface
 *
 * Maps command names to their handler functions.
 * Each command can have custom argument types.
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
   */
  clusters: {
    [clusterName: string]: {
      [attributeName: string]: unknown
    }
  }

  /**
   * Handlers for this part's commands
   * Handlers receive context.partId to identify which part was triggered
   */
  handlers?: {
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
export interface MatterAccessory<T = Record<string, unknown>> {
  /** Unique identifier for this accessory (must be unique across all accessories) */
  uuid: string

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
  context?: T

  /**
   * Initial cluster states
   * Key is the cluster name, value is an object of attribute name -> value
   *
   * Example:
   * {
   *   onOff: { onOff: true },
   *   levelControl: { currentLevel: 127, minLevel: 1, maxLevel: 254 }
   * }
   *
   * Note: If using `parts`, this is optional (main accessory may only be a container)
   */
  clusters?: {
    [clusterName: string]: {
      [attributeName: string]: unknown
    }
  }

  /**
   * Handlers for Matter commands (Home app → Device)
   *
   * These handlers are called when a user controls the accessory via the Home app.
   * Use handlers to send commands to your actual device (cloud API, local network, etc.).
   */
  handlers?: {
    [clusterName: string]: MatterClusterHandlers
  }

  /**
   * Optional: Get current state handler
   * Called when a Matter controller reads an attribute
   * If not provided, the last set value is returned
   */
  getState?: (cluster: string, attribute: string) => Promise<any> | any

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
  parts?: MatterAccessoryPart[]

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
}

/**
 * Matter Server Events
 *
 * Currently empty - all events removed as they were unused.
 * Status information is queried on-demand rather than pushed via events.
 */
export interface MatterServerEvents {
  // Event emitted when commissioning status changes (for UI/IPC updates)
  'commissioning-status-changed': (commissioned: boolean, fabricCount: number) => void
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
export enum MatterErrorType {
  INITIALIZATION = 'INITIALIZATION',
  NETWORK = 'NETWORK',
  COMMISSIONING = 'COMMISSIONING',
  DEVICE_SYNC = 'DEVICE_SYNC',
  SERVER = 'SERVER',
  STORAGE = 'STORAGE',
  CONFIGURATION = 'CONFIGURATION',
  DEVICE_ERROR = 'DEVICE_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Matter error details interface
 */
export interface MatterErrorDetails {
  type?: MatterErrorType
  recoverable?: boolean
  code?: string
  context?: string
  originalError?: Error
}

/**
 * Matter error types
 */
export class MatterError extends Error {
  public readonly type: MatterErrorType
  public readonly timestamp: Date
  public readonly recoverable: boolean

  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: MatterErrorDetails,
  ) {
    super(message)
    this.name = 'MatterError'
    this.type = details?.type ?? MatterErrorType.UNKNOWN
    this.timestamp = new Date()
    this.recoverable = details?.recoverable ?? true
  }
}

export class MatterCommissioningError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'COMMISSIONING_ERROR', { ...details, type: MatterErrorType.COMMISSIONING })
    this.name = 'MatterCommissioningError'
  }
}

export class MatterStorageError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'STORAGE_ERROR', { ...details, type: MatterErrorType.STORAGE })
    this.name = 'MatterStorageError'
  }
}

export class MatterDeviceError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'DEVICE_ERROR', { ...details, type: MatterErrorType.DEVICE_ERROR })
    this.name = 'MatterDeviceError'
  }
}

export class MatterNetworkError extends MatterError {
  constructor(message: string, details?: MatterErrorDetails) {
    super(message, 'NETWORK_ERROR', { ...details, type: MatterErrorType.NETWORK })
    this.name = 'MatterNetworkError'
  }
}

// Export Matter.js clusters for direct access
export { clusters }

// Export raw devices namespace (for advanced use)
export { devices }

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
  TemperatureSensor: devices.TemperatureSensorDevice,
  HumiditySensor: devices.HumiditySensorDevice,
  LightSensor: devices.LightSensorDevice,
  MotionSensor: devices.OccupancySensorDevice,
  ContactSensor: devices.ContactSensorDevice,
  LeakSensor: devices.WaterLeakDetectorDevice,
  SmokeSensor: devices.SmokeCoAlarmDevice,

  // HVAC
  Thermostat: devices.ThermostatDevice.with(devices.ThermostatRequirements.ThermostatServer.with('Heating', 'Cooling')),
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
 * Check if endpoint has state property (runtime check)
 */
export function hasEndpointState(endpoint: Endpoint): boolean {
  return 'state' in endpoint && typeof (endpoint as any).state === 'object'
}

/**
 * Safely update endpoint state
 * Uses the Endpoint's set method to update cluster attributes
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
  await (endpoint as any).set(updateObject)
}

/**
 * Device type with behaviors (internal Matter.js structure)
 */
export interface DeviceTypeWithBehaviors extends EndpointType {
  with: (...behaviors: any[]) => DeviceTypeWithBehaviors
}

/**
 * WindowCovering cluster with dynamic attributes
 */
export interface WindowCoveringCluster {
  type?: number
  configStatus?: {
    liftPositionAware?: boolean
    tiltPositionAware?: boolean
    liftEncoderControlled?: boolean
    tiltEncoderControlled?: boolean
  }
  targetPositionLiftPercent100ths?: number
  currentPositionLiftPercent100ths?: number
  targetPositionTiltPercent100ths?: number
  currentPositionTiltPercent100ths?: number
  operationalStatus?: number
}

/**
 * Type-safe cluster access for WindowCovering
 */
export function getWindowCoveringCluster(accessory: MatterAccessory): WindowCoveringCluster | undefined {
  return accessory.clusters?.windowCovering as WindowCoveringCluster | undefined
}
