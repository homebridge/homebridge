/**
 * Matter.js Server Implementation for Homebridge Plugin API
 *
 * This is a thin facade that delegates to focused submodules under ./server/.
 * All public method signatures are preserved for external callers.
 */

import type { EndpointType, ServerNode } from '@matter/main'

import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { AccessoryInfo, ServerAccessoryData, ServerAccessoryListEntry } from './managerTypes.js'
import type { MatterServerConfig } from './sharedTypes.js'

import { EventEmitter } from 'node:events'

import { Endpoint,
  Logger as MatterLogger,
  LogLevel as MatterLogLevel } from '@matter/main'

import { Logger } from '../logger.js'
import { MatterAccessoryCache } from './accessoryCache.js'
import { BehaviorRegistry, RegistryManager } from './behaviors/index.js'
import { applyDeclaredClusterFeatures } from './clusterFeatures.js'
import { createHomebridgeLogFormatter, QUIET_FACILITY_LEVELS } from './logFormatter.js'
import {
  AccessoryManager,
  AccessoryQuery,
  CommissioningManager,
  FabricManager,
  ServerLifecycle,
  StateManager,
  validateAndSanitizeConfig,
} from './server/index.js'
import {
  deviceTypes,
  InternalMatterAccessory,
  MatterAccessory,
  MatterServerEvents,
} from './types.js'

const log = Logger.withPrefix('Matter/Server')

/** The fields `updatePlatformAccessories` takes from the plugin's object. */
const UPDATABLE_ACCESSORY_FIELDS = [
  'displayName',
  'context',
  'manufacturer',
  'model',
  'serialNumber',
  'firmwareRevision',
  'hardwareRevision',
  'softwareVersion',
] as const satisfies readonly (keyof MatterAccessory)[]
const NON_HEX_RE = /[^A-F0-9]/gi
const HEX_PAIR_RE = /.{1,2}/g

/**
 * Matter Server for Homebridge Plugin API
 * Allows plugins to register Matter accessories explicitly
 */
/**
 * A plugin's cached context, without the flag older versions of Homebridge
 * wrote into it for their own use.
 */
function withoutInternalFlags(context: Record<string, unknown> | undefined): Record<string, unknown> {
  const pluginContext = { ...context }
  delete pluginContext._skipWindowCoveringBehavior
  return pluginContext
}

export class MatterServer extends EventEmitter {
  // Typed event emitter methods
  public declare on: <K extends keyof MatterServerEvents>(event: K, listener: MatterServerEvents[K]) => this
  public declare emit: <K extends keyof MatterServerEvents>(event: K, ...args: Parameters<MatterServerEvents[K]>) => boolean
  public declare removeListener: <K extends keyof MatterServerEvents>(event: K, listener: MatterServerEvents[K]) => this
  public declare removeAllListeners: (event?: keyof MatterServerEvents) => this

  // --- Internal state ---
  private readonly config: MatterServerConfig
  private serverNode: ServerNode | null = null
  private aggregator: Endpoint<typeof import('@matter/main/endpoints').AggregatorEndpoint> | null = null
  private accessories: Map<string, InternalMatterAccessory> = new Map()
  private readonly behaviorRegistry: BehaviorRegistry
  private readonly registryManager: RegistryManager
  private isRunning = false
  // matter.js took the node offline without being asked (an internal error)
  private stoppedByItself = false
  private lastRegistrationAt = 0
  private registrationsInFlight = 0
  private cleanupHandlers: Array<() => void | Promise<void>> = []
  private accessoryCache: MatterAccessoryCache | null = null
  private monitoringEnabled = false

  // Public properties for bridge identification
  public username: string
  public bridgeName: string

  // --- Sub-modules ---
  private readonly commissioningManager: CommissioningManager
  private readonly fabricManager: FabricManager
  private readonly serverLifecycle: ServerLifecycle
  private readonly stateManager: StateManager
  private readonly accessoryManager: AccessoryManager
  private readonly accessoryQuery: AccessoryQuery

