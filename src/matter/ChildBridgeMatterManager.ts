/**
 * Child Bridge Matter Manager
 *
 * Manages Matter server lifecycle and accessories for child bridges.
 * This class extracts Matter-specific logic from childBridgeFork.ts to minimize changes to core files.
 */

import type { HomebridgeAPI } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { AccessoryInfo } from './managerTypes.js'
import type { InternalMatterAccessory, MatterAccessory, MatterConfig } from './types.js'

import process from 'node:process'

import { InternalAPIEvent } from '../api.js'
import { DEFAULT_BRIDGE_DEFAULTS } from '../bridgeService.js'
import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { User } from '../user.js'
import getVersion from '../version.js'
import { BaseMatterManager } from './BaseMatterManager.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterServer } from './server.js'
import { appendUsernameSuffix, normalizeBindConfig } from './utils.js'

const log = Logger.withPrefix('Matter/ChildManager')
const COLON_RE = /:/g

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
export class ChildBridgeMatterManager extends BaseMatterManager {
  // Matter configuration from bridge config
  private readonly matterConfig?: MatterConfig

  // Stored serial number for status updates
  private matterSerialNumber?: string

  constructor(
    private readonly bridgeConfig: BridgeConfiguration,
    private readonly bridgeOptions: BridgeOptions,
    private readonly api: HomebridgeAPI,
    private readonly externalPortService: ChildBridgeExternalPortService,
    pluginManager: PluginManager,
  ) {
    super(pluginManager)
    this.matterConfig = bridgeConfig.matter
  }

  // Stored listener references so they can be removed in teardown()
  private readonly _onPublishExternalMatterAccessories = (accessories: MatterAccessory[], registrationId: string): void => {
    this.handlePublishExternalAccessories(accessories as InternalMatterAccessory[], registrationId).catch((error) => {
      log.error('Failed to publish external Matter accessories:', error)
      this.api._resolveExternalRegistration(registrationId)
    })
  }

