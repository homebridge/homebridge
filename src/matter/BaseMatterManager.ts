/**
 * Base class for Matter bridge managers
 * Contains shared logic for handling Matter accessory control and state updates
 */

import type { PluginManager } from '../pluginManager.js'
import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { InternalMatterAccessory, MatterAccessory } from './types.js'

import { rmSync } from 'node:fs'
import path from 'node:path'

import { Logger } from '../logger.js'
import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { mapAttributesToCommand } from './ClusterCommandMapper.js'
import { MatterServer } from './server.js'
import { MatterAccessoryNotOnBridgeError } from './types.js'

const log = Logger.withPrefix('Matter/BaseManager')
const COLON_RE = /:/g

/**
 * Base Matter Manager
 * Provides common functionality for both main bridge and child bridge Matter managers
 */
export abstract class BaseMatterManager {
  protected matterServer?: MatterServer
  protected readonly externalMatterServers: Map<string, MatterServer> = new Map()
  protected readonly pluginManager: PluginManager

  constructor(pluginManager: PluginManager) {
    this.pluginManager = pluginManager
  }

  /**
   * Whether this manager has Matter active in a form that handles plugin
   * registration/update/publish events — i.e. its API event listeners are
   * attached. The MatterAPIImpl guards use this so that a call made against a
   * bridge with no active Matter fails fast instead of emitting an event that
   * nothing handles (bridged registrations are dropped; external ones hang).
   *
   * The base implementation reflects the shared state — a bridge MatterServer
   * has been created. Subclasses override to add their mode-specific cases
   * (e.g. externalsOnly, where the bridge node never starts but external
   * accessories still publish).
   */
  hasActiveMatter(): boolean {
    return this.matterServer !== undefined
  }

  /**
   * Release a Matter port previously claimed for an external accessory.
   * Subclasses override to route to the right port service (the local
   * allocator on the main bridge, or an IPC call on a child bridge).
   * Default no-op so subclasses that don't (yet) plumb release through
   * stay safe.
   */
  // eslint-disable-next-line unused-imports/no-unused-vars
  protected releaseExternalMatterPort(uniqueId: string): void {
    // overridden by subclasses
  }

  /**
   * Get an external Matter server by accessory UUID
   *
   * @param uuid - Accessory UUID
   * @returns Matter server instance or undefined if not found
   */
  public getExternalServer(uuid: string): MatterServer | undefined {
    return this.externalMatterServers.get(uuid)
  }

  /**
   * Handle Matter accessory command (triggers user handlers)
   * This is for UI/external control that should invoke plugin handlers
   * Checks both external servers and bridge server
   */
  async handleTriggerCommand(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    // Map attributes to command using centralized mapper
    const commandMapping = mapAttributesToCommand(cluster, attributes)

    // Debug logging — pass objects as %j format args so JSON.stringify only
    // runs when debug is enabled (Logger.log short-circuits on level first).
    log.debug(`handleTriggerCommand: uuid=${uuid}, cluster=${cluster}, partId=${partId}`)
    log.debug('Attributes: %j', attributes)
    if (commandMapping) {
      log.debug('Command mapping: %j', commandMapping)
    } else {
      log.debug('Command mapping: null (state-only update)')
    }
    log.debug(`External servers count: ${this.externalMatterServers.size}`)
    if (this.externalMatterServers.size > 0) {
      // Pass the keys iterator as a %j arg so the spread+join only runs once
      // util.format is reached (i.e. when debug is enabled).
      log.debug('External server UUIDs: %j', [...this.externalMatterServers.keys()])
    }

    // Check if this is an external accessory first
    const externalServer = this.externalMatterServers.get(uuid)
    if (externalServer) {
      log.debug(`Found external server for ${uuid}`)
      if (commandMapping) {
        // Explicit command invocation
        await externalServer.triggerCommand(uuid, cluster, commandMapping.command, commandMapping.args, partId)
        // After a command, read back the current state and notify so the UI updates
        this.notifyCurrentState(externalServer, uuid, cluster, partId)
      } else {
        // State-only update (triggers change handlers automatically)
        await externalServer.updateAccessoryState(uuid, cluster, attributes, partId)
      }
      return
    }

    // Otherwise, try the bridge Matter server. If this bridge doesn't own the
    // UUID, throw the routing sentinel rather than letting the StateManager
    // throw a plain MatterDeviceError("Accessory ... not found or not
    // registered") — otherwise control broadcasts from the UI emit a real
    // error from every non-owner matter-enabled child bridge.
    if (!this.matterServer || !this.matterServer.getAccessoryInfo(uuid)) {
      log.debug(`Bridge does not own ${uuid}; signalling routing sentinel`)
      throw new MatterAccessoryNotOnBridgeError(uuid)
    }

    log.debug(`Trying matterServer for ${uuid}`)
    if (commandMapping) {
      // Explicit command invocation
      await this.matterServer.triggerCommand(uuid, cluster, commandMapping.command, commandMapping.args, partId)
      // After a command, read back the current state and notify so the UI updates
      this.notifyCurrentState(this.matterServer, uuid, cluster, partId)
    } else {
      // State-only update (triggers change handlers automatically)
      await this.matterServer.updateAccessoryState(uuid, cluster, attributes, partId)
    }
  }

