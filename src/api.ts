import type { Controller, Service } from '@homebridge/hap-nodejs'

import type { AccessoryConfig, PlatformConfig } from './bridgeService.js'
import type { Logging } from './logger.js'
import type { BaseMatterManager } from './matter/BaseMatterManager.js'
import type {
  clusterNames,
  clusters,
  ClusterStateMap,
  deviceRequirements,
  deviceTypes,
  MatterAccessory,
  MatterServer,
  MatterStatus,
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

/**
 * The two kinds of plugin: an accessory plugin or a platform plugin.
 *
 * This is a `const enum`. A plugin built with plain `tsc` gets the value written into its code at
 * compile time. A plugin built with `isolatedModules` or `verbatimModuleSyntax` (esbuild, tsx, swc,
 * Vite) can not use it: TypeScript reports TS2748 ("Cannot access ambient const enums"). Write the text
 * value instead: `'accessory'` or `'platform'`.
 * It stays a `const enum` for now: as a normal enum, every plugin built with plain `tsc` would start
 * to import the `homebridge` package at run time.
 */
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
   * This is the Matter equivalent of configureAccessory for HAP accessories, with these differences:
   * - The object is a copy of the cached data, not the live accessory. Its `deviceType` is only
   *   the cached name (`{ name, clusterFeatures }`), not a real device type, and its `parts` have
   *   no handlers. Read `UUID`, `displayName`, `context` and the device information from it, and
   *   build a new accessory to register. Do not pass this object to `registerPlatformAccessories()`.
   *   It is fine to pass it to `updatePlatformAccessories()` and `unregisterPlatformAccessories()`.
   * - Every accessory must be registered again at every start (see `registerPlatformAccessories()`).
   * - It is not called for an external accessory (a robot vacuum cleaner): only the accessories
   *   of the bridge are cached. Nothing is kept for an external accessory but its pairing.
   * - `context`: Homebridge keeps the cached context when the accessory is registered again
   *   with another structure (device type, parts, features), or when it was not rebuilt at
   *   start. When the registration matches the restored accessory, the `context` of the
   *   registered object is used. To be sure a value is kept, copy the cached `context` into
   *   the accessory you register.
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

/**
 * The events a plugin can listen for on the {@link API} object.
 *
 * This is a `const enum`. A plugin built with plain `tsc` gets the value written into its code at
 * compile time. A plugin built with `isolatedModules` or `verbatimModuleSyntax` (esbuild, tsx, swc,
 * Vite) can not use it: TypeScript reports TS2748 ("Cannot access ambient const enums"). Write the text
 * value instead, which is typed the same: `api.on('didFinishLaunching', ...)`, `api.on('shutdown', ...)`.
 * It stays a `const enum` for now: as a normal enum, every plugin built with plain `tsc` would start
 * to import the `homebridge` package at run time.
 */
// eslint-disable-next-line no-restricted-syntax
export const enum APIEvent {
  /**
   * Event is fired once homebridge has finished with booting up and initializing all components and plugins.
   * When this event is fired it is possible that the Bridge accessory isn't published yet, if homebridge still needs
   * to wait for some {@link StaticPlatformPlugin | StaticPlatformPlugins} to finish accessory creation.
   */
  DID_FINISH_LAUNCHING = 'didFinishLaunching',

  /**
   * This event is fired when homebridge gets shutdown. This could be a regular shutdown or an unexpected crash.
   * At this stage all Accessories are already unpublished and all PlatformAccessories are already saved to disk!
   *
   * That is true for HomeKit only. The Matter servers are stopped, and the Matter accessory cache is
   * saved, after this event: Matter accessories are still published while the listeners run.
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
 * Passed with the Matter register and unregister events. The listener hands it
 * the promise for its work, so the plugin-facing call can wait for the bridge
 * to finish rather than resolving as soon as the event is emitted (#4033).
 * @internal
 */
export type MatterWorkTracker = (work: Promise<void>) => void

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
 * How this differs from the HomeKit side of the API:
 * - **Platform plugins only.** Registering and restoring Matter accessories needs
 *   a dynamic platform (`api.registerPlatform()`). An accessory plugin
 *   (`api.registerAccessory()`) has no way to expose a Matter accessory, and a
 *   `matter` block on an accessory child bridge is ignored with a warning.
 * - **The accessory is a plain object, and Homebridge keeps its own copy.**
 *   A `PlatformAccessory` is live: change it and HomeKit sees it. A
 *   `MatterAccessory` is copied at registration, so changing your object
 *   afterwards does nothing. Send state with `updateAccessoryState()`, and a new
 *   name, device information or `context` with `updatePlatformAccessories()`.
 * - **There is no `publishExternalAccessories()` for Matter.** Homebridge
 *   decides from the device type: a `RoboticVacuumCleaner` is published on its
 *   own (its own pairing code), every other type goes on the bridge. A plugin
 *   can not choose either way.
 * - **There is no general "a value was written" handler** like HAP's `onSet`.
 *   See `MatterAccessory.handlers` for what reaches a plugin.
 * - **Never depend on the `@matter/*` packages in a plugin.** Use what
 *   `api.matter` carries (`deviceTypes`, `deviceRequirements`, `clusters`,
 *   `status`). A second copy of matter.js in the process has its own classes,
 *   so a status error or device type built from it is not recognised by
 *   Homebridge's copy, and it costs about 150 MB of memory.
 *
 * @example
 * ```typescript
 * // Defensive pattern (recommended for plugins that work with or without Matter).
 * // The Matter methods return promises, and a registration is rejected when it can
 * // not be done (for example when the Matter server of the bridge did not start).
 * // Always await them and catch the error: a rejection nobody handles ends Homebridge.
 * try {
 *   await api.matter?.registerPlatformAccessories('homebridge-example', 'Example', [{
 *     UUID: api.hap.uuid.generate('my-light'),
 *     displayName: 'Living Room Light',
 *     deviceType: api.matter!.deviceTypes.OnOffLight,
 *     manufacturer: 'Example',
 *     model: 'Example Light',
 *     serialNumber: 'EX-001',
 *     context: {},
 *     clusters: { onOff: { onOff: false } },
 *   }])
 * } catch (error) {
 *   log.error('Could not register the Matter accessory:', error)
 * }
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
   * const UUID = api.matter?.uuid.generate('my-light-unique-id')
   * await api.matter?.registerPlatformAccessories('homebridge-example', 'Example', [{
   *   UUID,
   *   displayName: 'Living Room Light',
   *   // ...
   * }])
   * ```
   */
  readonly uuid: HAP['uuid']

  /**
   * Matter device types for creating accessories.
   * Maps friendly names to Matter.js device types, including stateless controller types like `GenericSwitch`.
   *
   * Most names are the Matter name of the device type (`OnOffLight`,
   * `DimmableLight`, `WindowCovering`). Some are friendlier names for a Matter
   * type that is called something else:
   *
   * | Name here | Matter device type |
   * |---|---|
   * | `OnOffSwitch` | On/Off Light Switch |
   * | `OnOffOutlet` | On/Off Plug-in Unit |
   * | `DimmableOutlet` | Dimmable Plug-in Unit |
   * | `MotionSensor` | Occupancy Sensor |
   * | `LeakSensor` | Water Leak Detector |
   * | `SmokeSensor` | Smoke CO Alarm |
   * | `MediaPlayer` | Basic Video Player |
   *
   * The raw matter.js device types are not on `api.matter`. Compose on top of
   * these with `.with(...)` and {@link deviceRequirements}.
   */
  readonly deviceTypes: typeof deviceTypes

  /**
   * The matter.js requirements behind the feature-gated device types, keyed to
   * match {@link deviceTypes}.
   *
   * Homebridge picks a feature set from the state an accessory declares, which
   * suits almost every device. Use these when it cannot: a thermostat that
   * declares both a heating and a cooling setpoint is given AutoMode too, so a
   * device that heats and cools but has no auto mode has to compose the cluster
   * itself. Homebridge leaves an already-composed cluster alone.
   *
   * @example
   * ```typescript
   * deviceType: api.matter.deviceTypes.Thermostat.with(
   *   api.matter.deviceRequirements.Thermostat.ThermostatServer.with('Heating', 'Cooling'),
   * )
   * ```
   *
   * @since 2.4.0
   */
  readonly deviceRequirements: typeof deviceRequirements

  /**
   * Matter clusters - Direct access to Matter.js cluster definitions
   * For advanced use cases requiring low-level cluster access
   *
   * This is the same object as {@link types}, under a second name. It holds
   * the clusters that have enums or feature names a plugin needs, which is
   * fewer than {@link clusterNames} lists.
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
   * The same object as {@link clusters}. This is the name to prefer for enums.
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
   * Matter protocol status errors for handlers.
   *
   * Throw one of these from a handler to send a specific Matter status code to
   * the controller instead of failing the endpoint. Prefer this over importing
   * `MatterStatus` from the `homebridge` package: a value import resolves the
   * package when the plugin file is loaded, which fails on installs that keep
   * Homebridge in a separate `node_modules` tree, taking the whole plugin down
   * with it. The `api` object a plugin already holds has no such problem.
   *
   * @example
   * ```typescript
   * handlers: {
   *   onOff: {
   *     on: async () => {
   *       if (deviceIsBusy) {
   *         throw new api.matter!.status.Busy('Device is processing another command')
   *       }
   *       // ... control device
   *     }
   *   }
   * }
   * ```
   *
   * @since 2.3.0
   */
  readonly status: typeof MatterStatus

  /**
   * Register Matter platform accessories
   *
   * Returns a promise that resolves when all accessories are fully registered and ready for state updates.
   * This is especially important for external accessories (like robot vacuums) which require additional setup time.
   *
   * Unlike HAP, register every accessory on every start, including the ones handed to
   * `configureMatterAccessory()` from the cache. Handlers are functions and cannot be cached,
   * so a restored accessory answers every command with a failure until it is registered again.
   *
   * When an accessory is restored from the cache, its cached state is kept: the `clusters`
   * values passed here are the starting state for a new accessory only. To set the current
   * state of a restored accessory, call `updateAccessoryState()` once this promise resolves (#4015).
   *
   * An accessory that can not be registered is logged and skipped, and the promise still
   * resolves (HAP throws for a bad accessory). That is so for one that fails the checks here
   * (`UUID`, `displayName`, `deviceType`, `manufacturer`, `model` and `serialNumber` are all
   * required, and none has a default as in HAP) and for one the bridge refuses (a UUID that is
   * already registered, a value Matter does not allow). The other accessories of the call are
   * registered. The promise is rejected only when nothing can be registered at all: when it is
   * called before Homebridge has finished launching, or when the Matter server of the bridge
   * did not start.
   *
   * A `RoboticVacuumCleaner` is not added to the bridge. It is published on its own, with its
   * own pairing code in the log, because controllers want it that way. There is no method to
   * ask for this for another device type, and none to keep a vacuum on the bridge.
   *
   * Use the names of a platform registered with `api.registerPlatform()`: a wrong
   * `platformName` works for this run, and at the next start the accessory is removed as an
   * orphan, as nothing can be found to hand it back to.
   *
   * @param pluginIdentifier - The plugin identifier (e.g., 'homebridge-example')
   * @param platformName - The platform name (e.g., 'ExamplePlatform')
   * @param accessories - Array of Matter accessories to register
   */
  registerPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[]) => Promise<void>

  /**
   * Update the name, device information and context of Matter platform accessories
   *
   * Use this to update accessory information without unregistering and re-registering.
   * This is useful when:
   * - Device name changes in the external system
   * - Firmware version gets updated
   * - Other metadata needs to be refreshed
   *
   * Similar to api.updatePlatformAccessories() for HAP accessories, with one difference:
   * Homebridge holds a copy of a Matter accessory, so a change to your own object reaches
   * Homebridge only through this call.
   *
   * Only these fields are taken from each object: `displayName`, `manufacturer`, `model`,
   * `serialNumber`, `firmwareRevision`, `hardwareRevision`, `softwareVersion` and `context`.
   * A field that is `undefined` is left as it is. They are saved to the cache and sent to
   * controllers at once (a controller may still keep the name its user gave the device).
   * Nothing else is read, so the device type, parts, handlers and cluster state can not be
   * changed this way: use `updateAccessoryState()` for state, and register the accessory
   * again for a new structure.
   *
   * An accessory that is not registered is skipped with a warning. The promise resolves when
   * the bridge has applied the update; a failure is logged, not thrown.
   *
   * @param accessories - Array of Matter accessories to update (each needs its `UUID`)
   *
   * @example
   * ```typescript
   * // Update the display name after it changed in the external system
   * const accessory = cachedAccessories.find(a => a.UUID === uuid)
   * if (accessory) {
   *   accessory.displayName = 'New Name from API'
   *   await api.matter?.updatePlatformAccessories([accessory])
   * }
   * ```
   */
  updatePlatformAccessories: (accessories: MatterAccessory[]) => Promise<void>

  /**
   * Unregister Matter platform accessories by UUID
   *
   * The accessory is taken off the bridge and out of the cache, and what the bridge stored
   * for it is erased. An accessory that is not registered is ignored without an error.
   *
   * This also works for an external accessory (a robot vacuum cleaner), which HAP can not
   * unregister. Its own Matter server is stopped and **its pairing is deleted**: registering
   * it again later starts a new device that has to be paired again. An external accessory a
   * plugin simply stops registering keeps its pairing data on disk.
   *
   * @param pluginIdentifier - The plugin identifier
   * @param platformName - The platform name
   * @param accessories - Array of Matter accessories to unregister (only `UUID` is required)
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
   * Similar to HAP's characteristic.updateValue(): the plugin's own handlers are not called for it.
   *
   * The promise resolves when the bridge has applied the update. A failure (an accessory
   * that is not registered, a value Matter does not allow) is logged, not thrown.
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
   *
   * @since 2.0.0
   */
  readonly switch: SwitchAPI
}

