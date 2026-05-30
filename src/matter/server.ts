/**
 * Matter.js Server Implementation for Homebridge Plugin API
 *
 * This is a thin facade that delegates to focused submodules under ./server/.
 * All public method signatures are preserved for external callers.
 */

import type { ServerNode } from '@matter/main'

import type { SerializedMatterAccessory } from './accessoryCache.js'
import type { MatterServerConfig } from './sharedTypes.js'

import { EventEmitter } from 'node:events'

import { Endpoint,
  Logger as MatterLogger,
  LogLevel as MatterLogLevel } from '@matter/main'

import { Logger } from '../logger.js'
import { MatterAccessoryCache } from './accessoryCache.js'
import { BehaviorRegistry, RegistryManager } from './behaviors/index.js'
import { createHomebridgeLogFormatter } from './logFormatter.js'
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
  clusters,
  deviceTypes,
  InternalMatterAccessory,
  MatterAccessory,
  MatterServerEvents,
} from './types.js'

const log = Logger.withPrefix('Matter/Server')
const NON_HEX_RE = /[^A-F0-9]/gi
const HEX_PAIR_RE = /.{1,2}/g

/**
 * Matter Server for Homebridge Plugin API
 * Allows plugins to register Matter accessories explicitly
 */
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
  private shutdownHandler: (() => Promise<void>) | null = null
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
    this.bridgeName = this.config.serialNumber ? `Matter Bridge ${this.config.serialNumber}` : 'Matter Bridge'

    // Configure Matter.js library logging
    if (this.config.debugModeEnabled) {
      log.info('Matter debug mode enabled - verbose logging active')
      MatterLogger.level = MatterLogLevel.DEBUG
    } else {
      MatterLogger.level = MatterLogLevel.NOTICE
    }

    MatterLogger.format = createHomebridgeLogFormatter()

    MatterLogger.destinations.default.write = (text: string) => {
      if (text.trim() !== '') {
        console.log(text) // eslint-disable-line no-console
      }
    }

    // Initialize sub-modules
    this.commissioningManager = new CommissioningManager()

    this.fabricManager = new FabricManager(
      () => this.serverNode,
      () => this.serverLifecycle.matterStoragePath,
    )

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

  async registerPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): Promise<void> {
    for (const accessory of accessories) {
      await this.accessoryManager.registerAccessory(pluginIdentifier, platformName, accessory, this.getAccessoryManagerDeps())
    }
  }

  async unregisterAccessory(uuid: string): Promise<void> {
    return this.accessoryManager.unregisterAccessory(uuid, this.getAccessoryManagerDeps())
  }

  async unregisterPlatformAccessories(_pluginIdentifier: string, _platformName: string, accessories: MatterAccessory[]): Promise<void> {
    for (const accessory of accessories) {
      await this.accessoryManager.unregisterAccessory(accessory.UUID, this.getAccessoryManagerDeps())
    }
  }

  async updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void> {
    if (!this.accessoryCache) {
      log.warn('Cannot update Matter platform accessories - cache not initialized')
      return
    }

    for (const accessory of accessories) {
      const internal = accessory as InternalMatterAccessory

      if (!this.accessories.has(accessory.UUID)) {
        log.warn(`Cannot update Matter accessory ${accessory.UUID} - not registered in current session`)
        continue
      }

      if (!this.accessoryCache.hasCached(accessory.UUID)) {
        log.warn(`Cannot update Matter accessory ${accessory.UUID} - not found in cache`)
        continue
      }

      this.accessories.set(accessory.UUID, internal)
      log.debug(`Updated Matter accessory ${accessory.UUID} (${accessory.displayName})`)
    }

    this.accessoryCache.requestSave(this.accessories)
  }

  // ============================================================================
  // State management (Plugin API)
  // ============================================================================

  async updateAccessoryState(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
    return this.stateManager.updateAccessoryState(uuid, cluster, attributes, partId)
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

  collectAccessories(bridgeUsername: string, bridgeType: string, bridgeName: string): any[] {
    return this.accessoryQuery.collectAccessories(bridgeUsername, bridgeType, bridgeName)
  }

  getAccessoryInfo(uuid: string): any | undefined {
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

  getServerInfo(): {
    running: boolean
    port: number
    deviceCount: number
    commissioned: boolean
    fabricCount: number
    serialNumber?: string
  } {
    return {
      running: this.isRunning,
      port: this.config.port || 5540,
      deviceCount: this.accessories.size,
      commissioned: this.isCommissioned(),
      fabricCount: this.getCommissionedFabricCount(),
      serialNumber: this.config.serialNumber || this.config.uniqueId,
    }
  }

  getStorageStats(): null {
    // Storage is now managed natively by matter.js
    return null
  }

  isServerRunning(): boolean {
    return this.isRunning
  }

  getDeviceTypes(): typeof deviceTypes {
    return deviceTypes
  }

  getClusters(): typeof clusters {
    return clusters
  }

  enableStateMonitoring(): void {
    this.monitoringEnabled = true
    log.debug('Matter state monitoring enabled')
  }

  disableStateMonitoring(): void {
    this.monitoringEnabled = false
    log.debug('Matter state monitoring disabled')
  }

  isMonitoringEnabled(): boolean {
    return this.monitoringEnabled
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
      setServerNode: (node: ServerNode | null) => {
        this.serverNode = node
      },
      getServerNode: () => this.serverNode,
      setAggregator: (agg: any) => {
        this.aggregator = agg
      },
      getAggregator: () => this.aggregator,
      setIsRunning: (running: boolean) => {
        this.isRunning = running
      },
      getIsRunning: () => this.isRunning,
      cleanupHandlers: this.cleanupHandlers,
      getShutdownHandler: () => this.shutdownHandler,
      setShutdownHandler: (handler: (() => Promise<void>) | null) => {
        this.shutdownHandler = handler
      },
      onStop: () => this.stop(),
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
