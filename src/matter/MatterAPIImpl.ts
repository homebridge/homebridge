/**
 * Matter API Implementation
 *
 * The object behind `api.matter`.
 *
 * This file imports matter.js at the top, so loading it loads all of
 * matter.js. The lazy part is one level up: `HomebridgeAPI.loadMatterAPI()`
 * imports this file, and Server / ChildBridgeFork call that only for a bridge
 * whose own config uses Matter, before its plugins start. A bridge without
 * Matter never loads this file, and `api.matter` stays undefined there.
 */

import type { EndpointType } from '@matter/main'

import type { HomebridgeAPI, MatterAPI, MatterWorkTracker, PlatformName, PluginIdentifier } from '../api.js'
import type { BaseMatterManager } from './BaseMatterManager.js'
import type { InternalMatterAccessory, MatterAccessory, MatterServer } from './index.js'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { clusterNames, clusters, deviceRequirements, deviceTypes, MatterStatus, MatterTypes } from './index.js'
import { SwitchAPIImpl } from './SwitchAPI.js'

/**
 * Type helper to access internal properties on HomebridgeAPI
 * We use Record to avoid conflicts with private properties
 */
interface HomebridgeAPIInternals {
  _pendingExternalRegistrations?: Map<string, (value: void) => void>
  _matterManager?: BaseMatterManager
  _matterServer?: MatterServer | null
}

const log = Logger.withPrefix('Matter/API')

/** The cluster names Homebridge knows, built once: the check runs on every state update and read */
const VALID_CLUSTER_NAMES = new Set<string>(Object.values(clusterNames))

// ============================================================================
// External Device Type Configuration
// ============================================================================

/**
 * Device types that require dedicated external bridges.
 *
 * Some Matter devices (like RoboticVacuumCleaner) are complex and must be
 * published on their own dedicated bridge, not added to the main/child bridge.
 */
const EXTERNAL_DEVICE_TYPES: EndpointType[] = [
  deviceTypes.RoboticVacuumCleaner,
]

/**
 * Emit a Matter event and wait for the work its listeners report through the
 * tracker. A listener's failure is already logged by the listener, so it is not
 * rethrown here - the call keeps resolving the way it always has, only later.
 * @param emit - emits the event, passing the tracker as its last argument
 */
async function emitAndWait(emit: (track: MatterWorkTracker) => void): Promise<void> {
  const work: Promise<void>[] = []
  emit(promise => work.push(promise))
  await Promise.allSettled(work)
}

/**
 * Check if a device type requires external bridge publishing.
 * Compares device type IDs for exact match against the external device types list.
 */
function requiresExternalBridge(deviceType: EndpointType): boolean {
  return EXTERNAL_DEVICE_TYPES.some(externalType => externalType.deviceType === deviceType.deviceType)
}

// ============================================================================

/**
 * Validation error for Matter accessories
 */
class MatterAccessoryValidationError extends Error {
  constructor(message: string, public readonly accessory?: MatterAccessory) {
    super(message)
    this.name = 'MatterAccessoryValidationError'
  }
}

/**
 * Implementation of the Matter API
 *
 * This facade provides Matter protocol support through the Homebridge API.
 * It is only constructed for a bridge that uses Matter (see the top of this file).
 *
 * Features:
 * - Validates accessories before registration
 * - Handles both bridge accessories and external standalone devices
 * - Provides detailed error messages for debugging
 * - Delegates to HomebridgeAPI for event emission and server access
 */
export class MatterAPIImpl implements MatterAPI {
  readonly switch: SwitchAPIImpl

  /** Unknown cluster names already warned about */
  private readonly warnedClusterNames = new Set<string>()

  constructor(private readonly api: HomebridgeAPI) {
    this.switch = new SwitchAPIImpl(this)
  }

