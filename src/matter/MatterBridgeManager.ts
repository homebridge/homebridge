/**
 * Matter Bridge Manager
 *
 * Manages Matter server lifecycle and accessories for the main Homebridge bridge.
 * This class extracts Matter-specific logic from server.ts to minimize changes to core files.
 */

import type { MacAddress } from '@homebridge/hap-nodejs'

import type { HomebridgeAPI } from '../api.js'
import type { HomebridgeConfig } from '../bridgeService.js'
import type { ExternalPortService } from '../externalPortService.js'
import type { IpcService } from '../ipcService.js'
import type { HomebridgeOptions } from '../server.js'
import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { MatterEvent, MatterStatusInfo } from './ipc-types.js'
import type { AccessoryInfo } from './managerTypes.js'
import type { CommissioningSnapshot } from './server/FabricManager.js'
import type { InternalMatterAccessory, MatterAccessory } from './types.js'

import { InternalAPIEvent } from '../api.js'
import { DEFAULT_BRIDGE_DEFAULTS } from '../bridgeService.js'
import { IpcOutgoingEvent } from '../ipcService.js'
import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { User } from '../user.js'
import getVersion from '../version.js'
import { BaseMatterManager } from './BaseMatterManager.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterAccessoryNotOnBridgeError } from './MatterError.js'
import { MatterServer } from './server.js'
import { getErrorCode, getMatterJsVersion, normalizeBindConfig } from './utils.js'

const log = Logger.withPrefix('Matter/MainManager')
const COLON_RE = /:/g

/**
 * Manages Matter server and accessories for the main bridge
 */
export class MatterBridgeManager extends BaseMatterManager {
  constructor(
    private readonly config: HomebridgeConfig,
    private readonly api: HomebridgeAPI,
    private readonly externalPortService: ExternalPortService,
    pluginManager: PluginManager,
    private readonly options: HomebridgeOptions,
    private readonly server: {
      registerExternalMatterBridge: (username: string, owner: string) => void
      ipcService: IpcService
    },
  ) {
    super(pluginManager)
    // Listeners are attached inside initialize() based on mode (normal vs
    // externalsOnly vs disabled). Plugins do not run until after initialize()
    // returns, so there is no race between plugin registrations and listener
    // attachment.
  }

