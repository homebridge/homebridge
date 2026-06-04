import type { Controller, Service } from '@homebridge/hap-nodejs'

import type { AccessoryConfig, PlatformConfig } from './bridgeService.js'
import type { Logging } from './logger.js'
import type { BaseMatterManager } from './matter/BaseMatterManager.js'
import type {
  clusterNames,
  clusters,
  ClusterStateMap,
  deviceTypes,
  MatterAccessory,
  MatterServer,
  MatterTypes,
} from './matter/index.js'
import type { SwitchAPI } from './matter/SwitchAPI.js'

import { EventEmitter } from 'node:events'

import hapNodeJs from '@homebridge/hap-nodejs'
import semver from 'semver'

import { Logger } from './logger.js'
import { PlatformAccessory } from './platformAccessory.js'
import { PluginManager } from './pluginManager.js'
import { User } from './user.js'
import getVersion from './version.js'

const log = Logger.internal

export type HAP = typeof hapNodeJs
export type HAPLegacyTypes = typeof hapNodeJs.LegacyTypes

export type PluginIdentifier = PluginName | ScopedPluginName
export type PluginName = string // plugin name like "homebridge-dummy"
export type ScopedPluginName = string // plugin name like "@scope/homebridge-dummy"
export type AccessoryName = string
export type PlatformName = string

export type AccessoryIdentifier = string // format: "PluginIdentifier.AccessoryName"
export type PlatformIdentifier = string // format: "PluginIdentifier.PlatformName"

// eslint-disable-next-line no-restricted-syntax
export const enum PluginType {
  ACCESSORY = 'accessory',
  PLATFORM = 'platform',
}

/**
 * The {PluginInitializer} is a method which must be the default export for every homebridge plugin.
 * It is called once the plugin is loaded from disk.
 */
export interface PluginInitializer {
  /**
   * When the initializer is called the plugin must use the provided api instance and call the appropriate
   * register methods - {@link API.registerAccessory} or {@link API.registerPlatform} - in order to
   * correctly register for the following startup sequence.
   *
   * @param {API} api
   */
  (api: API): void | Promise<void>
}

export interface AccessoryPluginConstructor {
  new(logger: Logging, config: AccessoryConfig, api: API): AccessoryPlugin
}

export interface AccessoryPlugin {
  /**
   * Optional method which will be called if an 'identify' of an Accessory is requested by HomeKit.
   */
  identify?: () => void

  /**
   * This method will be called once on startup, to query all services to be exposed by the Accessory.
   * All event handlers for characteristics should be set up before the array is returned.
   *
   * @returns {Service[]} services - returned services will be added to the Accessory
   */
  getServices: () => Service[]

  /**
   * This method will be called once on startup, to query all controllers to be exposed by the Accessory.
   * It is optional to implement.
   *
   * This includes controllers like the RemoteController or the CameraController.
   * Any necessary controller specific setup should have been done when returning the array.
   * In most cases the plugin will only return an array of the size 1.
   *
   * In the case that the Plugin does not add any additional services (returned by {@link getServices}) the
   * method {@link getServices} must be defined in any way and should just return an empty array.
   *
   * @returns {Controller[]} controllers - returned controllers will be configured for the Accessory
   */
  getControllers?: () => Controller[]
}

export interface PlatformPluginConstructor<Config extends PlatformConfig = PlatformConfig> {
  new(logger: Logging, config: Config, api: API): DynamicPlatformPlugin | StaticPlatformPlugin | IndependentPlatformPlugin
}

export interface PlatformPlugin {} // not exported to the public in index.ts

/**
 * Platform that is able to dynamically add or remove accessories.
 * All configured accessories are stored to disk and recreated on startup.
 * Accessories can be added or removed by using {@link API.registerPlatformAccessories} or {@link API.unregisterPlatformAccessories}.
 */
export interface DynamicPlatformPlugin extends PlatformPlugin {
  /**
   * This method is called for every PlatformAccessory, which is recreated from disk on startup.
   * It should be used to properly initialize the Accessory and setup all event handlers for
   * all services and their characteristics.
   *
   * @param {PlatformAccessory} accessory which needs to be configured
   */
  configureAccessory: (accessory: PlatformAccessory) => void