  /**
   * Validate a Matter accessory has required fields
   * @throws MatterAccessoryValidationError if validation fails
   */
  private validateAccessory(accessory: MatterAccessory, context: string): void {
    if (!accessory.UUID) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory missing required 'UUID' field`,
        accessory,
      )
    }

    if (!accessory.displayName) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.UUID}' missing required 'displayName' field`,
        accessory,
      )
    }

    if (!accessory.deviceType) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'deviceType' field`,
        accessory,
      )
    }

    if (!accessory.manufacturer) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'manufacturer' field`,
        accessory,
      )
    }

    if (!accessory.model) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'model' field`,
        accessory,
      )
    }

    if (!accessory.serialNumber) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.UUID}) missing required 'serialNumber' field`,
        accessory,
      )
    }
  }

  /**
   * Validate an array of accessories, logging errors for invalid ones
   * @returns Array of valid accessories only
   */
  private validateAccessories(accessories: MatterAccessory[], context: string): MatterAccessory[] {
    const validAccessories: MatterAccessory[] = []

    for (const accessory of accessories) {
      try {
        this.validateAccessory(accessory, context)
        validAccessories.push(accessory)
      } catch (error) {
        if (error instanceof MatterAccessoryValidationError) {
          log.error(error.message)
          log.error('This accessory will not be registered. Please fix the issue in your plugin.')
        } else {
          log.error(`${context}: Unexpected error validating accessory:`, error)
        }
      }
    }

    return validAccessories
  }

  /**
   * Warn about a cluster name Homebridge does not know. It does not block:
   * the name may still be right for a cluster a plugin composed itself.
   *
   * Once per name. This runs on every state update and every state read, and
   * a plugin that polls with an unknown name filled the log with the same
   * line, each one listing every valid name.
   *
   * @param clusterName - Cluster name to validate
   * @param context - Context string for error messages
   */
  private validateClusterName(clusterName: string, context: string): void {
    if (VALID_CLUSTER_NAMES.has(clusterName) || this.warnedClusterNames.has(clusterName)) {
      return
    }
    this.warnedClusterNames.add(clusterName)
    log.warn(
      `${context}: Unknown cluster name '${clusterName}'. This might cause issues (this is logged once for each name). `
      + `Valid clusters: ${[...VALID_CLUSTER_NAMES].join(', ')}`,
    )
  }

  /**
   * UUID generator (alias of api.hap.uuid for convenience)
   */
  get uuid() {
    return this.api.hap.uuid
  }

  /**
   * Matter device types for creating accessories
   */
  get deviceTypes() {
    return deviceTypes
  }

  /**
   * The matter.js requirements behind the feature-gated device types, for
   * composing a cluster yourself when the detected features are not what the
   * device actually does
   */
  get deviceRequirements() {
    return deviceRequirements
  }

  /**
   * Matter clusters - Direct access to Matter.js cluster definitions
   */
  get clusters() {
    return clusters
  }

  /**
   * Matter cluster names for type safety and autocomplete
   */
  get clusterNames() {
    return clusterNames
  }

  /**
   * Matter types - Access to Matter.js cluster type definitions and enums
   */
  get types() {
    return MatterTypes
  }

  /**
   * Matter protocol status errors for handlers
   *
   * Exposed here so plugins never need a runtime import of the `homebridge`
   * package, which cannot resolve on installs that keep Homebridge in a
   * separate node_modules tree.
   */
  get status() {
    return MatterStatus
  }

  /**
   * Guard the register/update/publish entry points. Two conditions must hold
   * before these methods may emit, or the emitted event has no listener:
   * bridged registrations are silently dropped, and external ones await a
   * resolver that never fires (hanging forever).
   *
   * 1. The Matter manager must be attached. That happens when the bridge sets
   *    up Matter, which is after the plugin initialisers have run (and, on the
   *    main bridge, before the platforms are constructed), so a call from a
   *    plugin's initialiser function is too early.
   * 2. The manager must have active Matter on THIS bridge, or a call would
   *    drop/hang with no listener attached. `api.matter` is only loaded for a
   *    bridge whose own config uses Matter, so this is a safety net rather
   *    than a path plugins are expected to reach.
   *
   * @param cannotAction - leading clause, e.g. `${plugin}: Cannot register Matter accessories`
   */
  private assertMatterReady(cannotAction: string): void {
    const matterManager = (this.api as unknown as HomebridgeAPIInternals)._matterManager
    if (!matterManager) {
      throw new Error(
        `${cannotAction} before Homebridge has finished launching. Do this from your platform's 'didFinishLaunching' event, not during plugin initialisation.`,
      )
    }
    if (!matterManager.hasActiveMatter()) {
      throw new Error(
        `${cannotAction}: Matter is not enabled for this bridge. It has no active 'matter' configuration to register against (or Homebridge is shutting down).`,
      )
    }
  }

  /**
   * Register Matter platform accessories
   * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that need dedicated bridges
   * Validates accessories before registration
   * Returns a promise that resolves when all accessories are fully registered
   */
  async registerPlatformAccessories(
    pluginIdentifier: PluginIdentifier,
    platformName: PlatformName,
    accessories: MatterAccessory[],
  ): Promise<void> {
    if (accessories.length === 0) {
      log.warn(`${pluginIdentifier}: Attempted to register 0 Matter accessories`)
      return
    }

    this.assertMatterReady(`${pluginIdentifier}: Cannot register Matter accessories`)

    // Validate all accessories before registration
    const validAccessories = this.validateAccessories(
      accessories,
      `registerPlatformAccessories (${pluginIdentifier}/${platformName})`,
    )

    if (validAccessories.length === 0) {
      log.error(`${pluginIdentifier}: All ${accessories.length} Matter accessories failed validation`)
      return
    }

    if (validAccessories.length < accessories.length) {
      log.warn(
        `${pluginIdentifier}: ${accessories.length - validAccessories.length} of ${accessories.length} Matter accessories failed validation`,
      )
    }

    // Split accessories into normal (bridge) and external (standalone) based on device type
    const normalAccessories: MatterAccessory[] = []
    const externalAccessories: MatterAccessory[] = []

    for (const accessory of validAccessories) {
      if (requiresExternalBridge(accessory.deviceType)) {
        externalAccessories.push(accessory)
      } else {
        normalAccessories.push(accessory)
      }
    }

    // Handle normal accessories (added to bridge)
    if (normalAccessories.length > 0) {
      // The bridged register event is emitted fire-and-forget, so if the bridge
      // Matter server node is not running yet the registration is silently
      // dropped (the downstream "Matter server not started" error is only
      // logged) and this call would still resolve. Reject instead, so the plugin
      // can tell the accessory was not registered. External accessories are
      // unaffected — they run on their own dedicated server and already await a
      // completion resolver.
      const matterManager = (this.api as unknown as HomebridgeAPIInternals)._matterManager
      const startFailure = matterManager?.getBridgeStartFailure()
      if (startFailure !== undefined) {
        throw new Error(
          `${pluginIdentifier}: Cannot register Matter accessories — the Matter server for this bridge failed to start (${startFailure}). See the error at start-up in the log. HomeKit accessories are not affected.`,
        )
      }
      if (matterManager && matterManager.isBridgeServerStarting()) {
        throw new Error(
          `${pluginIdentifier}: Cannot register Matter accessories yet — the Matter server for this bridge is still starting. Register from your platform's 'didFinishLaunching' event; if you already do, this is transient and the accessories are restored from cache on the next start.`,
        )
      }

      // Add plugin/platform association
      normalAccessories.forEach((accessory) => {
        const internal = accessory as InternalMatterAccessory
        internal._associatedPlugin = pluginIdentifier
        internal._associatedPlatform = platformName
      })

      log.debug(
        `${pluginIdentifier}: Registering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1
          ? 'y'
          : 'ies'} for platform '${platformName}'`,
      )

      // Wait for the bridge to finish, so an updateAccessoryState() straight
      // after reaches an endpoint that exists (#4033)
      await emitAndWait((track) => {
        this.api.emit(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier, platformName, normalAccessories, track)
      })
    }

    // Handle external accessories (standalone bridges)
    if (externalAccessories.length > 0) {
      // Add plugin association (no platform for external)
      externalAccessories.forEach((accessory) => {
        const internal = accessory as InternalMatterAccessory
        internal._associatedPlugin = pluginIdentifier
      })

      log.debug(
        `${pluginIdentifier}: Publishing ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1
          ? 'y'
          : 'ies'} (${externalAccessories.map(a => a.displayName).join(', ')})`,
      )

      // Create a promise to track when external publishing completes
      const registrationId = `${pluginIdentifier}-${Date.now()}-${Math.random()}`
      const registrationPromise = new Promise<void>((resolve) => {
        // Store the resolve function so it can be called when publishing completes
        // Access internal properties through type assertion
        const internalApi = this.api as unknown as HomebridgeAPIInternals
        if (!internalApi._pendingExternalRegistrations) {
          internalApi._pendingExternalRegistrations = new Map()
        }
        internalApi._pendingExternalRegistrations.set(registrationId, resolve)
      })

      // Emit event with registration ID
      this.api.emit(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, externalAccessories, registrationId)

      // Wait for external publishing to complete
      await registrationPromise
    }
  }

  /**
   * Update Matter platform accessories in the cache
   * Similar to api.updatePlatformAccessories() for HAP accessories
   */
  async updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void> {
    if (accessories.length === 0) {
      log.warn('Attempted to update 0 Matter platform accessories')
      return
    }

    this.assertMatterReady('Cannot update Matter accessories')

    log.debug(`Updating ${accessories.length} Matter platform accessor${accessories.length === 1
      ? 'y'
      : 'ies'} in cache`)

    // Wait for the bridge to finish, as register and unregister do, so the
    // update is in place when the plugin's await returns
    await emitAndWait((track) => {
      this.api.emit(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, accessories, track)
    })
  }

  /**
   * Unregister Matter platform accessories
   * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that have dedicated bridges
   */
  async unregisterPlatformAccessories(
    pluginIdentifier: PluginIdentifier,
    platformName: PlatformName,
    accessories: MatterAccessory[],
  ): Promise<void> {
    if (accessories.length === 0) {
      log.warn(`${pluginIdentifier}: Attempted to unregister 0 Matter accessories`)
      return
    }

    this.assertMatterReady(`${pluginIdentifier}: Cannot unregister Matter accessories`)

    // Split accessories into normal (bridge) and external (standalone) by where
    // each one lives. Only the UUID is needed for that, as for a HAP accessory:
    // the device type is not there on a `{ UUID }` object, and it is a plain
    // copy on the object a plugin is given in configureMatterAccessory.
    const matterManager = (this.api as unknown as HomebridgeAPIInternals)._matterManager
    const normalAccessories: MatterAccessory[] = []
    const externalAccessories: MatterAccessory[] = []

    for (const accessory of accessories) {
      const isExternal = matterManager?.getExternalServer(accessory.UUID) !== undefined
        || (accessory.deviceType?.deviceType !== undefined && requiresExternalBridge(accessory.deviceType))
      if (isExternal) {
        externalAccessories.push(accessory)
      } else {
        normalAccessories.push(accessory)
      }
    }

    // Handle normal accessories (on bridge)
    if (normalAccessories.length > 0) {
      log.debug(
        `${pluginIdentifier}: Unregistering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1
          ? 'y'
          : 'ies'} from platform '${platformName}'`,
      )
      // Wait for the bridge to finish, so a register straight after does not
      // overlap it and contend for the parts list lock (#4033)
      await emitAndWait((track) => {
        this.api.emit(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier, platformName, normalAccessories, track)
      })
    }

    // Handle external accessories (standalone bridges)
    if (externalAccessories.length > 0) {
      log.debug(
        `${pluginIdentifier}: Unregistering ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1
          ? 'y'
          : 'ies'} (${externalAccessories.map(a => a.displayName ?? a.UUID).join(', ')})`,
      )
      await emitAndWait((track) => {
        this.api.emit(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, externalAccessories, track)
      })
    }
  }

  /**
   * Update a Matter accessory's cluster state
   * Validates inputs before updating
   */
  async updateAccessoryState(
    uuid: string,
    cluster: string,
    attributes: Record<string, unknown>,
    partId?: string,
  ): Promise<void> {
    // Validate inputs
    if (!uuid) {
      log.error('updateAccessoryState: uuid parameter is required')
      return
    }

    if (!cluster) {
      log.error(`updateAccessoryState: cluster parameter is required for accessory ${uuid}`)
      return
    }

    if (!attributes || Object.keys(attributes).length === 0) {
      log.warn(`updateAccessoryState: No attributes provided for accessory ${uuid}, cluster ${cluster}`)
      return
    }

    // Validate cluster name (warning only, don't block)
    this.validateClusterName(cluster, `updateAccessoryState (${uuid})`)

    this.assertMatterReady(`Cannot update Matter accessory ${uuid}`)

    log.debug(
      `Updating Matter accessory state: uuid=${uuid}, cluster=${cluster}, attributes=${Object.keys(attributes).join(', ')}${partId
        ? `, partId=${partId}`
        : ''}`,
    )

    // Wait for the bridge to finish, so a read straight after the plugin's
    // await sees the new value. A failure is logged by the bridge, not thrown.
    await emitAndWait((track) => {
      this.api.emit(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, uuid, cluster, attributes, partId, track)
    })
  }

  /**
   * Get a Matter accessory's current cluster state
   * Checks both external servers and main bridge server
   * Validates inputs before retrieving state
   */
  async getAccessoryState(
    uuid: string,
    cluster: string,
    partId?: string,
  ): Promise<Record<string, unknown> | undefined> {
    // Validate inputs
    if (!uuid) {
      log.error('getAccessoryState: uuid parameter is required')
      return undefined
    }

    if (!cluster) {
      log.error(`getAccessoryState: cluster parameter is required for accessory ${uuid}`)
      return undefined
    }

    // Validate cluster name (warning only, don't block)
    this.validateClusterName(cluster, `getAccessoryState (${uuid})`)

    log.debug(
      `Getting Matter accessory state: uuid=${uuid}, cluster=${cluster}${partId
        ? `, partId=${partId}`
        : ''}`,
    )

    // Check external servers first (for accessories like robot vacuums)
    const internalApi = this.api as unknown as HomebridgeAPIInternals
    const matterManager = internalApi._matterManager
    if (matterManager) {
      const externalServer = matterManager.getExternalServer(uuid)
      if (externalServer) {
        return externalServer.getAccessoryState(uuid, cluster, partId)
      }
    }

    // Otherwise, try the main bridge server
    const matterServer = internalApi._matterServer
    if (!matterServer) {
      log.debug(`getAccessoryState: Matter server not available for accessory ${uuid}`)
      return undefined
    }

    return matterServer.getAccessoryState(uuid, cluster, partId)
  }
}
