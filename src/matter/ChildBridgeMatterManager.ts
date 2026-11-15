/**
 * Child Bridge Matter Manager
 *
 * Manages Matter server lifecycle and accessories for child bridges.
 * This class extracts Matter-specific logic from childBridgeFork.ts to minimize changes to core files.
 */

import type { HomebridgeAPI, MatterWorkTracker } from '../api.js'
import type { BridgeConfiguration, BridgeOptions } from '../bridgeService.js'
import type { ChildBridgeExternalPortService } from '../externalPortService.js'
import type { ChildBridgeMatterStatusInfo } from './ipc-types.js'
import type { AccessoryInfo } from './managerTypes.js'
import type { CommissioningSnapshot } from './server/FabricManager.js'
import type { InternalMatterAccessory, MatterAccessory, MatterConfig } from './types.js'

import { InternalAPIEvent } from '../api.js'
import { DEFAULT_BRIDGE_DEFAULTS } from '../bridgeService.js'
import { Logger } from '../logger.js'
import { PluginManager } from '../pluginManager.js'
import { User } from '../user.js'
import { sendToParent } from '../util/ipc.js'
import getVersion from '../version.js'
import { BaseMatterManager } from './BaseMatterManager.js'
import { publishExternalMatterAccessory } from './ExternalMatterAccessoryPublisher.js'
import { MatterAccessoryNotOnBridgeError } from './MatterError.js'
import { MatterServer } from './server.js'
import { appendUsernameSuffix, getErrorCode, getMatterJsVersion, normalizeBindConfig } from './utils.js'

const log = Logger.withPrefix('Matter/ChildManager')
const COLON_RE = /:/g

// Deferred-online settle loop tuning (see startMatterServer): the node goes
// online once registrations have been idle for SETTLE_MS, checked every
// POLL_MS, capped at CAP_MS so a stuck or registration-less plugin cannot
// keep the bridge offline.
const DEFER_ONLINE_SETTLE_MS = 2000
const DEFER_ONLINE_CAP_MS = 45000
const DEFER_ONLINE_POLL_MS = 500

export type { ChildBridgeMatterStatusInfo } from './ipc-types.js'

/**
 * What a MatterServer returns for one accessory (its methods are typed `any`):
 * the identity, device type, state and parts, without the fields that need the
 * bridge, the accessory cache or the commissioning state.
 */