  /**
   * This method is called for every Matter accessory, which is recreated from cache on startup.
   * It should be used to track cached accessories so the plugin can determine which accessories
   * to re-register and which to remove (if they no longer exist in the external system).
   *
   * This is the Matter equivalent of configureAccessory for HAP accessories.
   *
   * @param {MatterAccessory} accessory - cached Matter accessory
   */
  configureMatterAccessory?: (accessory: MatterAccessory) => void
}

/**
 * Platform that exposes all available characteristics at the start of the plugin.
 * The set of accessories can not change at runtime.
 * The bridge waits for all callbacks to return before it is published and accessible by HomeKit controllers.
 */
export interface StaticPlatformPlugin extends PlatformPlugin {
  /**
   * This method is called once at startup. The Platform should pass all accessories which need to be created
   * to the callback in form of a {@link AccessoryPlugin}.
   * The Platform must respond in a timely manner as otherwise the startup of the bridge would be unnecessarily delayed.
   *
   * @param {(foundAccessories: AccessoryPlugin[]) => void} callback
   */
  accessories: (callback: (foundAccessories: AccessoryPlugin[]) => void) => void
}

/**
 * Platform that does not aim to add any accessories to the main bridge accessory.
 * This platform should be used if for example a plugin aims to only expose external accessories.
 * It should also be used when the platform doesn't intend to expose any accessories at all, like plugins
 * providing a UI for homebridge.
 */
export interface IndependentPlatformPlugin extends PlatformPlugin {
  // does not expose any methods
}

// eslint-disable-next-line no-restricted-syntax
export const enum APIEvent {
  /**
   * Event is fired once homebridge has finished with booting up and initializing all components and plugins.
   * When this event is fired it is possible that the Bridge accessory isn't published yet, if homebridge still needs
   * to wait for some {@see StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
   */
  DID_FINISH_LAUNCHING = 'didFinishLaunching',

  /**
   * This event is fired when homebridge gets shutdown. This could be a regular shutdown or an unexpected crash.
   * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
   */
  SHUTDOWN = 'shutdown',
}

// eslint-disable-next-line no-restricted-syntax
export const enum InternalAPIEvent {
  REGISTER_ACCESSORY = 'registerAccessory',
  REGISTER_PLATFORM = 'registerPlatform',

  PUBLISH_EXTERNAL_ACCESSORIES = 'publishExternalAccessories',
  REGISTER_PLATFORM_ACCESSORIES = 'registerPlatformAccessories',
  UPDATE_PLATFORM_ACCESSORIES = 'updatePlatformAccessories',
  UNREGISTER_PLATFORM_ACCESSORIES = 'unregisterPlatformAccessories',

  // Matter events (matching HAP pattern)
  PUBLISH_EXTERNAL_MATTER_ACCESSORIES = 'publishExternalMatterAccessories',
  REGISTER_MATTER_PLATFORM_ACCESSORIES = 'registerMatterPlatformAccessories',
  UPDATE_MATTER_PLATFORM_ACCESSORIES = 'updateMatterPlatformAccessories',
  UNREGISTER_MATTER_PLATFORM_ACCESSORIES = 'unregisterMatterPlatformAccessories',
  UNREGISTER_EXTERNAL_MATTER_ACCESSORIES = 'unregisterExternalMatterAccessories',
  UPDATE_MATTER_ACCESSORY_STATE = 'updateMatterAccessoryState',
}