  constructor(config: MatterServerConfig) {
    super()

    // Store the validated config
    this.config = validateAndSanitizeConfig(config)

    // Initialize bridge identification properties
    const cleanId = this.config.uniqueId.replace(NON_HEX_RE, '')
    this.username = cleanId.match(HEX_PAIR_RE)?.slice(0, 6).join(':').toUpperCase() || this.config.uniqueId
    this.bridgeName = this.config.serialNumber
      ? `Matter Bridge ${this.config.serialNumber}`
      : 'Matter Bridge'

    // Configure Matter.js library logging
    if (this.config.debugModeEnabled) {
      log.info('Matter debug mode enabled - verbose logging active')
      MatterLogger.level = MatterLogLevel.DEBUG
    } else {
      MatterLogger.level = MatterLogLevel.NOTICE
    }

    MatterLogger.facilityLevels = { ...QUIET_FACILITY_LEVELS }
    MatterLogger.format = createHomebridgeLogFormatter({ debug: this.config.debugModeEnabled })

    // Warnings and errors go to stderr and the rest to stdout, the same split
    // Homebridge's own logger makes. All on stdout, a tool that reads the two
    // streams apart filed matter.js errors as normal output.
    MatterLogger.destinations.default.write = (text: string, message?: { level?: number }) => {
      if (text.trim() === '') {
        return
      }
      if (message?.level !== undefined && message.level >= MatterLogLevel.WARN) {
        console.error(text)
      } else {
        console.log(text) // eslint-disable-line no-console
      }
    }

    // Initialize sub-modules
    this.commissioningManager = new CommissioningManager()

    this.fabricManager = new FabricManager(() => this.serverNode)

    this.serverLifecycle = new ServerLifecycle()

    this.behaviorRegistry = new BehaviorRegistry(this.accessories, this)
    this.registryManager = new RegistryManager()

    this.stateManager = new StateManager(
      this.accessories,
      this,
      () => this.monitoringEnabled,
    )

    this.accessoryManager = new AccessoryManager()

    this.accessoryQuery = new AccessoryQuery(
      this.accessories,
      () => this.accessoryCache,
    )
  }

  // ============================================================================
  // Lifecycle methods
  // ============================================================================

  async start(): Promise<void> {
    return this.serverLifecycle.start(this.getLifecycleDeps())
  }

  public async runServer(): Promise<void> {
    return this.serverLifecycle.runServer(this.getLifecycleDeps())
  }

  async stop(): Promise<void> {
    return this.serverLifecycle.stop(this.getLifecycleDeps(), this.accessories)
  }

  // ============================================================================
  // Accessory registration (Plugin API - matches HAP pattern)
  // ============================================================================

  /**
   * When the last registerPlatformAccessories() call arrived. The
   * deferred-online settle loop (ChildBridgeMatterManager) polls this to
   * detect when the initial registration burst has gone idle.
   */
  getLastRegistrationAt(): number {
    return this.lastRegistrationAt
  }

  /** Registration calls that have started but not finished; used by the deferred-online settle check. */
  getRegistrationsInFlight(): number {
    return this.registrationsInFlight
  }

