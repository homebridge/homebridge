/**
 * Matter Bridge Manager
 *
 * Manages Matter server lifecycle and accessories for the main Homebridge bridge.
 * This class extracts Matter-specific logic from server.ts to minimize changes to core files.
 */

import type { MacAddress } from 'hap-nodejs'

import type { HomebridgeAPI } from '../api.js'
import type { HomebridgeConfig } from '../bridgeService.js'
import type { ExternalPortService } from '../externalPortService.js'
import type { HomebridgeOptions } from '../server.js'
import type { InternalMatterAccessory } from './types.js'

import { rmSync } from 'node:fs'
import path from 'node:path'

import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterServer } from './server.js'

const log = Logger.internal

/**
 * Matter server status information for IPC communication
 */
export interface MatterStatusInfo {
  enabled: boolean
  port?: number
  setupUri?: string
  pin?: string
  serialNumber?: string
  commissioned?: boolean
  deviceCount?: number
}

/**
 * Manages Matter server and accessories for the main bridge
 */
export class MatterBridgeManager {
  // Matter server instance for main bridge (if enabled)
  private matterServer?: MatterServer

  // External Matter servers for accessories that need their own bridge
  // Key is accessory UUID, value is MatterServer instance
  private readonly externalMatterServers: Map<string, MatterServer> = new Map()

  constructor(
    private readonly config: HomebridgeConfig,
    private readonly api: HomebridgeAPI,
    private readonly externalPortService: ExternalPortService,
    private readonly pluginManager: PluginManager,
    private readonly options: HomebridgeOptions,
  ) {}

  /**
   * Collect all configured Matter ports from config to avoid conflicts
   */
  static collectConfiguredMatterPorts(config: HomebridgeConfig): number[] {
    const configuredMatterPorts: number[] = []

    if (config.bridge.matter?.port) {
      configuredMatterPorts.push(config.bridge.matter.port)
    }

    for (const platform of config.platforms) {
      if (platform._bridge?.matter?.port) {
        configuredMatterPorts.push(platform._bridge.matter.port)
      }
    }

    for (const accessory of config.accessories) {
      if (accessory._bridge?.matter?.port) {
        configuredMatterPorts.push(accessory._bridge.matter.port)
      }
    }

    return configuredMatterPorts
  }