export interface API {
  /**
   * The homebridge API version as a floating point number.
   *
   * @deprecated This number has been `2.7` since Homebridge v1.3.0 (November 2020) and has not followed
   * the additions to the API since then, so it can not be used to find out what the API supports.
   * Use {@link versionGreaterOrEqual} (or {@link serverVersion}) instead. The value is kept as it is
   * for plugins that read it.
   * To test for one feature, pass the Homebridge version it arrived in to {@link versionGreaterOrEqual}
   * (the Matter members carry a `@since` tag), or test for the member itself.
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
   * await api.matter?.registerPlatformAccessories(...)   // defensive, no-ops when disabled
   * if (api.isMatterEnabled()) {
   *   await api.matter!.registerPlatformAccessories(...) // explicit guard
   * }
   * ```
   *
   * The Matter methods return promises. Await them inside a `try`/`catch`:
   * a rejection that nobody handles ends Homebridge.
   * ```typescript
   * try {
   *   await api.matter?.registerPlatformAccessories(...)
   * } catch (error) {
   *   log.error('Could not register the Matter accessories:', error)
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
   *  versionGreaterOrEqual("1.3.0-beta.8"); // will return true
   * ```
   *
   * The version must be a full semver version (`"2.5.0"`, `"v2.5.0"`, `"2.5.0-beta.1"`).
   * Anything else (`"2"`, `"2.5"`, `"abc"`, `undefined`) makes this method throw a `TypeError`.
   *
   * @param version - a full semver version
   * @throws TypeError when `version` is not a full semver version
   */
  versionGreaterOrEqual: (version: string) => boolean