  async registerPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): Promise<void> {
    // Stamp on both entry and exit and track in-flight calls so the deferred-
    // online settle check never treats a batch that is still registering (or
    // one that takes longer than the settle window) as idle.
    this.registrationsInFlight++
    this.lastRegistrationAt = Date.now()
    try {
      for (const accessory of accessories) {
        // One accessory the bridge refuses (a duplicate UUID, a value Matter
        // does not allow) must not stop the ones after it in the same call.
        // registerAccessory has logged the reason.
        try {
          await this.accessoryManager.registerAccessory(pluginIdentifier, platformName, accessory, this.getAccessoryManagerDeps())
        } catch {
          log.warn(`Skipped Matter accessory ${accessory?.displayName ?? accessory?.UUID} - the other accessories in this call are not affected`)
        }
      }
    } finally {
      this.lastRegistrationAt = Date.now()
      this.registrationsInFlight--
    }
  }

  /**
   * Register one accessory and fail when it can not be registered. For a
   * caller that has to know: an external accessory's server is of no use
   * without its accessory.
   */
  async registerAccessory(pluginIdentifier: string, platformName: string, accessory: MatterAccessory): Promise<void> {
    this.registrationsInFlight++
    this.lastRegistrationAt = Date.now()
    try {
      await this.accessoryManager.registerAccessory(pluginIdentifier, platformName, accessory, this.getAccessoryManagerDeps())
    } finally {
      this.lastRegistrationAt = Date.now()
      this.registrationsInFlight--
    }
  }

  async unregisterAccessory(uuid: string): Promise<void> {
    return this.accessoryManager.unregisterAccessory(uuid, this.getAccessoryManagerDeps())
  }

  async unregisterPlatformAccessories(_pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): Promise<void> {
    for (const accessory of accessories) {
      // As for a registration: one failure does not stop the rest of the call
      try {
        await this.accessoryManager.unregisterAccessory(accessory.UUID, this.getAccessoryManagerDeps())
      } catch {
        log.warn(`Could not unregister Matter accessory ${accessory?.displayName ?? accessory?.UUID} - the other accessories in this call are not affected`)
      }
    }
  }

  async updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void> {
    if (!this.accessoryCache) {
      log.warn('Cannot update Matter platform accessories - cache not initialized')
      return
    }

    for (const accessory of accessories) {
      if (!this.accessories.has(accessory.UUID)) {
        log.warn(`Cannot update Matter accessory ${accessory.UUID} - not registered in current session`)
        continue
      }

      // An update is for the name, the device information and the context,
      // as it is for a HAP accessory. Nothing else is taken: a plugin often
      // passes the object it was given in configureMatterAccessory, which has
      // the cache's plain copy of the device type, parts with no handlers and
      // the state of the last save. Those replaced the live ones, and the
      // next save wrote the damage to the cache.
      const existing = this.accessories.get(accessory.UUID)
      if (!existing) {
        continue
      }
      const updated: InternalMatterAccessory = { ...existing }
      for (const field of UPDATABLE_ACCESSORY_FIELDS) {
        if (accessory[field] !== undefined) {
          (updated as unknown as Record<string, unknown>)[field] = accessory[field]
        }
      }
      this.accessories.set(accessory.UUID, updated)
      await this.accessoryManager.updateBridgedInformation(updated.endpoint, updated, this.config)
      log.debug(`Updated Matter accessory ${accessory.UUID} (${updated.displayName})`)
    }

    this.accessoryCache.requestSave(this.accessories)
  }

  // ============================================================================
  // State management (Plugin API)
  // ============================================================================

  async updateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string, options?: { callHandlers?: boolean }): Promise<void> {
    return this.stateManager.updateAccessoryState(uuid, cluster, attributes, partId, options)
  }

  getAccessoryState(uuid: string, cluster: string, partId?: string): Record<string, unknown> | undefined {
    return this.stateManager.getAccessoryState(uuid, cluster, partId)
  }

  async triggerCommand(uuid: string, cluster: string, command: string, args?: Record<string, unknown>, partId?: string): Promise<void> {
    return this.stateManager.triggerCommand(uuid, cluster, command, args, partId)
  }

  // ============================================================================
  // Accessory queries
  // ============================================================================

  getAccessories(): MatterAccessory[] {
    return this.accessoryQuery.getAccessories()
  }

  getAccessory(uuid: string): MatterAccessory | undefined {
    return this.accessoryQuery.getAccessory(uuid)
  }

  getAllCachedAccessories(): SerializedMatterAccessory[] {
    return this.accessoryQuery.getAllCachedAccessories()
  }

  getCachedAccessory(uuid: string): SerializedMatterAccessory | undefined {
    return this.accessoryQuery.getCachedAccessory(uuid)
  }

  getLiveState(uuid: string, partId?: string): Record<string, Record<string, unknown>> {
    return this.accessoryQuery.getLiveState(uuid, partId)
  }

  collectAccessories(bridgeUsername: string, bridgeType: AccessoryInfo['bridge']['type'], bridgeName: string): ServerAccessoryListEntry[] {
    return this.accessoryQuery.collectAccessories(bridgeUsername, bridgeType, bridgeName)
  }

  getAccessoryInfo(uuid: string): ServerAccessoryData | undefined {
    return this.accessoryQuery.getAccessoryInfo(uuid)
  }

  // ============================================================================
  // Fabric management
  // ============================================================================

  getFabricInfo() {
    return this.fabricManager.getFabricInfo()
  }

  isCommissioned(): boolean {
    return this.fabricManager.isCommissioned()
  }

  getCommissionedFabricCount(): number {
    return this.fabricManager.getCommissionedFabricCount()
  }

  getCommissioningSnapshot() {
    return this.fabricManager.getCommissioningSnapshot()
  }

  async removeFabric(fabricIndex: number): Promise<void> {
    return this.fabricManager.removeFabric(fabricIndex)
  }

  hasFabric(fabricIndex: number): boolean {
    return this.fabricManager.hasFabric(fabricIndex)
  }

  // ============================================================================
  // Commissioning info
  // ============================================================================

  getCommissioningInfo(): {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    passcode?: number
    discriminator?: number
    commissioned: boolean
  } {
    return {
      ...this.commissioningManager.commissioningInfo,
      serialNumber: this.config.serialNumber || this.config.uniqueId,
      passcode: this.commissioningManager.passcode,
      discriminator: this.commissioningManager.discriminator,
      commissioned: this.isCommissioned(),
    }
  }

  // ============================================================================
  // Server info & monitoring
  // ============================================================================

  isServerRunning(): boolean {
    return this.isRunning
  }

  /**
   * True while the node is built but deliberately kept offline in deferOnline
   * mode, waiting for the initial registration burst to settle. Registrations
   * are expected in this window, so callers must not treat it as "starting".
   * The aggregator check keeps this false before start() has built the node
   * (and when start() failed) - registrations in that gap must be rejected as
   * "starting", or they would be silently dropped (#3970).
   */
  isDeferredPreOnline(): boolean {
    return this.config.deferOnline === true && !this.isRunning && this.aggregator !== null && !this.stoppedByItself
  }

  /**
   * True once matter.js has taken this server's node offline without
   * Homebridge asking, which it does after an internal error. Nothing starts
   * the server again in this run.
   */
  hasStoppedByItself(): boolean {
    return this.stoppedByItself
  }

  enableStateMonitoring(): void {
    this.monitoringEnabled = true
    log.debug('Matter state monitoring enabled')
  }

  disableStateMonitoring(): void {
    this.monitoringEnabled = false
    log.debug('Matter state monitoring disabled')
  }

  notifyStateChange(uuid: string, cluster: string, state: Record<string, unknown>, partId?: string): void {
    this.stateManager.notifyStateChange(uuid, cluster, state, partId)
  }

  // ============================================================================
  // Internal dependency builders for sub-modules
  // ============================================================================

  private getCommissioningDeps() {
    return {
      config: this.config,
      serverNode: this.serverNode,
      matterStoragePath: this.serverLifecycle.matterStoragePath,
      serialNumber: this.config.serialNumber || this.config.uniqueId,
      emitter: this as EventEmitter,
      fabricManager: this.fabricManager,
    }
  }

  private getLifecycleDeps() {
    return {
      config: this.config,
      commissioningManager: this.commissioningManager,
      fabricManager: this.fabricManager,
      getCommissioningDeps: () => this.getCommissioningDeps(),
      getAccessoryCache: () => this.accessoryCache,
      setAccessoryCache: (cache: MatterAccessoryCache) => {
        this.accessoryCache = cache
      },
      restoreAccessoriesFromCache: async () => {
        if (!this.accessoryCache) {
          return
        }
        let cached: Map<string, SerializedMatterAccessory>
        try {
          cached = await this.accessoryCache.load()
        } catch (error) {
          log.warn('Failed to load Matter accessory cache for pre-online restore:', error)
          return
        }
        if (cached.size === 0) {
          return
        }

        // Device types are cached by name, with the cluster features the plugin
        // chose (clusterFeatures); resolve the name back through the public
        // registry, and put the features back on top below.
        const typeByName = new Map<string, EndpointType>()
        for (const [key, value] of Object.entries(deviceTypes)) {
          typeByName.set(key, value as EndpointType)
          const name = (value as { name?: string }).name
          if (name) {
            typeByName.set(name, value as EndpointType)
          }
        }

        // Handlers are functions and cannot be cached, but custom behaviors
        // (e.g. the OnOff server on switch device types) are only attached for
        // clusters that have handlers. Synthesize an empty stub per cached
        // cluster, and per cluster the plugin had handlers for (some have
        // handlers and no state, like keypadInput), so the restored endpoint
        // carries the same behaviors as the original; the plugin's
        // re-registration supplies the real handlers.
        const stubHandlers = (clusters?: Record<string, unknown>, handlerClusters?: string[]) => {
          const handlers: Record<string, Record<string, never>> = {}
          for (const clusterName of [
            ...Object.keys(clusters ?? {}),
            ...(handlerClusters ?? []),
          ]) {
            handlers[clusterName] = {}
          }
          return Object.keys(handlers).length > 0
            ? handlers
            : undefined
        }

        let restored = 0
        for (const serialized of cached.values()) {
          // Homebridge is stopping: the start ends after this loop
          if (this.serverLifecycle.isStopRequested()) {
            break
          }
          try {
            const baseType = typeByName.get(serialized.deviceType?.name ?? '')
            // The cache names the type; the plugin's own feature choices are
            // put back on top, or the cached state may not fit the endpoint
            const deviceType = baseType && applyDeclaredClusterFeatures(baseType, serialized.deviceType?.clusterFeatures)
            if (!deviceType) {
              log.warn(`Cannot restore cached Matter accessory ${serialized.displayName}: unknown device type "${serialized.deviceType?.name}". Its cache entry is kept.`)
              this.accessoryCache.retain(serialized.uuid)
              continue
            }
            const parts = (serialized.parts ?? [])
              .map((part) => {
                const partType = typeByName.get(part.deviceType?.name ?? '')
                return {
                  id: part.id,
                  displayName: part.displayName,
                  deviceType: partType && applyDeclaredClusterFeatures(partType, part.deviceType?.clusterFeatures),
                  features: part.features,
                  clusters: part.clusters ?? {},
                  handlers: stubHandlers(part.clusters, part.handlerClusters),
                }
              })
              .filter((part): part is typeof part & { deviceType: EndpointType } => part.deviceType !== undefined)

            const accessory: InternalMatterAccessory = {
              UUID: serialized.uuid,
              displayName: serialized.displayName,
              deviceType,
              serialNumber: serialized.serialNumber,
              manufacturer: serialized.manufacturer,
              model: serialized.model,
              firmwareRevision: serialized.firmwareRevision,
              hardwareRevision: serialized.hardwareRevision,
              softwareVersion: serialized.softwareVersion,
              features: serialized.features,
              context: withoutInternalFlags(serialized.context),
              clusters: serialized.clusters ?? {},
              handlers: stubHandlers(serialized.clusters, serialized.handlerClusters),
              registered: false,
              _restoredFromCache: true,
              _associatedPlugin: serialized.plugin,
              _associatedPlatform: serialized.platform,
              _declared: serialized.declared,
            }
            if (parts.length > 0) {
              accessory.parts = parts
            }
            await this.accessoryManager.registerAccessory(serialized.plugin, serialized.platform, accessory, this.getAccessoryManagerDeps())
            restored++
          } catch (error) {
            log.warn(`Failed to restore cached Matter accessory ${serialized.displayName} (its cache entry is kept):`, error)
            // It is not on the bridge now, and a save writes what is on the
            // bridge. Hold the entry so it is written back unchanged: the
            // plugin's own registration, or a later version, can still use it.
            this.accessoryCache.retain(serialized.uuid)
          }
        }
        if (restored > 0) {
          log.info(`Restored ${restored} cached Matter accessories into the bridge before going online`)
        }
      },
      setServerNode: (node: ServerNode | null) => {
        this.serverNode = node
      },
      getServerNode: () => this.serverNode,
      setAggregator: (aggregator: MatterServer['aggregator']) => {
        this.aggregator = aggregator
      },
      getAggregator: () => this.aggregator,
      setIsRunning: (running: boolean) => {
        this.isRunning = running
      },
      getIsRunning: () => this.isRunning,
      noteStoppedByItself: () => {
        this.stoppedByItself = true
      },
      cleanupHandlers: this.cleanupHandlers,
    }
  }

  private getAccessoryManagerDeps() {
    return {
      config: this.config,
      accessories: this.accessories,
      behaviorRegistry: this.behaviorRegistry,
      registryManager: this.registryManager,
      accessoryCache: this.accessoryCache,
      getServerNode: () => this.serverNode,
      getAggregator: () => this.aggregator,
      getIsRunning: () => this.isRunning,
      getMonitoringEnabled: () => this.monitoringEnabled,
      isCommissioned: () => this.isCommissioned(),
    }
  }
}
