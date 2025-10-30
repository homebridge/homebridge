/**
 * Matter API Implementation
 *
 * This class implements the Matter API facade, keeping Matter-specific logic
 * separate from the core HomebridgeAPI class.
 *
 * Benefits:
 * - Reduces changes to core api.ts file
 * - Lazy-loads Matter code only when used
 * - Clear separation between HAP and Matter
 * - Easier to test in isolation
 * - Validates accessories before registration
 * - Provides detailed error messages for debugging
 */

import type { EndpointType } from '@matter/main'

import type { HomebridgeAPI, MatterAPI, PlatformName, PluginIdentifier } from '../api.js'
import type { InternalMatterAccessory } from './index.js'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { clusterNames, clusters, deviceTypes, MatterAccessory, MatterServer, MatterTypes } from './index.js'

const log = Logger.internal

/**
 * Device types that require dedicated external bridges
 * These devices must be published on their own bridge (not added to main/child bridge)
 */
const EXTERNAL_DEVICE_TYPES: EndpointType[] = [
  deviceTypes.RoboticVacuumCleaner,
]

/**
 * Check if a device type requires external bridge publishing
 */
function requiresExternalBridge(deviceType: EndpointType): boolean {
  // Compare device type IDs for exact match
  return EXTERNAL_DEVICE_TYPES.some(externalType => externalType.deviceType === deviceType.deviceType)
}

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
 * Delegates to the HomebridgeAPI instance for event emission and server access
 * Provides validation and coordination for Matter accessory operations
 */
export class MatterAPIImpl implements MatterAPI {
  constructor(private readonly api: HomebridgeAPI) {}

  /**
   * Validate a Matter accessory has required fields
   * @throws MatterAccessoryValidationError if validation fails
   */
  private validateAccessory(accessory: MatterAccessory, context: string): void {
    if (!accessory.uuid) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory missing required 'uuid' field`,
        accessory,
      )
    }

    if (!accessory.displayName) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.uuid}' missing required 'displayName' field`,
        accessory,
      )
    }

    if (!accessory.deviceType) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.uuid}) missing required 'deviceType' field`,
        accessory,
      )
    }

    if (!accessory.manufacturer) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.uuid}) missing required 'manufacturer' field`,
        accessory,
      )
    }

    if (!accessory.model) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.uuid}) missing required 'model' field`,
        accessory,
      )
    }

    if (!accessory.serialNumber) {
      throw new MatterAccessoryValidationError(
        `${context}: Matter accessory '${accessory.displayName}' (${accessory.uuid}) missing required 'serialNumber' field`,
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
   */
  private validateClusterName(clusterName: string, context: string): void {
    // Check if cluster name is in the known cluster names
    const validClusterNames = Object.values(clusterNames)
    if (!validClusterNames.includes(clusterName as any)) {
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
  async registerPlatformAccessories(
    pluginIdentifier: PluginIdentifier,
    platformName: PlatformName,
    accessories: MatterAccessory[],
  ): Promise<void> {
    if (accessories.length === 0) {
      log.warn(`${pluginIdentifier}: Attempted to register 0 Matter accessories`)
      return
    }

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
        (this.api as any)._pendingExternalRegistrations.set(registrationId, resolve)
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

    log.debug(
      `Updating Matter accessory state: uuid=${uuid}, cluster=${cluster}, attributes=${Object.keys(attributes).join(', ')}${partId ? `, partId=${partId}` : ''}`,
    )

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
    const matterManager = (this.api as any)._matterManager
    if (matterManager?.externalMatterServers) {
      const externalServer = matterManager.externalMatterServers.get(uuid)
      if (externalServer) {
        return externalServer.getAccessoryState(uuid, cluster, partId)
      }
    }

    // Otherwise, try the main bridge server
    const matterServer = (this.api as any)._matterServer as MatterServer | null
    if (!matterServer) {
      log.debug(`getAccessoryState: Matter server not available for accessory ${uuid}`)
      return undefined
    }

    return matterServer.getAccessoryState(uuid, cluster, partId)
  }
}