  /**
   * Initialize Matter server for main bridge if enabled
   */
  async initialize(): Promise<void> {
    // Check if main bridge has matter configuration
    if (!this.config.bridge.matter) {
      return
    }

    // Declare matterPort outside try block so it's accessible in catch
    let matterPort: number | undefined

    try {
      log.info('Initializing Matter server for main bridge...')

      // Allocate port from pool if not explicitly configured
      matterPort = this.config.bridge.matter.port
      if (!matterPort) {
        matterPort = await this.externalPortService.requestPort(`${this.config.bridge.username}:MATTER` as MacAddress)
        if (!matterPort) {
          matterPort = 5540 // Default Matter port
          log.warn('No port available from pool for main Matter bridge, using default port 5540')
        } else {
          log.info(`Allocated port ${matterPort} from pool for main Matter bridge`)
        }
      }

      // Create Matter server instance with config inheritance from main bridge
      const serialNumber = this.config.bridge.username.replace(/:/g, '')

      // Normalize bind config to array format
      const networkInterfaces = this.config.bridge.bind
        ? Array.isArray(this.config.bridge.bind)
          ? this.config.bridge.bind
          : [this.config.bridge.bind]
        : undefined

      this.matterServer = new MatterServer({
        storagePath: User.matterPath(),
        port: matterPort,
        uniqueId: serialNumber,
        manufacturer: this.config.bridge.manufacturer,
        model: this.config.bridge.model,
        firmwareRevision: this.config.bridge.firmwareRevision,
        serialNumber,
        debugModeEnabled: this.options.debugModeEnabled,
        networkInterfaces,
      })

      // Start the Matter server
      await this.matterServer.start()

      log.info('Matter server initialized for main bridge')

      // Inform the API that Matter is enabled
      this.api._setMatterEnabled(true)

      // Set the Matter server reference for API methods like getAccessoryState
      this.api._setMatterServer(this.matterServer)
    } catch (error: unknown) {
      log.error('Failed to initialize Matter server for main bridge:', error)

      // Provide user-friendly guidance for common errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorCode = error instanceof Error && 'code' in error ? (error as any).code : undefined

      if (errorMessage.includes('corrupted')) {
        log.error('')
        log.error('╔════════════════════════════════════════════════════════════════════════════╗')
        log.error('║  MATTER STORAGE CORRUPTED                                                  ║')
        log.error('╠════════════════════════════════════════════════════════════════════════════╣')
        log.error('║  Your Matter storage has become corrupted. This can happen when:          ║')
        log.error('║  • Matter.js library version changes                                       ║')
        log.error('║  • Storage format upgrades occur                                           ║')
        log.error('║  • Incomplete writes during shutdown                                       ║')
        log.error('║                                                                            ║')
        log.error('║  To fix this, delete the corrupted storage directory:                     ║')
        log.error(`║  rm -rf ~/.homebridge/matter/${this.config.bridge.username}                                   ║`)
        log.error('║                                                                            ║')
        log.error('║  Note: You will need to re-pair your Matter devices after deletion.       ║')
        log.error('╚════════════════════════════════════════════════════════════════════════════╝')
        log.error('')
      } else if (errorCode === 'EADDRINUSE' || errorMessage.includes('address already in use')) {
        log.error('')
        log.error('╔════════════════════════════════════════════════════════════════════════════╗')
        log.error('║  MATTER PORT ALREADY IN USE                                                ║')
        log.error('╠════════════════════════════════════════════════════════════════════════════╣')
        log.error(`║  Port ${matterPort} is already in use by another application.                    ║`)
        log.error('║                                                                            ║')
        log.error('║  To fix this:                                                              ║')
        log.error('║  1. Stop the application using this port, or                              ║')
        log.error('║  2. Configure a different port in your config.json:                       ║')
        log.error('║     "bridge": {                                                            ║')
        log.error('║       "matter": {                                                          ║')
        log.error('║         "port": <different-port>                                           ║')
        log.error('║       }                                                                    ║')
        log.error('║     }                                                                      ║')
        log.error('╚════════════════════════════════════════════════════════════════════════════╝')
        log.error('')
      }
    }
  }