type ServerAccessoryData = Pick<AccessoryInfo, 'uuid' | 'displayName' | 'deviceType' | 'manufacturer' | 'model' | 'serialNumber' | 'firmwareRevision' | 'clusters' | 'parts'>

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

  private readonly _onRegisterMatterPlatformAccessories = (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[], track?: MatterWorkTracker): void => {
    track?.(this.handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to register Matter accessories for ${pluginIdentifier}:`, error)
    }))
  }

  private readonly _onUpdateMatterPlatformAccessories = (accessories: MatterAccessory[], track?: MatterWorkTracker): void => {
    const work = this.handleUpdatePlatformAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to update Matter platform accessories:', error)
    })
    track?.(work)
  }

  private readonly _onUnregisterMatterPlatformAccessories = (pluginIdentifier: string, platformName: string, accessories: MatterAccessory[], track?: MatterWorkTracker): void => {
    track?.(this.handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to unregister Matter accessories for ${pluginIdentifier}:`, error)
    }))
  }

  private readonly _onUnregisterExternalMatterAccessories = (accessories: MatterAccessory[], track?: MatterWorkTracker): void => {
    track?.(this.handleUnregisterExternalAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to unregister external Matter accessories:', error)
    }))
  }

  private readonly _onUpdateMatterAccessoryState = (uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string, track?: MatterWorkTracker): void => {
    const work = this.handleUpdateAccessoryState(uuid, cluster, attributes, partId).catch((error) => {
      // In externalsOnly mode the real handler is attached but the bridge node
      // never started, so a state update for a non-external accessory is an
      // expected "wrong target", not a failure. Mirror the message-handler path
      // and log it at debug instead of surfacing a red error line.
      if (error instanceof MatterAccessoryNotOnBridgeError) {
        // Without a bridge node that is the normal case. With one, the plugin
        // has updated an accessory it never registered (or has unregistered).
        if (this.externalsOnlyMode) {
          log.debug(`Ignoring Matter state update for ${uuid}: accessory is not on this bridge`)
        } else {
          log.warn(`Ignoring Matter state update for ${uuid} (${cluster}): no accessory with this UUID is registered on this bridge`)
        }
        return
      }
      log.error(`Failed to update Matter accessory state for ${uuid}:`, error)
    })
    track?.(work)
  }

  // Stored references so listeners can be removed in teardown()
  private readonly _onMatterServerStateChange = ({ uuid, cluster, state, partId }: { uuid: string, cluster: string, state: Record<string, unknown>, partId?: string }): void => {
    sendToParent({
      id: 'matterEvent',
      data: {
        type: 'accessoryUpdate',
        data: { uuid, cluster, state, partId },
      },
    })
  }

  private _onCommissioningStatusChanged?: (commissioned: boolean, fabricCount: number) => void

  // Drop-stub handlers for bridged Matter events when in externalsOnly mode.
  // Attached only in externalsOnly mode so plugin authors get a debug-level
  // log when registering bridged accessories that the bridge node would
  // otherwise have hosted.
  private readonly _onRegisterMatterPlatformAccessoriesDropped = (pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): void => {
    log.debug(`Child bridge ${this.bridgeConfig.username} externalsOnly mode: dropping ${accessories.length} bridged Matter accessor${accessories.length === 1
      ? 'y'
      : 'ies'} from ${pluginIdentifier} (bridge node is not running).`)
  }

  private readonly _onUnregisterMatterPlatformAccessoriesDropped = (pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): void => {
    log.debug(`Child bridge ${this.bridgeConfig.username} externalsOnly mode: dropping unregistration for ${accessories.length} bridged Matter accessor${accessories.length === 1
      ? 'y'
      : 'ies'} from ${pluginIdentifier} (bridge node is not running).`)
  }

  // True when this manager was initialised in externalsOnly mode. Determines
  // which listeners were attached, so teardown removes the correct ones.
  private externalsOnlyMode = false

  // The pending poll of runServerWhenSettled(), so teardown() can stop it.
  private deferOnlineTimer?: ReturnType<typeof setTimeout>

  // True once the normal-mode API listeners are attached (see setupEventListeners).
  private eventListenersAttached = false

  /**
   * Initialize Matter server for child bridge. Three states:
   *
   * 1. Disabled (matter absent, or `enabled: false` without `externalsOnly`) → return early.
   * 2. externalsOnly mode (`enabled: false` + `externalsOnly: true`) → attach
   *    listeners for external publishing AND debug-log drop stubs for bridged
   *    matter events, but do NOT start the bridge MatterServer.
   * 3. Normal (`enabled !== false`) → full setup including server startup.
   *
   * @param onCommissioningChanged Optional callback when commissioning status changes
   */
  async initialize(onCommissioningChanged?: () => void): Promise<void> {
    // 1. Disabled or absent → nothing to do.
    if (!this.matterConfig) {
      return
    }
    if (this.matterConfig.enabled === false && !this.matterConfig.externalsOnly) {
      return
    }

    // 2. externalsOnly mode → attach external + drop-stub listeners, skip the
    //    bridge server. api.matter was loaded earlier so plugins can call
    //    publishExternalAccessories. Each external creates its own dedicated
    //    MatterServer (see ExternalMatterAccessoryPublisher), independent of
    //    the bridge node.
    if (this.matterConfig.externalsOnly === true) {
      log.info(`Child bridge ${this.bridgeConfig.username}: Matter externalsOnly mode — bridge node will not start, but external Matter accessories can still publish.`)
      this.externalsOnlyMode = true
      this.setupExternalEventListeners()
      this.setupBridgedDropStubs()
      return
    }

    // 3. Normal mode → existing full setup follows.
    log.debug(`Child bridge ${this.bridgeConfig.username} has Matter config (Combined HAP+Matter), starting Matter server`)

    try {
      // If Matter doesn't have a port configured, allocate one
      if (!this.matterConfig.port) {
        // Generate a unique username for Matter port allocation
        const matterUsername = appendUsernameSuffix(this.bridgeConfig.username, 'MATTER')
        // Use the Matter port allocator (falls back to 5530-5541 when no range is
        // configured), NOT requestPort() which draws from the HAP external-port
        // pool and returns undefined unless `ports` is set.
        const matterPort = await this.externalPortService.requestMatterPort(matterUsername)

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
    } catch (error: unknown) {
      this.handleBridgeStartFailure(error)
      return
    }

    // Listen for commissioning status changes to update parent process
    if (onCommissioningChanged && this.matterServer) {
      this._onCommissioningStatusChanged = (commissioned, fabricCount) => {
        log.info(`Matter commissioning status changed for child bridge ${this.bridgeConfig.username}: commissioned=${commissioned}, fabricCount=${fabricCount}`)
        onCommissioningChanged()
      }
      this.matterServer.on('commissioning-status-changed', this._onCommissioningStatusChanged)
    }

    // Listen for state changes and forward to parent process
    if (this.matterServer) {
      this.matterServer.on('stateChange', this._onMatterServerStateChange)
    }
  }

  /**
   * The Matter server of this child bridge did not start. Same as on the main
   * bridge: the error is logged and the bridge carries on, so its HomeKit side
   * is not taken down with it. Before this the error ended the child process,
   * which was then restarted four times and switched off.
   *
   * The reason is kept, so a plugin that registers a Matter accessory is told
   * why it can not, and the status sent to the parent says `startFailed`.
   */
  private handleBridgeStartFailure(error: unknown): void {
    log.error(`Failed to initialize Matter server for child bridge ${this.bridgeConfig.username}:`, error)

    const errorMessage = error instanceof Error
      ? error.message
      : String(error)

    // A server that never ran is not kept: the bridge would report Matter as
    // enabled with no pairing codes, and tell every plugin "still starting"
    // for the rest of the run. Its port stays reserved: it may be the very
    // port another program holds.
    const failedServer = this.matterServer
    this.matterServer = undefined
    this.bridgeStartFailure = errorMessage
    failedServer?.stop().catch((stopError: unknown) => {
      log.debug('Could not stop the Matter server that failed to start:', stopError)
    })

    // External accessories have a server of their own and can still publish,
    // so the listeners are attached when the failed start did not get that far.
    if (!this.eventListenersAttached) {
      this.setupEventListeners()
    }

    if (getErrorCode(error) === 'EADDRINUSE' || errorMessage.includes('address already in use')) {
      log.error(`Matter port ${this.matterConfig?.port} is already in use by another application.`)
      log.error('To fix this, stop the application using this port, or set a different port for this child bridge in your config.json: "_bridge": { "matter": { "port": <different-port> } }')
    }
    log.error('Matter is not running on this child bridge. Its HomeKit accessories are not affected.')
  }

  /**
   * Start Matter server for child bridge
   */
  private async startMatterServer(matterConfig: MatterConfig): Promise<void> {
    log.debug(`Starting Matter server for child bridge ${this.bridgeConfig.username}`)

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
      hideQRCode: this.bridgeOptions.hideQRCode,
      manufacturer: this.bridgeConfig.manufacturer || DEFAULT_BRIDGE_DEFAULTS.manufacturer,
      model: this.bridgeConfig.model || DEFAULT_BRIDGE_DEFAULTS.model,
      firmwareRevision: this.bridgeConfig.firmwareRevision || getVersion(),
      serialNumber,
      networkInterfaces,
      disableIpv4: matterConfig.disableIpv4,
      // Build the node fully (accessory cache restored, initial plugin
      // registrations applied offline) before it goes online, so a
      // commissioned controller's subscription re-establishment - which runs
      // once, right after the node comes online, with a short per-peer
      // connection timeout - is not aborted by registration transactions.
      deferOnline: true,
    })

    await this.matterServer.start()

    // Said once the server has started, as on the main bridge: a failed start
    // must not be followed by "is running".
    log.success('Homebridge v%s (Matter.js v%s) (%s) is running on port %s.', getVersion(), getMatterJsVersion(), this.bridgeConfig.name, matterConfig.port)

    // Inform the API that Matter is enabled
    this.api._setMatterEnabled(true)

    // Set the Matter server reference for API methods like getAccessoryState
    this.api._setMatterServer(this.matterServer)

    const commissioningInfo = this.matterServer.getCommissioningInfo()
    // The pairing codes are not repeated here: the server prints them once, in its own banner.
    log.info(`Matter server started for child bridge ${this.bridgeConfig.username}`)

    // Store the serial number for status updates
    this.matterSerialNumber = commissioningInfo.serialNumber

    // Set up event listeners for Matter API calls
    this.setupEventListeners()

    // Deferred-online: bring the node online once the initial plugin
    // registration burst has settled.
    this.runServerWhenSettled(this.matterServer)
  }

  /**
   * Poll until plugin registrations have been idle for DEFER_ONLINE_SETTLE_MS
   * (capped at DEFER_ONLINE_CAP_MS so a stuck or registration-less plugin
   * cannot keep the bridge offline), then bring the deferred node online.
   */
  private runServerWhenSettled(server: MatterServer): void {
    const deferStartedAt = Date.now()

    const check = (): void => {
      // Stop polling if the server was torn down (or replaced) mid-defer.
      if (this.matterServer !== server) {
        return
      }

      // Settle once no registration has started or been in flight for the
      // settle window. A bridge that never registers (or restores purely from
      // the accessory cache) settles the window after deferStartedAt, so it
      // goes online promptly rather than waiting for the cap.
      const idleSince = Math.max(server.getLastRegistrationAt(), deferStartedAt)
      const settled = server.getRegistrationsInFlight() === 0 && Date.now() - idleSince >= DEFER_ONLINE_SETTLE_MS
      const capped = Date.now() - deferStartedAt >= DEFER_ONLINE_CAP_MS

      if (!settled && !capped) {
        this.deferOnlineTimer = setTimeout(check, DEFER_ONLINE_POLL_MS)
        return
      }

      this.deferOnlineTimer = undefined

      if (capped && !settled) {
        log.warn(`Deferred Matter start: no registrations settled within ${DEFER_ONLINE_CAP_MS / 1000}s - going online anyway`)
      }
      server.runServer().catch((error) => {
        log.error('Deferred Matter server start failed:', error)
      })
    }

    this.deferOnlineTimer = setTimeout(check, DEFER_ONLINE_POLL_MS)
  }

  /**
   * Set up all Matter API event listeners (external + bridged). Used in
   * normal mode where the bridge MatterServer is running.
   */
  private setupEventListeners(): void {
    this.eventListenersAttached = true
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
   * Handle external Matter accessories - each gets its own dedicated Matter server
   * This is required for devices like Robotic Vacuum Cleaners that Apple Home
   * requires to be on their own bridge.
   */
  async handlePublishExternalAccessories(accessories: InternalMatterAccessory[], registrationId: string): Promise<void> {
    log.info(`Publishing ${accessories.length} external Matter accessor${accessories.length === 1
      ? 'y'
      : 'ies'} from child bridge ${this.bridgeConfig.username}`)

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
            hideQRCode: this.bridgeOptions.hideQRCode,
            disableIpv4: this.matterConfig?.disableIpv4,
          })

          if (!result) {
            // Validation or publishing failed (errors already logged by helper)
            continue
          }

          // Store the server instance (with the UI's monitoring setting)
          this.addExternalMatterServer(accessory.UUID, result.server)

          // Listen for state changes and forward to parent process
          // (same pattern as the child bridge server listener in initialize())
          result.server.on('stateChange', this._onMatterServerStateChange)

          // Register the external bridge username with parent process for routing
          // Send via IPC to parent - parent will register in externalMatterBridgeRegistry
          sendToParent({
            id: 'matterEvent',
            data: {
              type: 'externalBridgeRegistration',
              data: {
                externalBridgeUsername: result.username,
                childBridgeUsername: this.bridgeConfig.username,
              },
            },
          })

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
    if (!this.matterConfig) {
      return undefined
    }

    // Matter is configured but its server did not start: say so, with no
    // pairing codes, instead of looking like a bridge that has no Matter.
    if (!this.matterServer) {
      return this.bridgeStartFailure !== undefined
        ? {
            commissioned: false,
            deviceCount: 0,
            fabricCount: 0,
            fabrics: [],
            startFailed: true,
          }
        : undefined
    }

    const commissioningInfo = this.matterServer.getCommissioningInfo()

    // The fabric list and commissioned state come from the coalesced snapshot,
    // which treats the fabric list as the source of truth. isCommissioned()
    // trusts the serverNode's commissioning flag first, and that flag can lag
    // behind a controller-side removal — reporting "commissioned" with zero
    // fabrics until the next restart (#3974).
    const snapshot = this.matterServer.getCommissioningSnapshot()

    return {
      qrCode: commissioningInfo.qrCode,
      manualPairingCode: commissioningInfo.manualPairingCode,
      serialNumber: this.matterSerialNumber || commissioningInfo.serialNumber,
      commissioned: snapshot.commissioned,
      deviceCount: this.matterServer.getAccessories().length,
      fabricCount: snapshot.fabricCount,
      fabrics: snapshot.fabrics,
    }
  }

  /**
   * Check if Matter is enabled for this child bridge
   */
  isMatterEnabled(): boolean {
    return this.matterServer !== undefined
  }

  /**
   * Whether this child bridge has Matter active in any form that can serve UI
   * requests (control / list / accessory-info / state monitoring). This is true
   * when the bridge Matter server is running OR when in externalsOnly mode,
   * where external accessories publish via their own per-accessory servers even
   * though the bridge node never starts. The message handler must gate on this
   * (not `isMatterEnabled()`, which is false in externalsOnly) so external
   * accessories on an externalsOnly child remain controllable and listable.
   */
  override hasActiveMatter(): boolean {
    // A bridge server that failed to start still counts, as on the main
    // bridge: the listeners are attached, external accessories can still
    // publish, and a bridged registration gets the true reason.
    return this.isMatterEnabled() || this.externalsOnlyMode || this.bridgeStartFailure !== undefined
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
      accessories.push(...this.collectAccessoriesFromServer(this.matterServer, {
        username: this.bridgeConfig.username,
        type: 'child',
        name: this.bridgeConfig.name || 'Child Bridge',
      }))
    }

    // Collect from external servers
    for (const server of this.externalMatterServers.values()) {
      accessories.push(...this.collectAccessoriesFromServer(server, {
        username: server.username,
        type: 'external',
        name: server.bridgeName,
      }))
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
      const info: ServerAccessoryData | undefined = this.matterServer.getAccessoryInfo(uuid)
      if (info) {
        return this.toAccessoryInfo(this.matterServer, info, this.matterServer.getCommissioningSnapshot(), {
          username: this.bridgeConfig.username,
          type: 'child',
          name: this.bridgeConfig.name || 'Child Bridge',
        })
      }
    }

    // Check external servers
    for (const server of this.externalMatterServers.values()) {
      const info: ServerAccessoryData | undefined = server.getAccessoryInfo(uuid)
      if (info) {
        return this.toAccessoryInfo(server, info, server.getCommissioningSnapshot(), {
          username: server.username,
          type: 'external',
          name: server.bridgeName || 'Matter Bridge',
        })
      }
    }

    return undefined
  }

  /**
   * The accessories of one server, as the UI gets them.
   */
  private collectAccessoriesFromServer(server: MatterServer, bridge: AccessoryInfo['bridge']): AccessoryInfo[] {
    const serverAccessories: ServerAccessoryData[] = server.collectAccessories(bridge.username, bridge.type, bridge.name)
    // Fabric/commissioning state is server-wide: read it once per server.
    const snapshot = server.getCommissioningSnapshot()
    return serverAccessories.map(accessory => this.toAccessoryInfo(server, accessory, snapshot, bridge))
  }

  /**
   * Add what the server's own accessory object leaves out, so a child bridge
   * sends the UI the same fields as the main bridge does: the bridge, the
   * plugin and platform, the plugin's context, and the commissioning state.
   * Before, those fields were missing, while the return type said they were there.
   */
  private toAccessoryInfo(
    server: MatterServer,
    accessory: ServerAccessoryData,
    snapshot: CommissioningSnapshot,
    bridge: AccessoryInfo['bridge'],
  ): AccessoryInfo {
    const cached = server.getCachedAccessory(accessory.uuid)

    return {
      ...accessory,
      bridge,
      plugin: cached?.plugin ?? '',
      platform: cached?.platform ?? '',
      context: cached?.context,
      commissioned: snapshot.commissioned,
      fabricCount: snapshot.fabricCount,
      // Same mapping as the main bridge: matter.js names the vendor rootVendorId.
      fabrics: snapshot.fabrics.map(fabric => ({
        fabricIndex: fabric.fabricIndex,
        fabricId: fabric.fabricId,
        nodeId: fabric.nodeId,
        vendorId: fabric.rootVendorId,
        label: fabric.label,
      })),
    }
  }

  /**
   * Teardown Matter servers
   */
  async teardown(): Promise<void> {
    // Stop waiting to bring the node online. The poll used to go on after a
    // teardown and call runServer() on a server that was stopping or stopped:
    // a quick restart logged "Deferred Matter server start failed".
    if (this.deferOnlineTimer) {
      clearTimeout(this.deferOnlineTimer)
      this.deferOnlineTimer = undefined
    }

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

    // Stop main Matter server if it was initialized. The reference is dropped
    // first: this manager no longer has a bridge server once it is torn down.
    const matterServer = this.matterServer
    this.matterServer = undefined
    if (matterServer) {
      log.debug(`Stopping Matter server for child bridge ${this.bridgeConfig.username}`)
      try {
        matterServer.removeListener('stateChange', this._onMatterServerStateChange)
        if (this._onCommissioningStatusChanged) {
          matterServer.removeListener('commissioning-status-changed', this._onCommissioningStatusChanged)
        }
        await matterServer.stop()
      } catch (error: unknown) {
        log.error('Error stopping Matter server:', error)
      }
    }

    // Stop all external Matter servers
    for (const [uuid, matterServer] of this.externalMatterServers) {
      log.debug(`Stopping external Matter server for ${uuid}`)
      try {
        matterServer.removeListener('stateChange', this._onMatterServerStateChange)
        await matterServer.stop()
      } catch (error: unknown) {
        log.error(`Error stopping external Matter server for ${uuid}:`, error)
      }
    }
    this.externalMatterServers.clear()
  }
}
