/* global NodeJS */

import type { MacAddress } from '@homebridge/hap-nodejs'

import type { AccessoryPlugin, PlatformPlugin } from './api.js'
import type {
  AccessoryConfig,
  BridgeConfiguration,
  BridgeOptions,
  PlatformConfig,
} from './bridgeService.js'
import type {
  ChildBridgePairedStatusEventData,
  ChildProcessLoadEventData,
  ChildProcessMessageEvent,
  ChildProcessPluginLoadedEventData,
  ChildProcessPortAllocatedEventData,
  ChildProcessPortRequestEventData,
} from './childBridgeService.js'
import type { ChildBridgeMatterManager } from './matter/index.js'
import type { MatterEvent } from './matter/ipc-types.js'
import type { Plugin } from './plugin.js'

import process from 'node:process'

import { AccessoryEventTypes, HAPStorage } from '@homebridge/hap-nodejs'

import { HomebridgeAPI, PluginType } from './api.js'
import { BridgeService, isHapConfigEnabled, isHapExternalsOnly } from './bridgeService.js'
import { ChildProcessMessageEventType } from './childBridgeService.js'
import { ChildBridgeExternalPortService } from './externalPortService.js'
import { Logger } from './logger.js'
import { ChildBridgeMatterMessageHandler } from './matter/ChildBridgeMatterMessageHandler.js'
import { isMatterActive } from './matter/config.js'
import { PluginManager } from './pluginManager.js'
import { User } from './user.js'

import 'source-map-support/register.js'

/**
 * This is a standalone script executed as a child process fork
 */

process.title = 'homebridge: child bridge'

const matterLogger = Logger.withPrefix('Matter/ChildManager')

export class ChildBridgeFork {
  private bridgeService!: BridgeService
  private api!: HomebridgeAPI
  private pluginManager!: PluginManager
  private externalPortService!: ChildBridgeExternalPortService

  // Matter bridge manager (handles Matter server lifecycle)
  private matterManager?: ChildBridgeMatterManager

  // Matter message handler (delegates Matter IPC handling)
  private matterMessageHandler?: ChildBridgeMatterMessageHandler

  private type!: PluginType
  private plugin!: Plugin
  private identifier!: string
  private pluginConfig!: Array<PlatformConfig | AccessoryConfig>
  private bridgeConfig!: BridgeConfiguration
  private bridgeOptions!: BridgeOptions

  private portRequestCallback: Map<MacAddress, (port: number | undefined) => void> = new Map()

  constructor() {
    // tell the parent process we are ready to accept plugin config
    this.sendMessage(ChildProcessMessageEventType.READY)
  }

  sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): void {
    if (process.send) {
      process.send({
        id: type,
        data,
      })
    }
  }

  async loadPlugin(data: ChildProcessLoadEventData): Promise<void> {
    // set data
    this.type = data.type
    this.identifier = data.identifier
    this.pluginConfig = data.pluginConfig
    this.bridgeConfig = data.bridgeConfig
    this.bridgeOptions = data.bridgeOptions

    // remove the _bridge key (some plugins do not like unknown config)
    for (const config of this.pluginConfig) {
      delete config._bridge
    }

    // set bridge settings (inherited from main bridge)
    if (this.bridgeOptions.noLogTimestamps) {
      Logger.setTimestampEnabled(false)
    }

    if (this.bridgeOptions.debugModeEnabled) {
      Logger.setDebugEnabled(true)
    }

    if (this.bridgeOptions.forceColourLogging) {
      Logger.forceColor()
    }

    if (this.bridgeOptions.customStoragePath) {
      User.setStoragePath(this.bridgeOptions.customStoragePath)
    }

    // Initialize HAP-NodeJS with a custom persist directory
    HAPStorage.setCustomStoragePath(User.persistPath())

    // load api
    this.api = new HomebridgeAPI()
    this.pluginManager = new PluginManager(this.api)
    this.externalPortService = new ChildBridgeExternalPortService(this)

    // Eagerly load the MatterAPI facade BEFORE plugin init when Matter is
    // active for this child bridge, so api.matter is defined when the
    // plugin's initializer runs. The heavy ChildBridgeMatterManager init
    // still happens later in startBridge(). Matter is unsupported on
    // accessory-style child bridges, so skip there.
    //
    // `isMatterActive` includes externalsOnly mode so plugins can still call
    // api.matter.publishExternalAccessories even when the bridge node itself
    // is suppressed.
    if (isMatterActive(this.bridgeConfig.matter) && this.type !== PluginType.ACCESSORY) {
      await this.api.loadMatterAPI()
    }

    // load plugin
    this.plugin = this.pluginManager.loadPlugin(data.pluginPath)
    await this.plugin.load()
    await this.pluginManager.initializePlugin(this.plugin, data.identifier)

    // change process title to include plugin name
    process.title = `homebridge: ${this.plugin.getPluginIdentifier()}`

    this.sendMessage<ChildProcessPluginLoadedEventData>(ChildProcessMessageEventType.LOADED, {
      version: this.plugin.version,
    })
  }

  async startBridge(): Promise<void> {
    // Conditionally load Matter support only if this child bridge has Matter active
    // (configured + enabled OR externalsOnly). Prevents loading heavy Matter.js
    // libraries for child bridges that don't use it.
    if (isMatterActive(this.bridgeConfig.matter) && this.type === PluginType.ACCESSORY) {
      matterLogger.warn('Matter is not supported on accessory child bridges. Ignoring matter configuration.')
    }

    if (isMatterActive(this.bridgeConfig.matter) && this.type !== PluginType.ACCESSORY) {
      matterLogger.info('Loading Matter support for child bridge...')

      // Note: api.loadMatterAPI() was already called at the start of loadPlugin()
      // so api.matter is already defined by the time the plugin's initializer ran.

      // Dynamically import Matter manager only when needed
      const { ChildBridgeMatterManager } = await import('./matter/index.js')

      // Create Matter bridge manager
      this.matterManager = new ChildBridgeMatterManager(
        this.bridgeConfig,
        this.bridgeOptions,
        this.api,
        this.externalPortService,
        this.pluginManager,
      )

      // Set manager reference on API for getAccessoryState
      this.api._setMatterManager(this.matterManager)

      // Initialize Matter server if configured
      // Pass callback to send status updates when commissioning changes
      await this.matterManager.initialize(() => {
        this.sendPairedStatusEvent()
      })

      // Create Matter message handler to delegate IPC handling
      matterLogger.debug('Creating ChildBridgeMatterMessageHandler...')
      this.matterMessageHandler = new ChildBridgeMatterMessageHandler(
        this.matterManager,
        this.bridgeConfig.username,
        (type, data) => this.sendMessage(type as ChildProcessMessageEventType, data),
      )
      matterLogger.debug(`Matter message handler created for child bridge ${this.bridgeConfig.username}`)
    } else {
      matterLogger.debug('Matter not configured for this child bridge, skipping Matter setup')
    }

    this.bridgeService = new BridgeService(
      this.api,
      this.pluginManager,
      this.externalPortService,
      this.bridgeOptions,
      this.bridgeConfig,
    )

    // watch bridge events to check when server is online
    this.bridgeService.bridge.on(AccessoryEventTypes.ADVERTISED, () => {
      this.sendPairedStatusEvent()
    })

    // watch for the paired event to update the server status
    this.bridgeService.bridge.on(AccessoryEventTypes.PAIRED, () => {
      this.sendPairedStatusEvent()
    })

    // watch for the unpaired event to update the server status
    this.bridgeService.bridge.on(AccessoryEventTypes.UNPAIRED, () => {
      this.sendPairedStatusEvent()
    })

    // load the cached accessories
    await this.bridgeService.loadCachedPlatformAccessoriesFromDisk()

    for (const config of this.pluginConfig) {
      if (this.type === PluginType.PLATFORM) {
        const plugin = this.pluginManager.getPluginForPlatform(this.identifier)
        const displayName = config.name || plugin.getPluginIdentifier()
        const logger = Logger.withPrefix(displayName)
        const constructor = plugin.getPlatformConstructor(this.identifier)
        const platform: PlatformPlugin = new constructor(logger, config as PlatformConfig, this.api)

        if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
          plugin.assignDynamicPlatform(this.identifier, platform)
        } else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
          await this.bridgeService.loadPlatformAccessories(plugin, platform, this.identifier, logger)
        } else {
          // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
          // We just call the constructor and let it be enabled.
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const plugin = this.pluginManager.getPluginForAccessory(this.identifier)
        const displayName = config.name

        if (!displayName) {
          Logger.internal.warn('Could not load accessory %s as it is missing the required \'name\' property!', this.identifier)
          return
        }

        const logger = Logger.withPrefix(displayName)
        const constructor = plugin.getAccessoryConstructor(this.identifier)
        const accessoryInstance: AccessoryPlugin = new constructor(logger, config as AccessoryConfig, this.api)

        // pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
        const accessory = this.bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, this.identifier, config.uuid_base)

        if (accessory) {
          this.bridgeService.bridge.addBridgedAccessory(accessory)
        } else {
          logger('Accessory %s returned empty set of services. Won\'t adding it to the bridge!', this.identifier)
        }
      }
    }

    // restore the cached accessories
    this.bridgeService.restoreCachedPlatformAccessories()

    // Restore Matter accessories if Matter is enabled for this bridge
    if (this.matterManager) {
      this.matterManager.restoreCachedAccessories(this.bridgeOptions.keepOrphanedCachedAccessories ?? false)
    }

    // Publish HAP only when not opted out via hap.enabled=false and not in
    // externalsOnly mode. Both protocols may be disabled or in externalsOnly
    // mode, in which case this child bridge advertises nothing of its own
    // (externals can still publish independently in externalsOnly mode).
    this.publishHapIfEnabled()
    this.api.signalFinished()

    // Send initial status update with HAP and Matter info BEFORE telling parent we're online
    // This ensures the parent's cache is populated before any UI status updates
    this.sendPairedStatusEvent()

    // tell the parent we are online
    this.sendMessage(ChildProcessMessageEventType.ONLINE)
  }

  /**
   * Decide whether to publish the HAP bridge based on the bridge's `hap`
   * config block. Three branches:
   *   - HAP enabled and not externalsOnly → publishBridge()
   *   - externalsOnly: true → log externalsOnly notice, externals will publish via their own path
   *   - hap.enabled: false → log disabled notice (warn if Matter is also inactive,
   *     since the child bridge then advertises nothing at all)
   *
   * Public for testability (the bridgeService dependency is set up in startBridge,
   * so direct invocation from tests is straightforward with a mocked bridgeService).
   */
  public publishHapIfEnabled(): void {
    const hap = this.bridgeConfig.hap
    if (isHapConfigEnabled(hap) && !isHapExternalsOnly(hap)) {
      this.bridgeService.publishBridge()
    } else if (isHapExternalsOnly(hap)) {
      Logger.internal.info('HAP externalsOnly mode for this child bridge; bridge accessory will not publish but external accessories will.')
    } else if (!this.matterManager) {
      // HAP is off (plain disabled, not externalsOnly) AND Matter is inactive
      // for this child (matterManager is only constructed when Matter is active,
      // including externalsOnly). A child bridge exists solely to advertise its
      // accessories, so one with neither protocol is almost certainly a
      // misconfiguration — surface it loudly rather than as a quiet info line.
      Logger.internal.warn('Both HAP and Matter are disabled for this child bridge; it will not advertise any accessories. Check the \'hap\' and \'matter\' config blocks for this child bridge.')
    } else {
      Logger.internal.info('HAP is disabled for this child bridge (hap.enabled=false); skipping HAP publish.')
    }
  }

  /**
   * Request the next available external HAP port from the parent process
   * @param username
   */
  public async requestExternalPort(username: MacAddress): Promise<number | undefined> {
    return new Promise((resolve) => {
      const requestTimeout = setTimeout(() => {
        Logger.internal.warn('Parent process did not respond to port allocation request within 5 seconds - assigning random port.')
        this.portRequestCallback.delete(username)
        resolve(undefined)
      }, 5000)

      // setup callback
      const callback = (port: number | undefined) => {
        clearTimeout(requestTimeout)
        this.portRequestCallback.delete(username)
        resolve(port)
      }
      this.portRequestCallback.set(username, callback)

      // send port request
      this.sendMessage<ChildProcessPortRequestEventData>(ChildProcessMessageEventType.PORT_REQUEST, { username })
    })
  }

  /**
   * Request the next available Matter port from the parent process
   * @param uniqueId - MAC-derived identifier (without colons)
   */
  public async requestMatterPort(uniqueId: string): Promise<number | undefined> {
    return new Promise((resolve) => {
      // Use uniqueId as the key for the callback map
      const mac = uniqueId as MacAddress

      const requestTimeout = setTimeout(() => {
        matterLogger.warn('Parent process did not respond to Matter port allocation request within 5 seconds - assigning random port.')
        this.portRequestCallback.delete(mac)
        resolve(undefined)
      }, 5000)

      // setup callback
      const callback = (port: number | undefined) => {
        clearTimeout(requestTimeout)
        this.portRequestCallback.delete(mac)
        resolve(port)
      }
      this.portRequestCallback.set(mac, callback)

      // send Matter port request
      this.sendMessage<ChildProcessPortRequestEventData>(ChildProcessMessageEventType.PORT_REQUEST, {
        username: mac,
        portType: 'matter',
      })
    })
  }

  /**
   * Handles the port allocation response message from the parent process
   * @param data
   */
  public handleExternalResponse(data: ChildProcessPortAllocatedEventData): void {
    const callback = this.portRequestCallback.get(data.username)
    if (callback) {
      callback(data.port)
    }
  }

  /**
   * Tell the parent process to release a previously allocated Matter port.
   * Fire-and-forget; the parent's allocator will reclaim the slot.
   */
  public releaseMatterPort(uniqueId: string): void {
    this.sendMessage<{ uniqueId: string }>(ChildProcessMessageEventType.RELEASE_MATTER_PORT, { uniqueId })
  }

  /**
   * Sends the current pairing status of the child bridge to the parent process
   */
  public sendPairedStatusEvent() {
    // Get Matter commissioning info if Matter is enabled
    const matterInfo = this.matterManager?.getMatterStatusInfo()
    const isPublished = !!this.bridgeService?.bridge?._accessoryInfo

    this.sendMessage<ChildBridgePairedStatusEventData>(ChildProcessMessageEventType.STATUS_UPDATE, {
      paired: isPublished ? (this.bridgeService?.bridge?._accessoryInfo?.paired() ?? null) : null,
      setupUri: isPublished ? (this.bridgeService?.bridge?.setupURI() ?? null) : null,
      // Include Matter commissioning info in unified message
      ...(matterInfo && { matter: matterInfo }),
    })
  }

  /**
   * Handle start Matter monitoring request from parent process
   */
  handleStartMatterMonitoring(): void {
    this.matterMessageHandler?.handleStartMatterMonitoring()
  }

  /**
   * Handle stop Matter monitoring request from parent process
   */
  handleStopMatterMonitoring(): void {
    this.matterMessageHandler?.handleStopMatterMonitoring()
  }

  /**
   * Handle get Matter accessories request from parent process
   */
  handleGetMatterAccessories(): void {
    if (!this.matterMessageHandler) {
      // Matter not initialized yet or not configured - send empty response
      // This can happen during startup before Matter finishes initializing
      if (!this.bridgeConfig) {
        // Bridge config not loaded yet, too early to respond
        return
      }

      const event: MatterEvent = {
        type: 'accessoriesData',
        data: {
          bridgeUsername: this.bridgeConfig.username,
          accessories: [],
        },
      }
      this.sendMessage(ChildProcessMessageEventType.MATTER_EVENT, event)
      return
    }
    this.matterMessageHandler.handleGetMatterAccessories()
  }

  /**
   * Handle get Matter accessory info request from parent process
   */
  handleGetMatterAccessoryInfo(data: { uuid: string }): void {
    this.matterMessageHandler?.handleGetMatterAccessoryInfo(data)
  }

  /**
   * Handle Matter accessory control request from parent process
   */
  handleMatterAccessoryControl(data: {
    uuid: string
    cluster: string
    attributes: Record<string, unknown>
    partId?: string
  }): void {
    this.matterMessageHandler?.handleMatterAccessoryControl(data)
  }

  shutdown(): void {
    this.bridgeService.teardown()

    // Teardown Matter servers (main bridge and external accessories)
    if (this.matterManager) {
      this.matterManager.teardown().catch((error: unknown) => {
        matterLogger.error('Error tearing down Matter manager:', error)
      })
    }
  }
}