  registerAccessory: ((accessoryName: AccessoryName, constructor: AccessoryPluginConstructor) => void) & ((pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor) => void)

  registerPlatform: (<Config extends PlatformConfig>(platformName: PlatformName, constructor: PlatformPluginConstructor<Config>) => void) & (<Config extends PlatformConfig>(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor<Config>) => void)
  registerPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]) => void
  updatePlatformAccessories: (accessories: PlatformAccessory[]) => void
  unregisterPlatformAccessories: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]) => void

  publishExternalAccessories: (pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]) => void

  /**
   * Check if HAP is enabled for this bridge (`bridge.hap` or `_bridge.hap`).
   * Enabled by default, and still true in externalsOnly mode, where the bridge
   * accessory is not published but external HAP accessories still are - the same
   * meaning as {@link isMatterEnabled}. False only when HAP is disabled outright.
   * Use {@link isHapExternalsOnly} to tell whether bridged accessories will show.
   * @returns true if HAP is in use on this bridge
   * @since 2.5.0
   */
  isHapEnabled: () => boolean

  /**
   * Check if this bridge is in HAP externalsOnly mode: the bridge accessory, and
   * so every bridged accessory, is not published, while external accessories are.
   * @returns true if only external HAP accessories publish from this bridge
   * @since 2.5.0
   */
  isHapExternalsOnly: () => boolean

  /**
   * Check if this version of Homebridge knows Matter at all.
   *
   * It only compares the version number. It does NOT mean Matter can be used
   * here: it is also true on a bridge with Matter switched off, and when
   * matter.js could not be loaded. To decide whether to use Matter, test
   * `api.matter` (or {@link isMatterEnabled}): the two always agree.
   *
   * The method does not exist on Homebridge 1.x, so a plugin that still
   * supports 1.x has to call it as `api.isMatterAvailable?.()`.
   *
   * @returns true if Homebridge version is >= 2.0.0-alpha.0
   * @since 2.0.0
   */
  isMatterAvailable: () => boolean

  /**
   * Check if Matter is enabled for this bridge
   * For main bridge: returns true if Matter is enabled in `bridge.matter` config
   * For child bridge: returns true if Matter is enabled in the _bridge.matter config
   * @returns true if Matter is enabled
   * @since 2.0.0
   */
  isMatterEnabled: () => boolean

  /**
   * Check if this bridge is in Matter externalsOnly mode: the bridge node, and so
   * every bridged accessory, is not published, while external accessories are.
   * Only ever true when {@link isMatterEnabled} is.
   * @returns true if only external Matter accessories publish from this bridge
   * @since 2.5.0
   */
  isMatterExternalsOnly: () => boolean

  /**
   * Listen for an event of Homebridge: `didFinishLaunching` or `shutdown` (see {@link APIEvent}).
   */
  on: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this)

  /**
   * Like {@link on}, but the listener is called at most once.
   */
  once: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this)

  /**
   * Remove a listener that was added with {@link on} or {@link once}.
   */
  off: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this)

  /**
   * The same as {@link off}.
   */
  removeListener: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this)
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export declare interface HomebridgeAPI {
  on: ((event: 'didFinishLaunching', listener: () => void) => this) & ((event: 'shutdown', listener: () => void) => this) & ((event: InternalAPIEvent.REGISTER_ACCESSORY, listener: (accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => void) => this) & ((event: InternalAPIEvent.REGISTER_PLATFORM, listener: (platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => void) => this) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, listener: (accessories: PlatformAccessory[]) => void) => this) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, listener: (accessories: MatterAccessory[], registrationId: string) => void) => this) & ((event: InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, listener: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[], track?: MatterWorkTracker) => void) => this) & ((event: InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, listener: (accessories: MatterAccessory[], track?: MatterWorkTracker) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, listener: (pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[], track?: MatterWorkTracker) => void) => this) & ((event: InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, listener: (accessories: MatterAccessory[], track?: MatterWorkTracker) => void) => this) & ((event: InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, listener: (uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string, track?: MatterWorkTracker) => void) => this)

  emit: ((event: 'didFinishLaunching') => boolean) & ((event: 'shutdown') => boolean) & ((event: InternalAPIEvent.REGISTER_ACCESSORY, accessoryName: AccessoryName, accessoryConstructor: AccessoryPluginConstructor, pluginIdentifier?: PluginIdentifier) => boolean) & ((event: InternalAPIEvent.REGISTER_PLATFORM, platformName: PlatformName, platformConstructor: PlatformPluginConstructor, pluginIdentifier?: PluginIdentifier) => boolean) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.UPDATE_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, accessories: PlatformAccessory[]) => boolean) & ((event: InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, accessories: MatterAccessory[], registrationId: string) => boolean) & ((event: InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[], track?: MatterWorkTracker) => boolean) & ((event: InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, accessories: MatterAccessory[], track?: MatterWorkTracker) => boolean) & ((event: InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: MatterAccessory[], track?: MatterWorkTracker) => boolean) & ((event: InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, accessories: MatterAccessory[], track?: MatterWorkTracker) => boolean) & ((event: InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string, track?: MatterWorkTracker) => boolean)
}

