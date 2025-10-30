/**
 * Child Bridge Matter Manager
 *
 * Manages Matter server lifecycle and accessories for child bridges.
 * This class extracts Matter-specific logic from childBridgeFork.ts to minimize changes to core files.
 */

import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { InternalMatterAccessory, MatterAccessory, MatterConfig } from './types.js'

import { rmSync } from 'node:fs'
import path from 'node:path'

import { InternalAPIEvent } from '../api.js'
import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { User } from '../user.js'
import { generate } from '../util/mac.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterServer } from './server.js'

const log = Logger.internal

/**
 * Matter status information for child bridge IPC communication
 */
export interface ChildBridgeMatterStatusInfo {
  qrCode?: string
  manualPairingCode?: string
  serialNumber?: string
  commissioned: boolean
  deviceCount: number
}

/**
 * Manages Matter server and accessories for a child bridge
 */
export class ChildBridgeMatterManager {
  // Matter server instance for child bridge (if enabled)
  private matterServer?: MatterServer

  // External Matter servers for accessories that need their own bridge
  // Key is accessory UUID, value is MatterServer instance
  private readonly externalMatterServers: Map<string, MatterServer> = new Map()

  // Matter configuration from bridge config
  private matterConfig?: MatterConfig

  // Stored serial number for status updates
  private matterSerialNumber?: string

  constructor(
    private readonly bridgeConfig: BridgeConfiguration,
    private readonly bridgeOptions: BridgeOptions,
    private readonly api: HomebridgeAPI,
    private readonly externalPortService: ChildBridgeExternalPortService,
    private readonly pluginManager: PluginManager,
  ) {
    this.matterConfig = bridgeConfig.matter
  }

  /**
   * Initialize Matter server for child bridge if enabled
   * @param onCommissioningChanged Optional callback when commissioning status changes
   */
  async initialize(onCommissioningChanged?: () => void): Promise<void> {
    // Check if Matter is configured
    if (!this.matterConfig) {
      return
    }

    log.debug('Child bridge has Matter config (Combined HAP+Matter), starting Matter server')

    // If Matter doesn't have a port configured, allocate one
    if (!this.matterConfig.port) {
      // Generate a unique username for Matter port allocation
      const matterUsername = `${this.bridgeConfig.username}:MATTER` as any
      const matterPort = await this.externalPortService.requestPort(matterUsername)

      if (!matterPort) {
        throw new Error(
          'Failed to allocate Matter port for child bridge. '
          + 'Please specify a port manually in the _bridge.matter configuration, or free up ports in the configured range.',
        )
      }

      this.matterConfig.port = matterPort
      log.debug(`Allocated Matter port: ${this.matterConfig.port} (HAP port: ${this.bridgeConfig.port})`)
    }

    // Start Matter server
    await this.startMatterServer(this.matterConfig)

    // Listen for commissioning status changes to update parent process
    if (onCommissioningChanged && this.matterServer) {
      this.matterServer.on('commissioning-status-changed', (commissioned, fabricCount) => {
        log.info(`Matter commissioning status changed: commissioned=${commissioned}, fabricCount=${fabricCount}`)
        onCommissioningChanged()
      })
    }
  }

  /**
   * Start Matter server for child bridge
   */
  private async startMatterServer(matterConfig: MatterConfig): Promise<void> {
    log.info('Starting Matter server in child bridge process')

    // Create Matter server with the provided configuration
    const serialNumber = this.bridgeConfig.username.replace(/:/g, '')

    // Normalize bind config to array format
    const networkInterfaces = this.bridgeConfig.bind
      ? Array.isArray(this.bridgeConfig.bind)
        ? this.bridgeConfig.bind
        : [this.bridgeConfig.bind]
      : undefined

    this.matterServer = new MatterServer({
      port: matterConfig.port || 5540,
      uniqueId: serialNumber,
      storagePath: User.matterPath(),
      debugModeEnabled: this.bridgeOptions.debugModeEnabled,
      manufacturer: this.bridgeConfig.manufacturer,
      model: this.bridgeConfig.model,
      firmwareRevision: this.bridgeConfig.firmwareRevision,
      serialNumber,
      networkInterfaces,
    })

    await this.matterServer.start()

    // Inform the API that Matter is enabled
    this.api._setMatterEnabled(true)

    // Set the Matter server reference for API methods like getAccessoryState
    this.api._setMatterServer(this.matterServer)

    const commissioningInfo = this.matterServer.getCommissioningInfo()
    log.info('Matter server started with commissioning info:', commissioningInfo)

    // Store the serial number for status updates
    this.matterSerialNumber = commissioningInfo.serialNumber

    // Set up event listeners for Matter API calls
    this.setupEventListeners()
  }