/**
 * Start Self
 */
const childPluginFork = new ChildBridgeFork()

/**
 * Handle incoming IPC messages from the parent Homebridge process
 */
process.on('message', (message: ChildProcessMessageEvent<unknown>) => {
  if (typeof message !== 'object' || !message.id) {
    return
  }

  switch (message.id) {
    case ChildProcessMessageEventType.LOAD: {
      childPluginFork.loadPlugin(message.data as ChildProcessLoadEventData).catch((error: unknown) => {
        Logger.internal.error('Child bridge failed to load plugin:', error)
        process.exit(1)
      })
      break
    }
    case ChildProcessMessageEventType.START: {
      childPluginFork.startBridge().catch((error: unknown) => {
        Logger.internal.error('Child bridge failed to start:', error)
        process.exit(1)
      })
      break
    }
    case ChildProcessMessageEventType.PORT_ALLOCATED: {
      childPluginFork.handleExternalResponse(message.data as ChildProcessPortAllocatedEventData)
      break
    }
    case ChildProcessMessageEventType.START_MATTER_MONITORING: {
      childPluginFork.handleStartMatterMonitoring()
      break
    }
    case ChildProcessMessageEventType.STOP_MATTER_MONITORING: {
      childPluginFork.handleStopMatterMonitoring()
      break
    }
    case ChildProcessMessageEventType.GET_MATTER_ACCESSORIES: {
      childPluginFork.handleGetMatterAccessories()
      break
    }
    case ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO: {
      childPluginFork.handleGetMatterAccessoryInfo(message.data as { uuid: string })
      break
    }
    case ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL: {
      childPluginFork.handleMatterAccessoryControl(message.data as {
        uuid: string
        cluster: string
        attributes: Record<string, unknown>
        partId?: string
      })
      break
    }
    default: {
      Logger.internal.warn(`Received unknown message type from parent process: ${message.id}`)
      break
    }
  }
})

/**
 * Handle the sigterm shutdown signals
 */
let shuttingDown = false
function signalHandler(signal: NodeJS.Signals, signalNum: number): void {
  if (shuttingDown) {
    return
  }
  shuttingDown = true

  Logger.internal.info('Got %s, shutting down child bridge process...', signal)

  try {
    childPluginFork.shutdown()
  } catch (error: unknown) {
    Logger.internal.error('Error during child bridge shutdown:', error)
  }

  setTimeout(() => process.exit(128 + signalNum), 5000).unref()
}

process.on('SIGINT', signalHandler.bind(undefined, 'SIGINT', 2))
process.on('SIGTERM', signalHandler.bind(undefined, 'SIGTERM', 15))

/**
 * Ensure orphaned processes are cleaned up
 */
setInterval(() => {
  if (!process.connected) {
    Logger.internal.info('Parent process not connected, terminating process...')
    process.exit(1)
  }
}, 5000)