/**
 * Matter API Interface.
 *
 * Provides access to Matter protocol functionality for creating
 * Matter-compatible accessories. Similar to `api.hap` for HomeKit
 * Accessory Protocol.
 *
 * `api.matter` is `MatterAPI | undefined` — it's defined on bridges
 * where Matter is configured (matches `api.isMatterEnabled()`),
 * undefined otherwise. Plugins must use optional chaining or guard
 * with `isMatterEnabled()`.
 *
 * @example
 * ```typescript
 * // Defensive pattern (recommended for plugins that work with or without Matter):
 * api.matter?.registerPlatformAccessories('homebridge-example', 'Example', [{
 *   UUID: api.hap.uuid.generate('my-light'),
 *   displayName: 'Living Room Light',
 *   deviceType: api.matter!.deviceTypes.OnOffLight,
 *   manufacturer: 'Example',
 *   model: 'Example Light',
 *   serialNumber: 'EX-001',
 *   clusters: { onOff: { onOff: false } },
 * }])
 *
 * // Update state when device changes externally
 * await api.matter?.updateAccessoryState(uuid, 'onOff', { onOff: true })
 *
 * // Read current state
 * const state = await api.matter?.getAccessoryState(uuid, 'onOff')
 * ```
 *
 * @example
 * ```typescript
 * // Guard pattern (recommended for plugins that always require Matter):
 * if (!api.isMatterEnabled()) {
 *   log.error('Matter is not enabled for this bridge; the plugin requires Matter.')
 *   return
 * }
 * const matter = api.matter!
 * await matter.registerPlatformAccessories(pluginId, platformName, accessories)
 * ```
 */
export interface MatterAPI {
  /**
   * UUID generator (alias of api.hap.uuid for convenience)
   * Use this to generate unique identifiers for Matter accessories
   *
   * @example
   * ```typescript
   * const uuid = api.matter?.uuid.generate('my-light-unique-id')
   * api.matter?.registerAccessory({
   *   uuid,
   *   displayName: 'Living Room Light',
   *   // ...
   * })
   * ```
   */
  readonly uuid: HAP['uuid']

  /**
   * Matter device types for creating accessories.
   * Maps friendly names to Matter.js device types, including stateless controller types like `GenericSwitch`.
   */
  readonly deviceTypes: typeof deviceTypes

  /**
   * Matter clusters - Direct access to Matter.js cluster definitions
   * For advanced use cases requiring low-level cluster access
   */
  readonly clusters: typeof clusters

  /**
   * Matter cluster names for type safety and autocomplete
   * Use these constants with updateAccessoryState() and getAccessoryState()
   *
   * @example
   * ```typescript
   * api.matter?.updateAccessoryState(uuid, api.matter?.clusterNames.OnOff, { onOff: true })
   * api.matter?.getAccessoryState(uuid, api.matter?.clusterNames.LevelControl)
   * ```
   */
  readonly clusterNames: typeof clusterNames

  /**
   * Matter types - Access to Matter.js cluster type definitions and enums
   * Use these for type-safe attribute values (modes, states, etc.)
   *
   * @example
   * ```typescript
   * Fan mode enum
   * api.matter?.updateAccessoryState(
   *   uuid,
   *   api.matter?.clusterNames.FanControl,
   *   { fanMode: api.matter?.types.FanControl.FanMode.High }
   * )
   * ```
   */
  readonly types: typeof MatterTypes

  /**
   * Register Matter platform accessories (works exactly like HAP's registerPlatformAccessories)
   *
   * Returns a promise that resolves when all accessories are fully registered and ready for state updates.
   * This is especially important for external accessories (like robot vacuums) which require additional setup time.
   *
   * @param pluginIdentifier - The plugin identifier (e.g., 'homebridge-example')
   * @param platformName - The platform name (e.g., 'ExamplePlatform')
   * @param accessories - Array of Matter accessories to register
   */
  registerPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => Promise<void>

  /**
   * Update Matter platform accessories in the cache
   *
   * Use this to update cached accessory information (displayName, manufacturer, model, etc.)
   * without unregistering and re-registering. This is useful when:
   * - Device name changes in the external system
   * - Firmware version gets updated
   * - Other metadata needs to be refreshed
   *
   * Similar to api.updatePlatformAccessories() for HAP accessories.
   *
   * @param accessories - Array of Matter accessories to update (must include uuid)
   *
   * @example
   * ```typescript
   * // Update the display name after it changed in the external system
   * const accessory = cachedAccessories.find(a => a.uuid === uuid)
   * if (accessory) {
   *   accessory.displayName = 'New Name from API'
   *   await api.matter?.updatePlatformAccessories([accessory])
   * }
   * ```
   */
  updatePlatformAccessories: (accessories: MatterAccessory[]) => Promise<void>