  protected override releaseExternalMatterPort(uniqueId: string): void {
    this.externalPortService.releaseMatterPort(uniqueId)
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
      // In externalsOnly mode the real handler is attached but the bridge node
      // never started, so a state update for a non-external accessory is an
      // expected "wrong target", not a failure. Mirror the message-handler path
      // and log it at debug instead of surfacing a red error line.
      if (error instanceof MatterAccessoryNotOnBridgeError) {
        log.debug(`Ignoring Matter state update for ${uuid}: accessory is not on this bridge`)
        return
      }
      log.error('Failed to update Matter accessory state:', error)
    })
  }

  // Drop-stub handlers for bridged Matter events when in externalsOnly mode.
  // Attached only in externalsOnly mode so plugin authors get a debug-level
  // log when registering bridged accessories that would otherwise have been
  // hosted on the bridge node.
  private readonly _onRegisterMatterPlatformAccessoriesDropped = (pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): void => {
    log.debug(`Main bridge externalsOnly mode: dropping ${accessories.length} bridged Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from ${pluginIdentifier} (bridge node is not running).`)
  }

  private readonly _onUnregisterMatterPlatformAccessoriesDropped = (pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): void => {
    log.debug(`Main bridge externalsOnly mode: dropping unregistration for ${accessories.length} bridged Matter accessor${accessories.length === 1 ? 'y' : 'ies'} from ${pluginIdentifier} (bridge node is not running).`)
  }

  // True when this manager was initialised in externalsOnly mode.
  private externalsOnlyMode = false

  /**
   * Whether the main bridge has active Matter handling. True in normal mode
   * (the bridge MatterServer was created and its listeners attached — even if
   * start() later failed, the listeners are still attached) and in externalsOnly
   * mode. False when `bridge.matter` is absent or disabled, in which case
   * initialize() returns before attaching any listeners — so api.matter calls
   * made against the main bridge must be rejected rather than silently dropped.
   */
  override hasActiveMatter(): boolean {
    return this.matterServer !== undefined || this.externalsOnlyMode
  }

  // Stored reference so the stateChange listener can be removed in teardown()
  private readonly _onMatterServerStateChange = ({ uuid, cluster, state, partId }: { uuid: string, cluster: string, state: Record<string, unknown>, partId?: string }): void => {
    const event: MatterEvent = {
      type: 'accessoryUpdate',
      data: { uuid, cluster, state, partId },
    }
    this.server.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
  }

  /**
   * Set up all Matter API event listeners (external + bridged). Used in
   * normal mode where the bridge MatterServer is running.
   */
  private setupEventListeners(): void {
    this.setupExternalEventListeners()
    this.setupBridgedEventListeners()
  }

  /**
   * Set up only the external-accessory listeners. These do not need a running
   * bridge MatterServer — each external creates its own dedicated server.
   * Used in normal mode (via setupEventListeners) and in externalsOnly mode.
   */
  private setupExternalEventListeners(): void {
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, this._onPublishExternalMatterAccessories)
    this.api.on(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, this._onUnregisterExternalMatterAccessories)
  }

  /**
   * Set up bridged-accessory listeners that require the bridge MatterServer.
   * Used in normal mode only.
   */
  private setupBridgedEventListeners(): void {
    this.api.on(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this._onUpdateMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this._onUpdateMatterAccessoryState)
  }

  /**
   * Attach drop-stub listeners for bridged Matter events in externalsOnly
   * mode. Each stub logs at debug level and returns without doing anything,
   * so plugin authors who misconfigure a bridge get a breadcrumb without
   * noisy warn-level output.
   */
  private setupBridgedDropStubs(): void {
    // Bridged register/unregister cannot be served without a running bridge node
    // (externals use the dedicated PUBLISH/UNREGISTER_EXTERNAL events), so drop
    // them with a debug breadcrumb.
    this.api.on(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessoriesDropped)
    this.api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessoriesDropped)
    // UPDATE events must still reach EXTERNAL accessories, which DO publish in
    // externalsOnly mode. The real handlers route to external servers first and
    // safely log (never crash) the bridge path when no bridge node is running.
    this.api.on(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this._onUpdateMatterPlatformAccessories)
    this.api.on(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this._onUpdateMatterAccessoryState)
  }

  /**
   * Initialize Matter server for main bridge. Three states:
   *
   * 1. Disabled (matter absent, or `enabled: false` without `externalsOnly`) → return early.
   * 2. externalsOnly mode → attach listeners for external publishing AND debug-log
   *    drop stubs for bridged matter events, but do NOT start the bridge MatterServer.
   * 3. Normal (`enabled !== false`) → full setup including server startup.
   */
  async initialize(): Promise<void> {
    // 1. Disabled or absent → nothing to do.
    if (!this.config.bridge.matter) {
      return
    }
    if (this.config.bridge.matter.enabled === false && !this.config.bridge.matter.externalsOnly) {
      return
    }

    // 2. externalsOnly mode → attach external + drop-stub listeners, skip the
    //    bridge server. api.matter was loaded earlier so plugins can call
    //    publishExternalAccessories. Each external creates its own dedicated
    //    MatterServer (see ExternalMatterAccessoryPublisher).
    if (this.config.bridge.matter.externalsOnly === true) {
      log.info('Main bridge: Matter externalsOnly mode — bridge node will not start, but external Matter accessories can still publish.')
      this.externalsOnlyMode = true
      this.setupExternalEventListeners()
      this.setupBridgedDropStubs()
      return
    }

    // 3. Normal mode → existing full setup follows. Attach listeners first so
    //    any plugin activity during the async startup is queued correctly.
    this.setupEventListeners()

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
      const serialNumber = this.config.bridge.username.replace(COLON_RE, '')

      // Normalize bind config to array format
      const networkInterfaces = normalizeBindConfig(this.config.bridge.bind)

      this.matterServer = new MatterServer({
        storagePath: User.matterPath(),
        port: matterPort,
        uniqueId: serialNumber,
        displayName: this.config.bridge.name || 'Main Bridge',
        manufacturer: this.config.bridge.manufacturer || DEFAULT_BRIDGE_DEFAULTS.manufacturer,
        model: this.config.bridge.model || DEFAULT_BRIDGE_DEFAULTS.model,
        firmwareRevision: this.config.bridge.firmwareRevision || getVersion(),
        serialNumber,
        debugModeEnabled: this.options.debugModeEnabled,
        networkInterfaces,
      })

      // Start the Matter server
      await this.matterServer.start()

      // Log Homebridge and Matter.js version info, matching child bridge log style
      const matterJsVersion = getMatterJsVersion()
      log.success('Homebridge v%s (Matter.js v%s) (%s) is running on port %s.', getVersion(), matterJsVersion, this.config.bridge.name, matterPort)
      log.info('Matter server initialized for main bridge')

      // Inform the API that Matter is enabled
      this.api._setMatterEnabled(true)

      // Set the Matter server reference for API methods like getAccessoryState
      this.api._setMatterServer(this.matterServer)

      // Listen for state changes and forward to UI via IPC
      this.matterServer.on('stateChange', this._onMatterServerStateChange)
    } catch (error: unknown) {
      log.error('Failed to initialize Matter server for main bridge:', error)

      // Provide user-friendly guidance for common errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorCode = getErrorCode(error)

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
    const networkInterfaces = normalizeBindConfig(this.config.bridge.bind)

    try {
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
            debugModeEnabled: this.options.debugModeEnabled,
          })

          if (!result) {
            // Validation or publishing failed (errors already logged by helper)
            continue
          }

          // Store the server instance
          this.externalMatterServers.set(accessory.UUID, result.server)

          // Listen for state changes and forward to UI via IPC
          // (same pattern as the main bridge server listener in initialize())
          result.server.on('stateChange', this._onMatterServerStateChange)

          // Register the external bridge username for direct routing
          // Use main bridge's username for consistent lookups
          this.server.registerExternalMatterBridge(result.username, this.config.bridge.username)

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
      // Matter is configured but the bridge node is not running. Two reasons:
      //   - externalsOnly mode (intentional — externals still publish via
      //     their own per-accessory servers).
      //   - Disabled in place, or failed to start.
      // Surface externalsOnly to the UI so it can render a distinct status.
      return {
        enabled: false,
        port: this.config.bridge.matter?.port,
        externalsOnly: this.externalsOnlyMode,
      }
    }

    return {
      enabled: false,
    }
  }

  /**
   * Collect all Matter accessories from all sources
   *
   * @param bridgeUsername - Optional: specific bridge username to filter by
   * @returns Array of accessory data suitable for UI consumption
   */
  collectAllAccessories(bridgeUsername?: string): AccessoryInfo[] {
    const accessories: AccessoryInfo[] = []

    // Main bridge accessories (if no specific bridge requested or requesting main bridge)
    if (!bridgeUsername || bridgeUsername === this.config.bridge.username) {
      if (this.matterServer) {
        const mainAccessories = this.collectAccessoriesFromServer(
          this.matterServer,
          this.config.bridge.username,
          'main',
          this.config.bridge.name || 'Homebridge',
        )
        accessories.push(...mainAccessories)

        // External accessories (belong to main bridge context)
        for (const server of this.externalMatterServers.values()) {
          const externalAccessories = this.collectAccessoriesFromServer(
            server,
            server.username,
            'external',
            server.bridgeName,
          )
          accessories.push(...externalAccessories)
        }
      }
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
    // Search main bridge
    if (this.matterServer) {
      const accessory = this.getAccessoryDetailFromServer(
        this.matterServer,
        uuid,
        this.config.bridge.username,
        'main',
      )
      if (accessory) {
        return accessory
      }
    }

    // Search external servers
    for (const server of this.externalMatterServers.values()) {
      const accessory = this.getAccessoryDetailFromServer(
        server,
        uuid,
        server.username,
        'external',
      )
      if (accessory) {
        return accessory
      }
    }

    return undefined
  }

  /**
   * Collect accessories from a specific Matter server
   *
   * @param server - Matter server instance
   * @param bridgeUsername - Bridge MAC address
   * @param bridgeType - Type of bridge (main/child/external)
   * @param bridgeName - Display name of the bridge
   * @returns Array of accessory information
   */
  private collectAccessoriesFromServer(
    server: MatterServer,
    bridgeUsername: string,
    bridgeType: 'main' | 'child' | 'external',
    bridgeName: string,
  ): AccessoryInfo[] {
    const cached = server.getAllCachedAccessories()
    const accessories: AccessoryInfo[] = []

    // Fabric/commissioning state is server-wide — read it once, then share
    // the snapshot across every accessory transform instead of re-reading it
    // (3 fabric calls deep) per cached accessory.
    const snapshot = server.getCommissioningSnapshot()

    for (const acc of cached) {
      const accessory = this.transformAccessoryData(
        acc,
        server,
        bridgeUsername,
        bridgeType,
        bridgeName,
        snapshot,
      )
      accessories.push(accessory)
    }

    return accessories
  }

  /**
   * Transform accessory data for UI consumption
   *
   * @param acc - Cached accessory data
   * @param server - Matter server instance
   * @param bridgeUsername - Bridge MAC address
   * @param bridgeType - Type of bridge
   * @param bridgeName - Display name of the bridge
   * @returns Transformed accessory info for UI
   */
  private transformAccessoryData(
    acc: SerializedMatterAccessory,
    server: MatterServer,
    bridgeUsername: string,
    bridgeType: 'main' | 'child' | 'external',
    bridgeName: string,
    snapshot: CommissioningSnapshot,
  ): AccessoryInfo {
    // Get current state
    const currentState = this.getCurrentStateFromServer(server, acc.uuid)

    // Convert device type object to string representation
    const deviceTypeStr = acc.deviceType.name || `Device Code ${acc.deviceType.code || 'unknown'}`

    return {
      // Identity
      uuid: acc.uuid,
      displayName: acc.displayName,
      serialNumber: acc.serialNumber,
      manufacturer: acc.manufacturer,
      model: acc.model,
      firmwareRevision: acc.firmwareRevision,

      // Device type
      deviceType: deviceTypeStr,

      // Current cluster states
      clusters: currentState,

      // Parts (composed devices)
      parts: acc.parts?.map(part => ({
        id: part.id,
        displayName: part.displayName,
        deviceType: part.deviceType.name || `Device Code ${part.deviceType.code || 'unknown'}`,
        clusters: this.getCurrentStateFromServer(server, acc.uuid, part.id),
      })),

      // Bridge info
      bridge: {
        username: bridgeUsername,
        type: bridgeType,
        name: bridgeName,
      },

      // Plugin info
      plugin: acc.plugin,
      platform: acc.platform,

      // Context (plugin-specific data)
      context: acc.context,

      // Commissioning info (if available) — sourced from a single snapshot
      // built once per server in the caller, not per-accessory.
      commissioned: snapshot.commissioned,
      fabricCount: snapshot.fabricCount,

      // Map fabric info from Matter.js format to our interface.
      // Keep fabricId/nodeId as strings — they are 64-bit Matter identifiers
      // and would lose precision as Number, and JSON/IPC cannot serialize BigInt.
      fabrics: snapshot.fabrics.map(fabric => ({
        fabricIndex: fabric.fabricIndex,
        fabricId: fabric.fabricId,
        nodeId: fabric.nodeId,
        vendorId: fabric.rootVendorId, // Matter.js uses rootVendorId
        label: fabric.label,
      })),
    }
  }

  /**
   * Get detailed accessory info from a specific server
   *
   * @param server - Matter server instance
   * @param uuid - Accessory UUID
   * @param bridgeUsername - Bridge MAC address
   * @param bridgeType - Type of bridge
   * @returns Accessory info or undefined if not found
   */
  private getAccessoryDetailFromServer(
    server: MatterServer,
    uuid: string,
    bridgeUsername: string,
    bridgeType: 'main' | 'child' | 'external',
  ): AccessoryInfo | undefined {
    const accessory = server.getAccessory(uuid)
    if (!accessory) {
      return undefined
    }

    const cached = server.getCachedAccessory(uuid)
    if (!cached) {
      return undefined
    }

    return this.transformAccessoryData(
      cached,
      server,
      bridgeUsername,
      bridgeType,
      server.bridgeName || 'Matter Bridge',
      server.getCommissioningSnapshot(),
    )
  }

  /**
   * Get current state from Matter server for an accessory
   */
  private getCurrentStateFromServer(
    server: MatterServer,
    uuid: string,
    partId?: string,
  ): Record<string, Record<string, unknown>> {
    const accessory = server.getAccessory(uuid)
    if (!accessory) {
      return {}
    }

    const endpoint = partId
      ? (accessory as any)._parts?.find((p: any) => p.id === partId)?.endpoint
      : (accessory as any).endpoint

    if (!endpoint) {
      return {}
    }

    const state: Record<string, Record<string, unknown>> = {}

    for (const [clusterName, clusterState] of Object.entries(endpoint.state)) {
      state[clusterName] = {}
      for (const [key, value] of Object.entries(clusterState as any)) {
        if (!key.startsWith('_') && !key.startsWith('$')) {
          state[clusterName][key] = value
        }
      }
    }

    return state
  }

  /**
   * Teardown Matter servers
   */
  async teardown(): Promise<void> {
    // Remove API event listeners to prevent retention of this manager after teardown.
    // EventEmitter.removeListener is a no-op when the listener was never attached,
    // so it's safe to call all removals regardless of which mode initialised this manager.
    this.api.removeListener(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, this._onPublishExternalMatterAccessories)
    this.api.removeListener(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, this._onUnregisterExternalMatterAccessories)
    this.api.removeListener(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this._onUpdateMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessories)
    this.api.removeListener(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this._onUpdateMatterAccessoryState)
    // externalsOnly mode drop stubs (UPDATE events use the real handlers above,
    // already removed, so externals keep receiving updates in externalsOnly mode)
    this.api.removeListener(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this._onRegisterMatterPlatformAccessoriesDropped)
    this.api.removeListener(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this._onUnregisterMatterPlatformAccessoriesDropped)

    // Stop main Matter server if running
    if (this.matterServer) {
      try {
        this.matterServer.removeListener('stateChange', this._onMatterServerStateChange)
        await this.matterServer.stop()
      } catch (error) {
        log.error('Failed to stop Matter server:', error)
      }
    }

    // Stop all external Matter servers
    for (const [uuid, matterServer] of this.externalMatterServers) {
      try {
        matterServer.removeListener('stateChange', this._onMatterServerStateChange)
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