  private readonly _onRegisterMatterPlatformAccessories = (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): void => {
    this.handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to register Matter accessories for ${pluginIdentifier}:`, error)
    })
  }

  private readonly _onUpdateMatterPlatformAccessories = (accessories: MatterAccessory[]): void => {
    this.handleUpdatePlatformAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to update Matter platform accessories:', error)
    })
  }

  private readonly _onUnregisterMatterPlatformAccessories = (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): void => {
    this.handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to unregister Matter accessories for ${pluginIdentifier}:`, error)
    })
  }

  private readonly _onUnregisterExternalMatterAccessories = (accessories: MatterAccessory[]): void => {
    this.handleUnregisterExternalAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to unregister external Matter accessories:', error)
    })
  }

  private readonly _onUpdateMatterAccessoryState = (uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): void => {
    this.handleUpdateAccessoryState(uuid, cluster, attributes, partId).catch((error) => {
      log.error(`Failed to update Matter accessory state for ${uuid}:`, error)
    })
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

    log.debug(`Child bridge ${this.bridgeConfig.username} has Matter config (Combined HAP+Matter), starting Matter server`)

    // If Matter doesn't have a port configured, allocate one
    if (!this.matterConfig.port) {
      // Generate a unique username for Matter port allocation
      const matterUsername = appendUsernameSuffix(this.bridgeConfig.username, 'MATTER')
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
        log.info(`Matter commissioning status changed for child bridge ${this.bridgeConfig.username}: commissioned=${commissioned}, fabricCount=${fabricCount}`)
        onCommissioningChanged()
      })
    }

    // Listen for state changes and forward to parent process
    if (this.matterServer) {
      this.matterServer.on('stateChange', ({ uuid, cluster, state, partId }) => {
        if (process.send) {
          process.send({
            id: 'matterEvent',
            data: {
              type: 'accessoryUpdate',
              data: {
                uuid,
                cluster,
                state,
                partId,
              },
            },
          })
        }
      })
    }
  }

  /**
   * Start Matter server for child bridge
   */
  private async startMatterServer(matterConfig: MatterConfig): Promise<void> {
    log.info(`Starting Matter server for child bridge ${this.bridgeConfig.username}`)

    // Create Matter server with the provided configuration
    const serialNumber = this.bridgeConfig.username.replace(COLON_RE, '')

    // Normalize bind config to array format
    const networkInterfaces = normalizeBindConfig(this.bridgeConfig.bind)

    this.matterServer = new MatterServer({
      port: matterConfig.port || 5540,
      uniqueId: serialNumber,
      storagePath: User.matterPath(),
      displayName: this.bridgeConfig.name || 'Child Bridge',
      debugModeEnabled: this.bridgeOptions.debugModeEnabled,
      manufacturer: this.bridgeConfig.manufacturer || DEFAULT_BRIDGE_DEFAULTS.manufacturer,
      model: this.bridgeConfig.model || DEFAULT_BRIDGE_DEFAULTS.model,
      firmwareRevision: this.bridgeConfig.firmwareRevision || getVersion(),
      serialNumber,
      networkInterfaces,
    })

    await this.matterServer.start()

    // Inform the API that Matter is enabled
    this.api._setMatterEnabled(true)

    // Set the Matter server reference for API methods like getAccessoryState
    this.api._setMatterServer(this.matterServer)

    const commissioningInfo = this.matterServer.getCommissioningInfo()
    log.info(`Matter server started for child bridge ${this.bridgeConfig.username} with commissioning info:`, commissioningInfo)

    // Store the serial number for status updates
    this.matterSerialNumber = commissioningInfo.serialNumber

    // Set up event listeners for Matter API calls
    this.setupEventListeners()
  }

  /**
   * Set up Matter API event listeners
   */
  private setupEventListeners(): void {
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, this._onPublishExternalMatterAccessories)
    this.api.on(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this._onUpdateMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, this._onUnregisterExternalMatterAccessories)
    this.api.on(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this._onUpdateMatterAccessoryState)
  }

  /**
   * Handle external Matter accessories - each gets its own dedicated Matter server
   * This is required for devices like Robotic Vacuum Cleaners that Apple Home
   * requires to be on their own bridge.
   */
  async handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void> {
    log.info(`Publishing ${accessories.length} external Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from child bridge ${this.bridgeConfig.username}`)

    try {
      // Normalize bind config to array format (inherit from bridge)
      const networkInterfaces = normalizeBindConfig(this.bridgeConfig.bind)

      for (const accessory of accessories) {
        try {
          // Check if already published
          if (this.externalMatterServers.has(accessory.UUID)) {
            log.warn(`External Matter accessory ${accessory.displayName} (${accessory.UUID}) is already published`)
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
          this.externalMatterServers.set(accessory.UUID, result.server)

          // Listen for state changes and forward to parent process
          // (same pattern as the child bridge server listener in initialize())
          result.server.on('stateChange', ({ uuid, cluster, state, partId }) => {
            if (process.send) {
              process.send({
                id: 'matterEvent',
                data: {
                  type: 'accessoryUpdate',
                  data: {
                    uuid,
                    cluster,
                    state,
                    partId,
                  },
                },
              })
            }
          })

          // Register the external bridge username with parent process for routing
          // Send via IPC to parent - parent will register in externalMatterBridgeRegistry
          if (process.send) {
            process.send({
              id: 'matterEvent',
              data: {
                type: 'externalBridgeRegistration',
                data: {
                  externalBridgeUsername: result.username,
                  childBridgeUsername: this.bridgeConfig.username,
                },
              },
            })
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
   * Enable state monitoring on all Matter servers
   * Override to add bridge-specific logging
   */
  override enableStateMonitoring(): void {
    log.debug(`Enabling Matter state monitoring for child bridge ${this.bridgeConfig.username}`)
    super.enableStateMonitoring()
  }

  /**
   * Disable state monitoring on all Matter servers
   * Override to add bridge-specific logging
   */
  override disableStateMonitoring(): void {
    log.debug(`Disabling Matter state monitoring for child bridge ${this.bridgeConfig.username}`)
    super.disableStateMonitoring()
  }

  /**
   * Collect all Matter accessories for UI display
   */
  collectAllAccessories(): AccessoryInfo[] {
    const accessories: AccessoryInfo[] = []

    if (this.matterServer) {
      const serverAccessories = this.matterServer.collectAccessories(
        this.bridgeConfig.username,
        'child',
        this.bridgeConfig.name || 'Child Bridge',
      )
      accessories.push(...serverAccessories)
    }

    // Collect from external servers
    for (const server of this.externalMatterServers.values()) {
      const externalAccessories = server.collectAccessories(
        server.username,
        'external',
        server.bridgeName,
      )
      accessories.push(...externalAccessories)
    }

    return accessories
  }

  /**
   * Get detailed info for a specific Matter accessory
   *
   * @param uuid - Accessory UUID
   * @returns Accessory info or undefined if not found
   */
  getAccessoryInfo(uuid: string): AccessoryInfo | undefined {
    // Check main server
    if (this.matterServer) {
      const info = this.matterServer.getAccessoryInfo(uuid)
      if (info) {
        return info
      }
    }

    // Check external servers
    for (const server of this.externalMatterServers.values()) {
      const info = server.getAccessoryInfo(uuid)
      if (info) {
        return info
      }
    }

    return undefined
  }

  /**
   * Teardown Matter servers
   */
  async teardown(): Promise<void> {
    // Remove API event listeners to prevent retention of this manager after teardown
    this.api.removeListener(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, this._onPublishExternalMatterAccessories)
    this.api.removeListener(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this._onUpdateMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, this._onUnregisterExternalMatterAccessories)
    this.api.removeListener(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this._onUpdateMatterAccessoryState)

    // Stop main Matter server if it was initialized
    if (this.matterServer) {
      log.debug(`Stopping Matter server for child bridge ${this.bridgeConfig.username}`)
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