  /**
   * Set up Matter API event listeners
   */
  private setupEventListeners(): void {
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, (accessories: MatterAccessory[], registrationId: string) => {
      this.handlePublishExternalAccessories(accessories as InternalMatterAccessory[], registrationId).catch((error) => {
        log.error('Failed to publish external Matter accessories:', error)
        // Make sure to resolve the registration even on error
        this.api._resolveExternalRegistration(registrationId)
      })
    })

    this.api.on(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]) => {
      this.handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
        log.error(`Failed to register Matter accessories for ${pluginIdentifier}:`, error)
      })
    })

    this.api.on(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, (accessories: MatterAccessory[]) => {
      this.handleUpdatePlatformAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
        log.error('Failed to update Matter platform accessories:', error)
      })
    })

    this.api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]) => {
      this.handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
        log.error(`Failed to unregister Matter accessories for ${pluginIdentifier}:`, error)
      })
    })

    this.api.on(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, (accessories: MatterAccessory[]) => {
      this.handleUnregisterExternalAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
        log.error('Failed to unregister external Matter accessories:', error)
      })
    })

    this.api.on(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, (uuid: string, cluster: string, attributes: Record<string, any>, partId?: string) => {
      this.handleUpdateAccessoryState(uuid, cluster, attributes, partId).catch((error) => {
        log.error(`Failed to update Matter accessory state for ${uuid}:`, error)
      })
    })
  }

  /**
   * Handle external Matter accessories - each gets its own dedicated Matter server
   * This is required for devices like Robotic Vacuum Cleaners that Apple Home
   * requires to be on their own bridge.
   */
  async handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void> {
    log.info(`Publishing ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from child bridge`)

    try {
      // Normalize bind config to array format (inherit from bridge)
      const networkInterfaces = this.bridgeConfig.bind
        ? Array.isArray(this.bridgeConfig.bind)
          ? this.bridgeConfig.bind
          : [this.bridgeConfig.bind]
        : undefined

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
            debugModeEnabled: this.bridgeOptions.debugModeEnabled,
          })

          if (!result) {
            // Validation or publishing failed (errors already logged by helper)
            continue
          }

          // Store the server instance
          this.externalMatterServers.set(accessory.uuid, result.server)

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
   * Handle updating Matter platform accessories in the cache
   * Checks both external servers and child bridge server
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
        // Collect accessories for child bridge
        bridgeAccessories.push(accessory)
      }
    }

    // Update accessories on child bridge server if any
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
    log.info(`Unregistering ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from child bridge`)

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
   * Handle Matter accessory state updates
   * Checks both external servers and child bridge server
   */
  async handleUpdateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    // Check if this is an external accessory first (each has its own MatterServer)
    const externalServer = this.externalMatterServers.get(uuid)
    if (externalServer) {
      await externalServer.updateAccessoryState(uuid, cluster, attributes, partId)
      return
    }

    // Otherwise, try the main child bridge Matter server
    if (!this.matterServer) {
      log.warn(`Cannot update Matter accessory state for ${uuid} - accessory not found in external servers and child bridge Matter server is not running`)
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
   * Get Matter status information for IPC communication
   * Returns undefined if Matter is not enabled for this child bridge
   */
  getMatterStatusInfo(): ChildBridgeMatterStatusInfo | undefined {
    if (!this.matterConfig || !this.matterServer) {
      return undefined
    }

    const commissioningInfo = this.matterServer.getCommissioningInfo()
    return {
      qrCode: commissioningInfo.qrCode,
      manualPairingCode: commissioningInfo.manualPairingCode,
      serialNumber: this.matterSerialNumber || commissioningInfo.serialNumber,
      commissioned: commissioningInfo.commissioned || false,
      deviceCount: this.matterServer.getAccessories().length,
    }
  }

  /**
   * Check if Matter is enabled for this child bridge
   */
  isMatterEnabled(): boolean {
    return this.matterServer !== undefined
  }

  /**
   * Teardown Matter servers
   */
  async teardown(): Promise<void> {
    // Stop main Matter server if it was initialized
    if (this.matterServer) {
      log.debug('Stopping Matter server')
      try {
        await this.matterServer.stop()
      } catch (error: unknown) {
        log.error('Error stopping Matter server:', error)
      }
    }

    // Stop all external Matter servers
    for (const [uuid, matterServer] of this.externalMatterServers) {
      log.debug(`Stopping external Matter server for ${uuid}`)
      try {
        await matterServer.stop()
      } catch (error: unknown) {
        log.error(`Error stopping external Matter server for ${uuid}:`, error)
      }
    }
    this.externalMatterServers.clear()
  }
}