// eslint-disable-next-line ts/no-unsafe-declaration-merging
export class HomebridgeAPI extends EventEmitter implements API {
  /**
   * @deprecated Fixed at `2.7` since Homebridge v1.3.0: it tells a plugin nothing. See {@link API.version}.
   */
  public readonly version = 2.7 // homebridge API version (kept at this value on purpose)
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
  private matterExternalsOnly = false

  // HAP is enabled by default; startup supplies the bridge-specific state.
  private hapEnabled = true
  private hapExternalsOnly = false

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
        // Before matter.js itself is loaded: it reads these switches once, then
        const { configureMatterJsProcess } = await import('./matter/processConfig.js')
        await configureMatterJsProcess()
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

  /**
   * Load the Matter API, and say whether Matter can be used in this run.
   *
   * matter.js may fail to load at all (a package the installer left out, a
   * Node.js version one of its packages does not accept). That must not stop
   * a bridge that also serves HomeKit: the failure is logged once, Matter
   * stays off (`api.matter` is undefined, `isMatterEnabled()` is false) and
   * the caller carries on without it.
   *
   * @internal
   */
  async tryLoadMatterAPI(): Promise<boolean> {
    try {
      await this.loadMatterAPI()
      return true
    } catch (error: unknown) {
      log.error('Matter could not be loaded, so Matter is switched off for this run. HomeKit is not affected.', error)
      return false
    }
  }