  /**
   * Unregister Matter platform accessories by UUID
   * @param pluginIdentifier - The plugin identifier
   * @param platformName - The platform name
   * @param accessories - Array of Matter accessories to unregister (only uuid is required)
   */
  unregisterPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => Promise<void>

  /**
   * Update a Matter accessory's cluster state when device changes externally
   *
   * Use this for state updates from:
   * - Native app controls
   * - Physical button presses
   * - Webhooks from cloud service
   * - Polling results
   *
   * DO NOT use inside handlers - state auto-updates after handlers complete!
   * Similar to HAP's characteristic.updateValue()
   *
   * @param uuid - The UUID of the accessory
   * @param cluster - The cluster name (use api.matter?.clusterNames for autocomplete)
   * @param attributes - The attributes to update
   * @param partId - Optional: ID of the part to update (for composed devices with multiple endpoints)
   *
   * @example
   * ```typescript
   * Device turned on via native app:
   * await api.matter?.updateAccessoryState(
   *   uuid,
   *   api.matter?.clusterNames.OnOff,
   *   { onOff: true }
   * )
   *
   * Device brightness changed via physical button:
   * await api.matter?.updateAccessoryState(
   *   uuid,
   *   api.matter?.clusterNames.LevelControl,
   *   { currentLevel: 200 }
   * )
   *
   * Update a specific outlet in a power strip (composed device):
   * await api.matter?.updateAccessoryState(
   *   uuid,
   *   api.matter?.clusterNames.OnOff,
   *   { onOff: true },
   *   'outlet-2' // Part ID
   * )
   * ```
   */
  updateAccessoryState: {
    /** Typed overload for known clusters - provides autocomplete for attribute names */
    <K extends keyof ClusterStateMap>(uuid: string, cluster: K, attributes: Partial<ClusterStateMap[K]>, partId?: string): Promise<void>
    /** Fallback for unknown/custom clusters */
    (uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void>
  }

  /**
   * Get a Matter accessory's current cluster state
   *
   * Returns the current attribute values that are exposed to Matter controllers.
   * Useful for:
   * - Reading state after plugin restart
   * - Verifying current state before making changes
   * - Debugging and logging
   *
   * Similar to HAP's `characteristic.value` getter.
   *
   * @param uuid - The UUID of the accessory
   * @param cluster - The cluster name (use api.matter?.clusterNames for autocomplete)
   * @param partId - Optional: ID of the part to get state from (for composed devices with multiple endpoints)
   * @returns Current cluster attribute values, or undefined if not found
   *
   * @example
   * ```typescript
   * const state = await api.matter?.getAccessoryState(uuid, api.matter?.clusterNames.OnOff)
   * if (state?.onOff) {
   *   console.log('Light is currently on')
   * }
   *
   * Get state of a specific outlet in a power strip:
   * const outletState = await api.matter?.getAccessoryState(
   *   uuid,
   *   api.matter?.clusterNames.OnOff,
   *   'outlet-3' // Part ID
   * )
   * ```
   */
  getAccessoryState: {
    /** Typed overload for known clusters - returns typed state */
    <K extends keyof ClusterStateMap>(uuid: string, cluster: K, partId?: string): Promise<Partial<ClusterStateMap[K]> | undefined>
    /** Fallback for unknown/custom clusters */
    (uuid: string, cluster: string, partId?: string): Promise<Record<string, unknown> | undefined>
  }

  /**
   * Helpers for `GenericSwitch` accessories (stateless remotes and buttons).
   *
   * Device-type-specific helpers live under nested namespaces (e.g. `api.matter?.switch`)
   * to keep the top-level `MatterAPI` surface focused on the generic, UUID-addressed primitives.
   *
   * @see {@link SwitchAPI}
   *
   * @example
   * ```typescript
   * // Simple single-button press and release
   * await api.matter?.switch.emit(uuid, 'press')
   * await api.matter?.switch.emit(uuid, 'release')
   * ```
   */
  readonly switch: SwitchAPI
}

export interface API {
  /**
   * The homebridge API version as a floating point number.
   */
  readonly version: number

