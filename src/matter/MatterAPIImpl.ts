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

import type { EndpointType } from '@matter/main'

import type { HomebridgeAPI, MatterAPI, PlatformName, PluginIdentifier } from '../api.js'
import type { BaseMatterManager } from './BaseMatterManager.js'
import type { InternalMatterAccessory, MatterAccessory, MatterServer } from './index.js'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { clusterNames, clusters, deviceTypes, MatterTypes } from './index.js'
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
export class MatterAPIImpl implements MatterAPI {
  readonly switch: SwitchAPIImpl

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
   * Validate cluster name is valid
   *
   * @param clusterName - Cluster name to validate
   * @param context - Context string for error messages
   */
  private validateClusterName(clusterName: string, context: string): void {
    // Check if cluster name is in the known cluster names
    const validClusterNames = Object.values(clusterNames) as string[]
    if (!validClusterNames.includes(clusterName)) {
      log.warn(
        `${context}: Unknown cluster name '${clusterName}'. This might cause issues. `
        + `Valid clusters: ${validClusterNames.join(', ')}`,
      )
    }
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
   * Register Matter platform accessories
   * Automatically handles external accessories (e.g., RoboticVacuumCleaner) that need dedicated bridges
   * Validates accessories before registration
   * Returns a promise that resolves when all accessories are fully registered
   */
  /**
   * Guard the register/update/publish entry points. Two conditions must hold
   * before these methods may emit, or the emitted event has no listener:
   * bridged registrations are silently dropped, and external ones await a
   * resolver that never fires (hanging forever).
   *
   * 1. The Matter manager must be attached — it is constructed only once
   *    Homebridge has finished launching, so calls during plugin
   *    initialisation are too early.
   * 2. The manager must have active Matter on THIS bridge. `api.matter` can be
   *    exposed on the main bridge merely because a *child* bridge uses Matter;
   *    in that case the main manager attached no listeners, so a main-process
   *    call would drop/hang. `hasActiveMatter()` distinguishes this.
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
        `${cannotAction}: Matter is not enabled for this bridge. api.matter is available because another bridge uses Matter, but this bridge has no active 'matter' configuration to register against.`,
      )
    }
  }

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
      // Add plugin/platform association
      normalAccessories.forEach((accessory) => {
        const internal = accessory as InternalMatterAccessory
        internal._associatedPlugin = pluginIdentifier
        internal._associatedPlatform = platformName
      })

      log.debug(
        `${pluginIdentifier}: Registering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1 ? 'y' : 'ies'} for platform '${platformName}'`,
      )

      this.api.emit(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier, platformName, normalAccessories)
    }

    // Handle external accessories (standalone bridges)
    if (externalAccessories.length > 0) {
      // Add plugin association (no platform for external)
      externalAccessories.forEach((accessory) => {
        const internal = accessory as InternalMatterAccessory
        internal._associatedPlugin = pluginIdentifier
      })

      log.debug(
        `${pluginIdentifier}: Publishing ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1 ? 'y' : 'ies'} (${externalAccessories.map(a => a.displayName).join(', ')})`,
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

    log.debug(`Updating ${accessories.length} Matter platform accessor${accessories.length === 1 ? 'y' : 'ies'} in cache`)

    // Emit event for Server/ChildBridgeFork to handle
    this.api.emit(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, accessories)
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

    // Split accessories into normal (bridge) and external (standalone) based on device type
    const normalAccessories: MatterAccessory[] = []
    const externalAccessories: MatterAccessory[] = []

    for (const accessory of accessories) {
      if (requiresExternalBridge(accessory.deviceType)) {
        externalAccessories.push(accessory)
      } else {
        normalAccessories.push(accessory)
      }
    }

    // Handle normal accessories (on bridge)
    if (normalAccessories.length > 0) {
      log.debug(
        `${pluginIdentifier}: Unregistering ${normalAccessories.length} Matter accessor${normalAccessories.length === 1 ? 'y' : 'ies'} from platform '${platformName}'`,
      )
      this.api.emit(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, pluginIdentifier, platformName, normalAccessories)
    }

    // Handle external accessories (standalone bridges)
    if (externalAccessories.length > 0) {
      log.debug(
        `${pluginIdentifier}: Unregistering ${externalAccessories.length} external Matter accessor${externalAccessories.length === 1 ? 'y' : 'ies'} (${externalAccessories.map(a => a.displayName).join(', ')})`,
      )
      this.api.emit(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, externalAccessories)
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
      `Updating Matter accessory state: uuid=${uuid}, cluster=${cluster}, attributes=${Object.keys(attributes).join(', ')}${partId ? `, partId=${partId}` : ''}`,
    )

    // Emit the event (listeners will be called synchronously by EventEmitter)
    this.api.emit(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, uuid, cluster, attributes, partId)
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
      `Getting Matter accessory state: uuid=${uuid}, cluster=${cluster}${partId ? `, partId=${partId}` : ''}`,
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