  /**
   * Handle external Matter accessories - each gets its own dedicated Matter server
   * This is required for devices like Robotic Vacuum Cleaners that Apple Home
   * requires to be on their own bridge.
   */
  async handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void> {
    log.info(`Publishing ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'}`)

    // Normalize bind config to array format (inherit from main bridge)
    const networkInterfaces = this.config.bridge.bind
      ? Array.isArray(this.config.bridge.bind)
        ? this.config.bridge.bind
        : [this.config.bridge.bind]
      : undefined

    try {
      for (const accessory of accessories) {
        try {
          // Check if already published
          if (this.externalMatterServers.has(accessory.uuid)) {
            log.warn(`External Matter accessory ${accessory.displayName} (${accessory.uuid}) is already published`)
            continue
          }

          // Publish the accessory using shared helper
          const result = await publishExternalMatterAccessory(accessory, {
            portService: this.externalPortService,
            networkInterfaces,
            debugModeEnabled: this.options.debugModeEnabled,
          })

          if (!result) {
            // Validation or publishing failed (errors already logged by helper)
            continue
          }

          // Store the server instance
          this.externalMatterServers.set(accessory.uuid, result.server)

          // Emit the 'ready' event to notify plugins that the accessory is now available on the network
          // This is similar to HAP's 'advertised' event and signals that the Matter server is running
          // and the accessory can be commissioned by Matter controllers
          if (accessory._eventEmitter) {
            accessory._eventEmitter.emit('ready', result.port)
          }

          // Log commissioning info
          if (result.commissioningInfo.qrCode && result.commissioningInfo.manualPairingCode) {
            log.info(`📱 Commissioning codes for ${accessory.displayName}:`)
            log.info(`   QR Code: ${result.commissioningInfo.qrCode}`)
            log.info(`   Manual Code: ${result.commissioningInfo.manualPairingCode}`)
          }
        } catch (error) {
          log.error(`Failed to publish external Matter accessory ${accessory.displayName}:`, error)
        }
      }
    } finally {
      // Notify that registration is complete (whether successful or not)
      this.api._resolveExternalRegistration(registrationId)
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
        const matterServer = this.externalMatterServers.get(accessory.uuid)
        if (!matterServer) {
          log.warn(`External Matter accessory ${accessory.displayName} (${accessory.uuid}) is not registered`)
          continue
        }

        log.info(`Stopping external Matter server for ${accessory.displayName}`)

        // Stop the Matter server
        await matterServer.stop()

        // Remove from the map
        this.externalMatterServers.delete(accessory.uuid)

        // Clean up storage folder
        // Generate the same uniqueId that was used when creating the server
        const advertiseAddress = generate(accessory.uuid)
        const uniqueId = advertiseAddress.replace(/:/g, '')
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
   * Handle updating Matter platform accessories in the cache
   * Checks both external servers and main bridge server
   */
  async handleUpdatePlatformAccessories(accessories: InternalMatterAccessory[]): Promise<void> {
    const bridgeAccessories: InternalMatterAccessory[] = []

    // Route each accessory to the appropriate server
    for (const accessory of accessories) {
      const externalServer = this.externalMatterServers.get(accessory.uuid)
      if (externalServer) {
        // Update external accessory
        await externalServer.updatePlatformAccessories([accessory])
      } else {
        // Collect accessories for main bridge
        bridgeAccessories.push(accessory)
      }
    }

    // Update accessories on main bridge server if any
    if (bridgeAccessories.length > 0) {
      if (!this.matterServer) {
        log.warn('Cannot update Matter platform accessories - Matter server is not running')
        return
      }
      await this.matterServer.updatePlatformAccessories(bridgeAccessories)
    }
  }

  /**
   * Handle Matter accessory state updates
   * Checks both external servers and main bridge server
   */
  async handleUpdateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    // Check if this is an external accessory first
    const externalServer = this.externalMatterServers.get(uuid)
    if (externalServer) {
      await externalServer.updateAccessoryState(uuid, cluster, attributes, partId)
      return
    }

    // Otherwise, try the main bridge server
    if (!this.matterServer) {
      log.warn(`Cannot update Matter accessory state for ${uuid} - accessory not found in external servers and main Matter server is not running`)
      return
    }
    await this.matterServer.updateAccessoryState(uuid, cluster, attributes, partId)
  }

  /**
   * Restore cached Matter accessories (matching HAP pattern)
   */
  restoreCachedAccessories(keepOrphaned: boolean): void {
    if (!this.matterServer) {
      log.debug('Matter server not available for restoring cached accessories')
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
          platformPlugin.configureMatterAccessory(cachedAccessory)
        } else {
          log.debug(`Platform ${cachedAccessory.platform} does not implement configureMatterAccessory`)
        }
      }
    }
  }

  /**
   * Get Matter server status information for IPC communication
   */
  getMatterStatus(): MatterStatusInfo {
    // Include Matter commissioning info if Matter is enabled
    if (this.matterServer) {
      const commissioningInfo = this.matterServer.getCommissioningInfo()
      return {
        enabled: true,
        port: this.config.bridge.matter?.port,
        setupUri: commissioningInfo.qrCode,
        pin: commissioningInfo.manualPairingCode,
        serialNumber: commissioningInfo.serialNumber,
        commissioned: commissioningInfo.commissioned || false,
        deviceCount: this.matterServer.getAccessories().length,
      }
    } else if (this.config.bridge.matter) {
      // Matter is configured but not yet started (or failed to start)
      return {
        enabled: false,
        port: this.config.bridge.matter?.port,
      }
    }

    return {
      enabled: false,
    }
  }

  /**
   * Teardown Matter servers
   */
  async teardown(): Promise<void> {
    // Stop main Matter server if running
    if (this.matterServer) {
      try {
        await this.matterServer.stop()
      } catch (error) {
        log.error('Failed to stop Matter server:', error)
      }
    }

    // Stop all external Matter servers
    for (const [uuid, matterServer] of this.externalMatterServers) {
      try {
        await matterServer.stop()
        log.debug(`Stopped external Matter server for ${uuid}`)
      } catch (error) {
        log.error(`Failed to stop external Matter server for ${uuid}:`, error)
      }
    }
    this.externalMatterServers.clear()

    // Child bridge Matter servers are stopped by their own forked processes
  }
}