  /**
   * Handle Matter accessory state updates
   * Checks both external servers and bridge server
   */
  async handleUpdateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    // Check if this is an external accessory first
    const externalServer = this.externalMatterServers.get(uuid)
    if (externalServer) {
      await externalServer.updateAccessoryState(uuid, cluster, attributes, partId)
      return
    }

    // Otherwise, try the bridge Matter server. Same ownership check as
    // handleTriggerCommand — if this bridge doesn't own the UUID, signal
    // the routing sentinel instead of letting the StateManager throw a
    // plain "not found or not registered" MatterDeviceError that the
    // dispatcher would surface as a real error.
    if (!this.matterServer || !this.matterServer.getAccessoryInfo(uuid)) {
      throw new MatterAccessoryNotOnBridgeError(uuid)
    }
    await this.matterServer.updateAccessoryState(uuid, cluster, attributes, partId)
  }

  /**
   * Enable state monitoring on all Matter servers
   */
  enableStateMonitoring(): void {
    this.matterServer?.enableStateMonitoring()
    for (const externalServer of this.externalMatterServers.values()) {
      externalServer.enableStateMonitoring()
    }
  }

  /**
   * After a triggerCommand completes, read back the current cluster state
   * and emit a state change notification. This ensures the UI receives
   * the updated state (e.g., currentPositionLiftPercent100ths for window
   * coverings) even if the behavior's own notification was not delivered.
   */
  private notifyCurrentState(server: MatterServer, uuid: string, cluster: string, partId?: string): void {
    const currentState = server.getAccessoryState(uuid, cluster, partId)
    if (currentState) {
      server.notifyStateChange(uuid, cluster, currentState, partId)
    }
  }

  /**
   * Disable state monitoring on all Matter servers
   */
  disableStateMonitoring(): void {
    this.matterServer?.disableStateMonitoring()
    for (const externalServer of this.externalMatterServers.values()) {
      externalServer.disableStateMonitoring()
    }
  }

  /**
   * Restore cached Matter accessories (matching HAP pattern)
   */
  restoreCachedAccessories(keepOrphaned: boolean): void {
    if (!this.matterServer) {
      return
    }

    const cachedAccessories = this.matterServer.getAllCachedAccessories()
    log.debug(`Restoring ${cachedAccessories.length} cached Matter accessories`)

    for (const cachedAccessory of cachedAccessories) {
      let plugin = this.pluginManager.getPlugin(cachedAccessory.plugin)

      if (!plugin) {
        try {
          // Try to find plugin by platform name (handles plugin renames)
          plugin = this.pluginManager.getPluginByActiveDynamicPlatform(cachedAccessory.platform)

          if (plugin) {
            log.info(`When searching for the associated plugin of the Matter accessory '${cachedAccessory.displayName}' `
              + `it seems like the plugin name changed from '${cachedAccessory.plugin}' to '${
                plugin.getPluginIdentifier()}'. Plugin association is now being transformed!`)
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          log.warn(`Could not find the associated plugin for the Matter accessory '${cachedAccessory.displayName}'. `
            + `Tried to find the plugin by the platform name but ${errorMessage}`)
        }
      }

      const platformPlugin = plugin && plugin.getActiveDynamicPlatform(cachedAccessory.platform)

      if (!platformPlugin) {
        log.warn(`Failed to find plugin to handle Matter accessory ${cachedAccessory.displayName} (plugin: ${cachedAccessory.plugin}, platform: ${cachedAccessory.platform})`)
        if (!keepOrphaned) {
          log.info(`Removing orphaned Matter accessory ${cachedAccessory.displayName}`)
          this.matterServer.unregisterAccessory(cachedAccessory.uuid).catch((error) => {
            log.warn(`Failed to unregister orphaned Matter accessory ${cachedAccessory.displayName}:`, error)
          })
        }
      } else {
        // Call configureMatterAccessory if the plugin implements it
        if (platformPlugin.configureMatterAccessory) {
          log.debug(`Calling configureMatterAccessory for ${cachedAccessory.displayName}`)
          // Deserialize from cache format to MatterAccessory for plugin
          const accessory = this.deserializeMatterAccessory(cachedAccessory)
          platformPlugin.configureMatterAccessory(accessory)
        } else {
          log.debug(`Platform ${cachedAccessory.platform} does not implement configureMatterAccessory`)
        }
      }
    }
  }

  /**
   * Handle registration of Matter platform accessories
   */
  async handleRegisterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: InternalMatterAccessory[]): Promise<void> {
    if (!this.matterServer) {
      log.warn('Cannot register Matter accessories - Matter server is not running')
      return
    }
    await this.matterServer.registerPlatformAccessories(pluginIdentifier, platformName, accessories)
  }

  /**
   * Handle updating Matter platform accessories in the cache
   * Checks both external servers and bridge server
   */
  async handleUpdatePlatformAccessories(accessories: InternalMatterAccessory[]): Promise<void> {
    const bridgeAccessories: InternalMatterAccessory[] = []

    // Route each accessory to the appropriate server
    for (const accessory of accessories) {
      const externalServer = this.externalMatterServers.get(accessory.UUID)
      if (externalServer) {
        // Update external accessory
        await externalServer.updatePlatformAccessories([accessory])
      } else {
        // Collect accessories for bridge server
        bridgeAccessories.push(accessory)
      }
    }

    // Update accessories on bridge server if any
    if (bridgeAccessories.length > 0) {
      if (!this.matterServer) {
        log.warn('Cannot update Matter platform accessories - Matter server is not running')
        return
      }
      await this.matterServer.updatePlatformAccessories(bridgeAccessories)
    }
  }

  /**
   * Handle unregistration of Matter platform accessories
   */
  async handleUnregisterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: InternalMatterAccessory[]): Promise<void> {
    if (!this.matterServer) {
      log.warn('Cannot unregister Matter accessories - Matter server is not running')
      return
    }
    await this.matterServer.unregisterPlatformAccessories(pluginIdentifier, platformName, accessories)
  }

  /**
   * Handle unregistration of external Matter accessories
   * Stops dedicated servers and cleans up storage
   */
  async handleUnregisterExternalAccessories(accessories: InternalMatterAccessory[]): Promise<void> {
    log.info(`Unregistering ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'}`)

    for (const accessory of accessories) {
      try {
        // Check if this external server exists
        const matterServer = this.externalMatterServers.get(accessory.UUID)
        if (!matterServer) {
          log.warn(`External Matter accessory ${accessory.displayName} (${accessory.UUID}) is not registered`)
          continue
        }

        log.info(`Stopping external Matter server for ${accessory.displayName}`)

        // Stop the Matter server. stop() now rejects when the underlying node
        // fails to close (it may still be bound to its port). In that case we
        // deliberately leave the map entry, the port reservation and the
        // storage folder in place rather than tearing them down — mirrors the
        // publish path's "keep the port reserved" stance. Releasing the port
        // could hand a still-bound port to the next publish (EADDRINUSE), and
        // dropping the map entry would discard the only handle to the live
        // node. The slot stays reserved until Homebridge restarts.
        try {
          await matterServer.stop()
        } catch (stopError) {
          log.warn(`Failed to stop external Matter server for ${accessory.displayName}; the matter.js server may still be bound. Keeping its port reserved and storage intact until Homebridge restarts.`, stopError)
          continue
        }

        // Remove from the map
        this.externalMatterServers.delete(accessory.UUID)

        // Clean up storage folder
        // Generate the same uniqueId that was used when creating the server
        const advertiseAddress = generate(accessory.UUID)
        const uniqueId = advertiseAddress.replace(COLON_RE, '')
        // Hand the Matter port back to the allocator so the slot can be
        // reused — without this, the allocator's pool monotonically
        // shrinks across the install's lifetime.
        this.releaseExternalMatterPort(uniqueId)
        const storagePath = path.join(User.matterPath(), uniqueId)

        try {
          log.debug(`Removing Matter storage for external accessory at: ${storagePath}`)
          rmSync(storagePath, { recursive: true, force: true })
          log.info(`✓ Cleaned up storage for external Matter accessory: ${accessory.displayName}`)
        } catch (error) {
          log.error(`Failed to clean up storage for external Matter accessory ${accessory.displayName}:`, error)
        }

        log.info(`✓ External Matter accessory unregistered: ${accessory.displayName}`)
      } catch (error) {
        log.error(`Failed to unregister external Matter accessory ${accessory.displayName}:`, error)
      }
    }
  }

  /**
   * Deserialize SerializedMatterAccessory from cache to MatterAccessory for plugin use
   * Converts internal cache format to the public API format plugins expect
   */
  private deserializeMatterAccessory(serialized: SerializedMatterAccessory): MatterAccessory {
    return {
      UUID: serialized.uuid, // Convert lowercase uuid to uppercase UUID
      displayName: serialized.displayName,
      deviceType: serialized.deviceType as any, // Type info only (full EndpointType not restorable from cache)
      serialNumber: serialized.serialNumber,
      manufacturer: serialized.manufacturer,
      model: serialized.model,
      firmwareRevision: serialized.firmwareRevision,
      hardwareRevision: serialized.hardwareRevision,
      softwareVersion: serialized.softwareVersion,
      context: serialized.context ?? {}, // Ensure non-optional context
      clusters: serialized.clusters,
      parts: serialized.parts as any, // Part types not fully restorable from cache
      // Note: handlers and getState are not restored from cache - plugins must provide these
    }
  }
}