  /**
   * The current homebridge semver version.
   */
  readonly serverVersion: string

  // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
  readonly user: typeof User
  readonly hap: HAP
  readonly hapLegacyTypes: HAPLegacyTypes // used for older accessories/platforms
  readonly platformAccessory: typeof PlatformAccessory
  // ------------------------------------------------------------------------

  /**
   * Matter Protocol API.
   *
   * @remarks
   * Defined when Matter is configured for this bridge (i.e. when
   * `api.isMatterEnabled()` returns true), undefined otherwise. Loaded
   * automatically before plugins run on Matter-enabled bridges, so
   * plugins can access it from their initializer, platform/accessory
   * constructor, or `didFinishLaunching` handler.
   *
   * Safe access patterns:
   * ```typescript
   * api.matter?.registerPlatformAccessories(...)         // defensive, no-ops when disabled
   * if (api.isMatterEnabled()) {
   *   api.matter!.registerPlatformAccessories(...)       // explicit guard
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Register a Matter accessory
   * api.matter?.registerPlatformAccessories('homebridge-example', 'Example', [{
   *   UUID: api.hap.uuid.generate('my-light'),
   *   displayName: 'Living Room Light',
   *   deviceType: api.matter!.deviceTypes.OnOffLight,
   *   manufacturer: 'Example',
   *   model: 'Example Light',
   *   serialNumber: 'EX-001',
   *   clusters: { onOff: { onOff: false } },
   * }])
   *
   * // Update state
   * await api.matter?.updateAccessoryState(uuid, 'onOff', { onOff: true })
   * ```
   */
  readonly matter?: MatterAPI

  /**
   * Returns true if the current running homebridge version is greater or equal to the
   * passed version string.
   *
   * Example:
   *
   * We assume the homebridge version 1.3.0-beta.12 ({@link serverVersion}) and the following example calls below
   * ```
   *  versionGreaterOrEqual("1.2.0"); // will return true
   *  versionGreaterOrEqual("1.3.0"); // will return false (the RELEASE version 1.3.0 is bigger than the BETA version 1.3.0-beta.12)
   *  versionGreaterOrEqual("1.3.0-beta.8); // will return true
   * ```
   *
   * @param version
   */
  versionGreaterOrEqual: (version: string) => boolean

  registerAccessory: ((accessoryName: AccessoryName, constructor: AccessoryPluginConstructor) => void) & ((pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor) => void)