  constructor() {
    super()
    // Every platform adds its own `didFinishLaunching` (and often `shutdown`) listener, so a bridge
    // with 11 or more platforms went past Node's default of 10 listeners per event and Node printed a
    // "possible EventEmitter memory leak" warning for something that is not a leak.
    // `Infinity` (not `0`) so the `+ 1` / `- 1` a child bridge does on this limit keeps it unlimited.
    this.setMaxListeners(Number.POSITIVE_INFINITY)
  }

  /**
   * Set bridge-specific HAP enablement before plugin initialization.
   * @internal
   */
  _setHapEnabled(enabled: boolean, externalsOnly = false): void {
    this.hapEnabled = enabled
    this.hapExternalsOnly = externalsOnly
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
   * Set whether this bridge's Matter config is externalsOnly, before plugin
   * initialization. Only reported while Matter is enabled.
   * @internal
   */
  _setMatterExternalsOnly(externalsOnly: boolean): void {
    this.matterExternalsOnly = externalsOnly
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
   * Internal method to remember the promise of an external accessory registration
   * Called by MatterAPIImpl before it asks the manager to publish the accessories
   * @internal
   */
  _addPendingExternalRegistration(registrationId: string, resolve: () => void): void {
    this._pendingExternalRegistrations.set(registrationId, resolve)
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
    // A platform that only does Matter has configureMatterAccessory and no
    // configureAccessory. It is a dynamic platform too: without this its
    // cached Matter accessories had no platform to go back to, and were
    // removed as orphans at every start. A static platform stays static.
    return 'configureAccessory' in platformPlugin
      || ('configureMatterAccessory' in platformPlugin && !HomebridgeAPI.isStaticPlatformPlugin(platformPlugin))
  }

  public static isStaticPlatformPlugin(platformPlugin: PlatformPlugin): platformPlugin is StaticPlatformPlugin {
    return 'accessories' in platformPlugin
  }

  signalFinished(): void {
    this.emit(APIEvent.DID_FINISH_LAUNCHING)
  }

  signalShutdown(): void {
    // Each listener is called on its own. With a plain emit, the first plugin
    // whose shutdown listener throws stopped every later listener (the other
    // plugins, and Homebridge's own) and the rest of the teardown with it.
    for (const listener of this.rawListeners(APIEvent.SHUTDOWN)) {
      try {
        const result: unknown = listener.call(this)
        if (result instanceof Promise) {
          result.catch((error: unknown) => log.error('A shutdown listener failed:', error))
        }
      } catch (error: unknown) {
        log.error('A shutdown listener failed:', error)
      }
    }
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

    // check all of them before changing any: a bad one must not leave the others half registered
    accessories.forEach((accessory) => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new TypeError(`${pluginIdentifier} attempt to register an accessory that isn't PlatformAccessory!`)
      }
    })

    accessories.forEach((accessory) => {
      accessory._associatedPlugin = pluginIdentifier
    })

    this.emit(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, accessories)
  }

  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
    // check all of them before changing any: a bad one must not leave the others half registered
    accessories.forEach((accessory) => {
      // noinspection SuspiciousTypeOfGuard
      if (!(accessory instanceof PlatformAccessory)) {
        throw new TypeError(`${pluginIdentifier} - ${platformName} attempt to register an accessory that isn't PlatformAccessory!`)
      }
    })

    accessories.forEach((accessory) => {
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
   * @see API.isHapEnabled
   */
  isHapEnabled(): boolean {
    return this.hapEnabled
  }

  /**
   * @see API.isHapExternalsOnly
   */
  isHapExternalsOnly(): boolean {
    return this.hapExternalsOnly
  }

  /**
   * Check if Matter is available in this version of Homebridge (always true on v2)
   * @see API.isMatterAvailable
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

  /**
   * @see API.isMatterExternalsOnly
   */
  isMatterExternalsOnly(): boolean {
    return this.matterEnabled && this.matterExternalsOnly
  }
}