  registerPlatform: (<Config extends PlatformConfig>(platformName: PlatformName, constructor: PlatformPluginConstructor<Config>) => void) & (<Config extends PlatformConfig>(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor<Config>) => void)
  registerPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]) => void
  updatePlatformAccessories: (accessories: PlatformAccessory[]) => void
  unregisterPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]) => void

  publishExternalAccessories: (pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]) => void

  /**
   * Check if Matter is available in this version of Homebridge
   * @returns true if Homebridge version is >= 2.0.0-alpha.0
   */
  isMatterAvailable: () => boolean

  /**
   * Check if Matter is enabled for this bridge
   * For main bridge: returns true if Matter is enabled in `bridge.matter` config
   * For child bridge: returns true if Matter is enabled in the _bridge.matter config
   * @returns true if Matter is enabled
   */
  isMatterEnabled: () => boolean

  on: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this)
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export declare interface HomebridgeAPI {
  on: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this) & ((event: InternalAPIEvent.REGISTER_ACCESSORY, listener: (accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => void) => this) & ((event: InternalAPIEvent.REGISTER_PLATFORM, listener: (platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => void) => this) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, listener: (accessories: MatterAccessory[], registrationId: string) => void) => this) & ((event: InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, listener: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => void) => this) & ((event: InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, listener: (accessories: MatterAccessory[]) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, listener: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, listener: (accessories: MatterAccessory[]) => void) => this) & ((event: InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, listener: (uuid: string, cluster: string, attributes: Record<string, any>, partId?: string) => void) => this)

  emit: ((event: 'didFinishLaunching') => boolean) & ((event: 'shutdown') => boolean) & ((event: InternalAPIEvent.REGISTER_ACCESSORY, accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => boolean) & ((event: InternalAPIEvent.REGISTER_PLATFORM, platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => boolean) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, accessories: MatterAccessory[], registrationId: string) => boolean) & ((event: InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => boolean) & ((event: InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, accessories: MatterAccessory[]) => boolean) & ((event: InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => boolean) & ((event: InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, accessories: MatterAccessory[]) => boolean) & ((event: InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, uuid: string, cluster: string, attributes: Record<string, any>, partId?: string) => boolean)
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class HomebridgeAPI extends EventEmitter implements API {
  public readonly version = 2.7 // homebridge API version
  public readonly serverVersion = getVersion() // homebridge node module version

  // ------------------ LEGACY EXPORTS FOR PRE TYPESCRIPT  ------------------
  readonly user = User
  readonly hap = hapNodeJs
  readonly hapLegacyTypes = hapNodeJs.LegacyTypes // used for older accessories/platforms
  readonly platformAccessory = PlatformAccessory
  // ------------------------------------------------------------------------

  /**
   * Internal state tracking whether Matter is enabled for this bridge
   */
  private matterEnabled = false

  /**
   * Internal reference to MatterServer for API methods that need return values
   * @internal
   */
  public _matterServer: MatterServer | null = null

  /**
   * Internal reference to MatterBridgeManager for checking external servers
   * @internal
   */
  public _matterManager: BaseMatterManager | null = null

  /**
   * Pending external accessory registrations
   * Map of registration ID to resolve function
   * @internal
   */
  private _pendingExternalRegistrations: Map<string, () => void> = new Map()

  /**
   * Lazy-loaded Matter API implementation
   */
  private _matterAPI?: MatterAPI

  /**
   * Matter Protocol API (lazy-loaded).
   *
   * Returns the loaded MatterAPI instance, or `undefined` when Matter is not
   * configured for this bridge. Server / ChildBridgeFork call
   * {@link loadMatterAPI} before plugins run on Matter-enabled bridges, so
   * plugins observe a defined value here whenever {@link isMatterEnabled}
   * returns true.
   */
  get matter(): MatterAPI | undefined {
    return this._matterAPI
  }

  /**
   * In-flight loadMatterAPI promise. Cached so concurrent callers share a
   * single dynamic-import + construction; otherwise both could observe
   * `!this._matterAPI`, both await the import, and the second call's
   * MatterAPIImpl would clobber the first (along with anything wired into
   * `_pendingExternalRegistrations`).
   */
  private _matterAPILoadPromise?: Promise<void>

  /**
   * Load Matter API implementation. Idempotent.
   *
   * Called by Server / ChildBridgeFork during startup when Matter is
   * configured for the bridge, before plugin initialization. Plugins should
   * not call this directly — use {@link matter} instead.
   *
   * @internal
   */
  async loadMatterAPI(): Promise<void> {
    if (this._matterAPI) {
      return
    }
    if (!this._matterAPILoadPromise) {
      this._matterAPILoadPromise = (async () => {
        const { MatterAPIImpl } = await import('./matter/MatterAPIImpl.js')
        this._matterAPI = new MatterAPIImpl(this)
        // Mark Matter as enabled here, before plugins initialise. The later
        // `_setMatterEnabled(true)` calls inside MatterBridgeManager /
        // ChildBridgeMatterManager remain (idempotent) for code paths that
        // construct those managers directly without going through
        // loadMatterAPI. The contract `api.matter defined ⇔
        // api.isMatterEnabled()` now holds for plugins reading either from
        // their initialiser.
        this.matterEnabled = true
      })()
    }
    return this._matterAPILoadPromise
  }

  constructor() {
    super()
  }

  /**
   * Internal method to set Matter enabled status
   * Called by Server or ChildBridgeFork after Matter initialization
   * @internal
   */
  _setMatterEnabled(enabled: boolean): void {
    this.matterEnabled = enabled
  }

  /**
   * Internal method to set MatterServer reference
   * Called by Server or ChildBridgeFork after creating MatterServer
   * @internal
   */
  _setMatterServer(server: MatterServer | null): void {
    this._matterServer = server
  }

  /**
   * Internal method to set MatterBridgeManager reference
   * Called by Server or ChildBridgeFork to allow API access to external servers
   * @internal
   */
  _setMatterManager(manager: BaseMatterManager | null): void {
    this._matterManager = manager
  }

  /**
   * Internal method to resolve pending external accessory registrations
   * Called by MatterBridgeManager when external accessories finish publishing
   * @internal
   */
  _resolveExternalRegistration(registrationId: string): void {
    const resolve = this._pendingExternalRegistrations.get(registrationId)
    if (resolve) {
      resolve()
      this._pendingExternalRegistrations.delete(registrationId)
    }
  }

  public versionGreaterOrEqual(version: string): boolean {
    return semver.gte(this.serverVersion, version)
  }

  public static isDynamicPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is DynamicPlatformPlugin {
    return 'configureAccessory' in platformPlugin
  }

  public static isStaticPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is StaticPlatformPlugin {
    return 'accessories' in platformPlugin
  }

  signalFinished(): void {
    this.emit(APIEvent.DID_FINISH_LAUNCHING)
  }

  signalShutdown(): void {
    this.emit(APIEvent.SHUTDOWN)
  }

  registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void
  registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void
  registerAccessory(pluginIdentifier: PluginIdentifier | AccessoryName, accessoryName: AccessoryName | AccessoryPluginConstructor, constructor?: AccessoryPluginConstructor): void {
    if (typeof accessoryName === 'function') {
      constructor = accessoryName
      accessoryName = pluginIdentifier
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor)
    } else {
      this.emit(InternalAPIEvent.REGISTER_ACCESSORY, accessoryName, constructor!, pluginIdentifier)
    }
  }

  registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void
  registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void
  registerPlatform(pluginIdentifier: PluginIdentifier | PlatformName, platformName: PlatformName | PlatformPluginConstructor, constructor?: PlatformPluginConstructor): void {
    if (typeof platformName === 'function') {
      constructor = platformName
      platformName = pluginIdentifier
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor)
    } else {
      this.emit(InternalAPIEvent.REGISTER_PLATFORM, platformName, constructor!, pluginIdentifier)
    }
  }

  publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
    if (!PluginManager.isQualifiedPluginIdentifier(pluginIdentifier)) {
      log.info(`One of your plugins incorrectly registered an external accessory using the platform name (${pluginIdentifier}) and not the plugin identifier. Please report this to the developer!`)
    }

    accessories.forEach((accessory) => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new TypeError(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`)
      }

      accessory._associatedPlugin = pluginIdentifier
    })

    this.emit(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories)
  }

  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach((accessory) => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`)
      }

      accessory._associatedPlugin = pluginIdentifier
      accessory._associatedPlatform = platformName
    })

    this.emit(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories)
  }

  updatePlatformAccessories(accessories: PlatformAccessory[]): void {
    this.emit(InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories)
  }

  unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    accessories.forEach((accessory) => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to unregister an accessory that isn't PlatformAccessory!`)
      }
    })

    this.emit(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories)
  }

  /**
   * Check if Matter is available in this version of Homebridge
   * @returns true if Homebridge version satisfies >= 2.0.0-alpha.0
   */
  isMatterAvailable(): boolean {
    return semver.gte(this.serverVersion, '2.0.0-alpha.0')
  }

  /**
   * Check if Matter is enabled for this bridge
   * For main bridge: returns true if Matter is enabled in `bridge.matter` config
   * For child bridge: returns true if Matter is enabled in the `_bridge.matter` config
   * @returns true if Matter is enabled
   */
  isMatterEnabled(): boolean {
    return this.matterEnabled
  }
}
