import type {
  AccessoryIdentifier,
  AccessoryName,
  AccessoryPlugin,
  AccessoryPluginConstructor,
  PlatformIdentifier,
  PlatformName,
  PlatformPlugin,
  PlatformPluginConstructor,
} from './api.js'
import type { BridgeConfiguration, BridgeOptions, HomebridgeConfig } from './bridgeService.js'
import type { MatterEvent } from './ipcService.js'
import type { MatterBridgeManager } from './matter/index.js'
import type { Plugin } from './plugin.js'
import type { PluginManagerOptions } from './pluginManager.js'

import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import { AccessoryEventTypes, MDNSAdvertiser } from '@homebridge/hap-nodejs'
import chalk from 'chalk'
import qrcode from 'qrcode-terminal'

import { HomebridgeAPI, PluginType } from './api.js'
import { BridgeService, isHapConfigEnabled, isHapExternalsOnly, validateHapConfig } from './bridgeService.js'
import { ChildBridgeService } from './childBridgeService.js'
import { ExternalPortService } from './externalPortService.js'
import { IpcIncomingEvent, IpcOutgoingEvent, IpcService, ServerStatusUpdate } from './ipcService.js'
import { Logger } from './logger.js'
import { isMatterActive, isMatterConfigEnabled, MatterConfigCollector } from './matter/config.js'
import { PluginManager } from './pluginManager.js'
import { User } from './user.js'
import { validMacAddress } from './util/mac.js'

const log = Logger.internal
const matterLogger = Logger.withPrefix('Matter/MainManager')

export interface HomebridgeOptions {
  keepOrphanedCachedAccessories?: boolean
  hideQRCode?: boolean
  insecureAccess?: boolean
  customPluginPath?: string
  noLogTimestamps?: boolean
  debugModeEnabled?: boolean
  forceColourLogging?: boolean
  customStoragePath?: string
  strictPluginResolution?: boolean
}

// eslint-disable-next-line no-restricted-syntax
export const enum ServerStatus {
  /**
   * When the server is starting up
   */
  PENDING = 'pending',

  /**
   * When the server is online and has published the main bridge
   */
  OK = 'ok',

  /**
   * When the server is shutting down
   */
  DOWN = 'down',
}

export class Server {
  private readonly api: HomebridgeAPI
  private readonly pluginManager: PluginManager
  private readonly bridgeService: BridgeService
  private readonly externalPortService: ExternalPortService
  readonly ipcService: IpcService

  private readonly config: HomebridgeConfig

  // used to keep track of child bridges
  // Key is HAP username (MAC address)
  private readonly childBridges: Map<string, ChildBridgeService> = new Map()

  // Matter bridge manager (handles Matter server lifecycle)
  // Lazy-loaded only when Matter is configured to avoid loading heavy Matter.js libraries
  private matterManager?: MatterBridgeManager

  // Registry of external Matter bridge usernames to their owning bridge
  // Key: external Matter bridge username (e.g., CE:65:F2:E2:D5:98)
  // Value: owner bridge username (main bridge or child bridge MAC address)
  private readonly externalMatterBridgeRegistry: Map<string, string> = new Map()

  // Matter monitoring state (for UI accessories page)
  private matterMonitoringActive = false
  private matterMonitoringClients = 0

  // Fallback timers for child-bridge Matter accessory lookups. Keyed by uuid
  // so that a child's accessoryInfoData (success or error) can cancel the
  // timer before it fires a spurious "Timed out" event at the UI.
  private readonly pendingMatterAccessoryInfoLookups: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // current server status
  private serverStatus: ServerStatus = ServerStatus.PENDING

  constructor(
    private options: HomebridgeOptions = {},
  ) {
    this.config = Server.loadConfig()

    // object we feed to Plugins and BridgeService
    this.api = new HomebridgeAPI()
    this.ipcService = new IpcService()

    // Collect all configured Matter ports to avoid conflicts
    const configuredMatterPorts = MatterConfigCollector.collectConfiguredMatterPorts(this.config)

    this.externalPortService = new ExternalPortService(this.config.ports, this.config.matterPorts, configuredMatterPorts)

    // set status to pending
    this.setServerStatus(ServerStatus.PENDING)

    // create new plugin manager
    const pluginManagerOptions: PluginManagerOptions = {
      activePlugins: this.config.plugins,
      disabledPlugins: this.config.disabledPlugins,
      customPluginPath: options.customPluginPath,
      strictPluginResolution: options.strictPluginResolution,
    }
    this.pluginManager = new PluginManager(this.api, pluginManagerOptions)

    // create new bridge service
    const bridgeConfig: BridgeOptions = {
      cachedAccessoriesDir: User.cachedAccessoryPath(),
      cachedAccessoriesItemName: 'cachedAccessories',
      externalAccessoriesItemName: 'externalAccessories',
    }

    // shallow copy the homebridge options to the bridge options object
    Object.assign(bridgeConfig, this.options)

    this.bridgeService = new BridgeService(
      this.api,
      this.pluginManager,
      this.externalPortService,
      bridgeConfig,
      this.config.bridge,
    )

    // Note: MatterBridgeManager creation is deferred to start() to avoid loading
    // heavy Matter.js libraries during construction when Matter may not be configured

    // Watch bridge events to check when server is online
    this.bridgeService.bridge.on(AccessoryEventTypes.ADVERTISED, () => {
      this.setServerStatus(ServerStatus.OK)
    })

    // watch for the paired event to update the server status
    this.bridgeService.bridge.on(AccessoryEventTypes.PAIRED, () => {
      this.setServerStatus(this.serverStatus)
    })

    // watch for the unpaired event to update the server status
    this.bridgeService.bridge.on(AccessoryEventTypes.UNPAIRED, () => {
      this.setServerStatus(this.serverStatus)
    })
  }

  /**
   * Set the current server status and update parent via IPC
   * @param status
   */
  private setServerStatus(status: ServerStatus) {
    this.serverStatus = status

    // setupURI() asserts the accessory is published. _accessoryInfo is only
    // set post-publish, so use it as the guard — covers both the HAP-disabled
    // case and the teardown path, where the bridge has been torn down.
    const bridge = this.bridgeService?.bridge
    const isPublished = !!bridge?._accessoryInfo

    const statusUpdate: ServerStatusUpdate = {
      status: this.serverStatus,
      paired: isPublished ? (bridge?._accessoryInfo?.paired() ?? null) : null,
      setupUri: isPublished ? (bridge?.setupURI() ?? null) : null,
      name: this.config.bridge.name,
      username: this.config.bridge.username,
      pin: this.config.bridge.pin,
      matter: this.matterManager?.getMatterStatus() ?? { enabled: false },
    }

    this.ipcService.sendMessage(IpcOutgoingEvent.SERVER_STATUS_UPDATE, statusUpdate)
  }

  public async start(): Promise<void> {
    if (this.config.bridge.disableIpc !== true) {
      this.initializeIpcEventHandlers()
    }

    const promises: Promise<void>[] = []

    // load the cached accessories
    await this.bridgeService.loadCachedPlatformAccessoriesFromDisk()

    // Validate Matter configuration up front so we know whether to expose
    // api.matter to plugins. Validator may strip invalid entries, so re-check
    // after. Caching the result avoids two more hasMatterConfig calls below.
    let matterIsConfigured = MatterConfigCollector.hasMatterConfig(this.config)
    if (matterIsConfigured) {
      await MatterConfigCollector.validateMatterConfig(this.config)
      matterIsConfigured = MatterConfigCollector.hasMatterConfig(this.config)
    }

    // Eagerly load the MatterAPI facade before plugins initialize, so api.matter
    // is defined when plugin code runs on Matter-enabled bridges. The heavy
    // MatterBridgeManager init still happens after plugins load (below) — only
    // the API surface needs to be ready early.
    if (matterIsConfigured) {
      await this.api.loadMatterAPI()
    }

    // initialize plugins
    await this.pluginManager.initializeInstalledPlugins()

    // Initialize Matter manager only if configured. Heavy Matter.js libraries
    // are loaded here (async), avoiding sync blocking during construction.
    if (matterIsConfigured) {
      // Dynamically import MatterBridgeManager only when needed
      // This prevents loading heavy Matter.js libraries when Matter is not configured
      const { MatterBridgeManager } = await import('./matter/MatterBridgeManager.js')

      // Create the manager
      this.matterManager = new MatterBridgeManager(
        this.config,
        this.api,
        this.externalPortService,
        this.pluginManager,
        this.options,
        this, // Pass server instance for registry access
      )

      // Set manager reference on API for getAccessoryState
      this.api._setMatterManager(this.matterManager)

      // Initialize Matter server for main bridge if enabled
      await this.matterManager.initialize()
    }

    if (this.config.platforms.length > 0) {
      promises.push(...this.loadPlatforms())
    }
    if (this.config.accessories.length > 0) {
      this.loadAccessories()
    }

    // start child bridges
    for (const childBridge of this.childBridges.values()) {
      childBridge.start()
    }

    // restore cached accessories
    this.bridgeService.restoreCachedPlatformAccessories()
    this.matterManager?.restoreCachedAccessories(this.options.keepOrphanedCachedAccessories ?? false)

    this.api.signalFinished()

    // wait for all platforms to publish their accessories before we publish the bridge
    await Promise.all(promises)

    if (Server.isHapEnabled(this.config.bridge)) {
      this.publishBridge()
    } else {
      // HAP is opted out (or externalsOnly mode is set). The bridge ADVERTISED
      // listener won't fire for the bridge itself, so move server status to OK
      // explicitly. Matter may or may not be up — if both protocols are
      // suppressed the bridge simply advertises nothing of its own.
      if (isHapExternalsOnly(this.config.bridge.hap)) {
        log.info('HAP externalsOnly mode for the main bridge; bridge accessory will not publish but external accessories will.')
      } else {
        log.info('HAP is disabled for the main bridge (bridge.hap.enabled=false); skipping HAP publish.')
      }
      this.setServerStatus(ServerStatus.OK)
    }
  }

  public async teardown(): Promise<void> {
    this.bridgeService.teardown()

    // Teardown Matter servers (main bridge and external accessories)
    await this.matterManager?.teardown()

    // Cancel any in-flight Matter accessory info fallback timers so they
    // don't fire `accessoryInfoData` events at the IPC channel after the
    // service has stopped. The timers are already unref()'d so they don't
    // hold the loop open — this is for tidiness, not a real leak.
    for (const timer of this.pendingMatterAccessoryInfoLookups.values()) {
      clearTimeout(timer)
    }
    this.pendingMatterAccessoryInfoLookups.clear()

    this.ipcService.stop()
    this.setServerStatus(ServerStatus.DOWN)
  }

  private publishBridge(): void {
    this.bridgeService.publishBridge()
    this.printSetupInfo(this.config.bridge.pin)
  }

  /**
   * Handle Matter command trigger from IPC (for UI control)
   * This is called by IPC handlers, not API events
   */
  private async handleTriggerMatterCommand(uuid: string, cluster: string, attributes: Record<string, any>, partId?: string): Promise<void> {
    if (!this.matterManager) {
      throw new Error('Matter manager not initialized')
    }
    await this.matterManager.handleTriggerCommand(uuid, cluster, attributes, partId)
  }

  /**
   * Whether HAP should be published for the given bridge configuration.
   * HAP is on by default; users opt out via `bridge.hap.enabled: false`.
   * In externalsOnly mode the bridge accessory itself is not published, so
   * this returns false there too — externals are handled separately by
   * BridgeService.
   */
  public static isHapEnabled(bridgeConfig: BridgeConfiguration): boolean {
    return isHapConfigEnabled(bridgeConfig.hap) && !isHapExternalsOnly(bridgeConfig.hap)
  }

  /**
   * Whether Matter is enabled for the given bridge.
   * Matter is opt-in: a `bridge.matter` block must be present and not
   * explicitly disabled via `bridge.matter.enabled: false`.
   */
  public static isMatterEnabledForBridge(bridgeConfig: BridgeConfiguration): boolean {
    return isMatterConfigEnabled(bridgeConfig.matter)
  }

  private static loadConfig(): HomebridgeConfig {
    // Look for the configuration file
    const configPath = User.configPath()

    const defaultBridge: BridgeConfiguration = {
      name: 'Homebridge',
      username: 'CC:22:3D:E3:CE:30',
      pin: '031-45-154',
    }

    if (!existsSync(configPath)) {
      log.warn('config.json (%s) not found.', configPath)
      return { // return a default configuration
        bridge: defaultBridge,
        accessories: [],
        platforms: [],
      }
    }

    let config: Partial<HomebridgeConfig>
    try {
      config = JSON.parse(readFileSync(configPath, { encoding: 'utf8' }))
    } catch (error: any) {
      log.error('There was a problem reading your config.json file.')
      log.error('Please try pasting your config.json file here to validate it: https://jsonlint.com')
      log.error('')
      throw error
    }

    if (config.ports !== undefined) {
      if (config.ports.start && config.ports.end) {
        if (config.ports.start > config.ports.end) {
          log.error('Invalid port pool configuration. End should be greater than or equal to start.')
          config.ports = undefined
        }
      } else {
        log.error('Invalid configuration for \'ports\'. Missing \'start\' and \'end\' properties! Ignoring it!')
        config.ports = undefined
      }
    }

    const bridge: BridgeConfiguration = config.bridge || defaultBridge
    bridge.name = bridge.name || defaultBridge.name
    bridge.username = bridge.username || defaultBridge.username
    bridge.pin = bridge.pin || defaultBridge.pin
    config.bridge = bridge

    // Validate Matter port pool configuration. Must run after bridge defaults
    // are filled in, since the cast to HomebridgeConfig only becomes honest at
    // that point.
    MatterConfigCollector.validateMatterPortsPool(config as HomebridgeConfig)

    // Normalise the main bridge username to uppercase so downstream comparisons
    // (validMacAddress, registry lookups, child-bridge dedup) stay case-consistent.
    // Guarded so a malformed (non-string) value falls through to `validMacAddress`
    // below and produces the proper "Not a valid username" error rather than a
    // raw TypeError from calling toUpperCase on a number/boolean.
    if (typeof config.bridge.username === 'string') {
      config.bridge.username = config.bridge.username.toUpperCase()
    }
    const username = config.bridge.username
    if (!validMacAddress(username)) {
      throw new Error(`Not a valid username: ${username}. Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`)
    }

    // Validate the main bridge HAP config (shape + externalsOnly/enabled coherence).
    validateHapConfig(config.bridge, { bridgeLabel: 'main bridge' })

    config.accessories = config.accessories || []
    config.platforms = config.platforms || []

    if (!Array.isArray(config.accessories)) {
      log.error('Value provided for accessories must be an array[]')
      config.accessories = []
    }

    if (!Array.isArray(config.platforms)) {
      log.error('Value provided for platforms must be an array[]')
      config.platforms = []
    }

    log.info('Loaded config.json with %s accessories and %s platforms.', config.accessories.length, config.platforms.length)

    if (config.bridge.advertiser) {
      if (![
        MDNSAdvertiser.BONJOUR,
        MDNSAdvertiser.CIAO,
        MDNSAdvertiser.AVAHI,
        MDNSAdvertiser.RESOLVED,
      ].includes(config.bridge.advertiser)) {
        config.bridge.advertiser = undefined
        log.error('Value provided in bridge.advertiser is not valid, reverting to platform default.')
      }
    } else {
      config.bridge.advertiser = undefined
    }

    return config as HomebridgeConfig
  }

  private loadAccessories(): void {
    log.info(`Loading ${this.config.accessories.length} accessories...`)

    this.config.accessories.forEach((accessoryConfig, index) => {
      if (!accessoryConfig.accessory) {
        log.warn('Your config.json contains an illegal accessory configuration object at position %d. '
          + 'Missing property \'accessory\'. Skipping entry...', index + 1) // we rather count from 1 for the normal people?
        return
      }

      const accessoryIdentifier: AccessoryName | AccessoryIdentifier = accessoryConfig.accessory
      const displayName = accessoryConfig.name
      if (!displayName) {
        log.warn('Could not load accessory %s at position %d as it is missing the required \'name\' property!', accessoryIdentifier, index + 1)
        return
      }

      let plugin: Plugin
      let constructor: AccessoryPluginConstructor

      try {
        plugin = this.pluginManager.getPluginForAccessory(accessoryIdentifier)
      } catch (error: any) {
        log.error(error.message)
        return
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the accessory "${accessoryIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`)
        return
      }

      try {
        constructor = plugin.getAccessoryConstructor(accessoryIdentifier)
      } catch (error: any) {
        log.error(`Error loading the accessory "${accessoryIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`)
        log.error(error) // error message contains more information and full stack trace
        return
      }

      const logger = Logger.withPrefix(displayName)
      logger('Initializing %s accessory...', accessoryIdentifier)

      if (accessoryConfig._bridge) {
        // ensure the username is always uppercase
        accessoryConfig._bridge.username = accessoryConfig._bridge.username.toUpperCase()

        try {
          this.validateChildBridgeConfig(PluginType.ACCESSORY, accessoryIdentifier, accessoryConfig._bridge)
        } catch (error: any) {
          log.error(error.message)
          return
        }

        let childBridge: ChildBridgeService

        if (this.childBridges.has(accessoryConfig._bridge.username)) {
          childBridge = this.childBridges.get(accessoryConfig._bridge.username)!
          logger(`Adding to existing child bridge ${accessoryConfig._bridge.username}`)
        } else {
          logger(`Initializing child bridge ${accessoryConfig._bridge.username}`)
          childBridge = new ChildBridgeService(
            PluginType.ACCESSORY,
            accessoryIdentifier,
            plugin,
            accessoryConfig._bridge,
            this.config,
            this.options,
            this.api,
            this.ipcService,
            this.externalPortService,
          )

          // Set callback for external Matter bridge registration
          childBridge.onExternalBridgeRegistered = this.registerExternalMatterBridge.bind(this)
          // Cancel the parent-side fallback timer when this child answers a lookup
          childBridge.onAccessoryInfoResponse = this.cancelPendingMatterAccessoryInfoLookup.bind(this)

          this.childBridges.set(accessoryConfig._bridge.username, childBridge)
        }

        // add config to child bridge service
        childBridge.addConfig(accessoryConfig)

        return
      }

      const accessoryInstance: AccessoryPlugin = new constructor(logger, accessoryConfig, this.api)

      // pass accessoryIdentifier for UUID generation, and optional parameter uuid_base which can be used instead of displayName for UUID generation
      const accessory = this.bridgeService.createHAPAccessory(plugin, accessoryInstance, displayName, accessoryIdentifier, accessoryConfig.uuid_base)

      if (accessory) {
        try {
          this.bridgeService.bridge.addBridgedAccessory(accessory)
        } catch (error: any) {
          logger.error(`Error loading the accessory "${accessoryIdentifier}" from "${plugin.getPluginIdentifier()}" requested in your config.json:`, error.message)
        }
      } else {
        logger.info('Accessory %s returned empty set of services; not adding it to the bridge.', accessoryIdentifier)
      }
    })
  }

  private loadPlatforms(): Promise<void>[] {
    log.info(`Loading ${this.config.platforms.length} platforms...`)

    const promises: Promise<void>[] = []
    this.config.platforms.forEach((platformConfig, index) => {
      if (!platformConfig.platform) {
        log.warn('Your config.json contains an illegal platform configuration object at position %d. '
          + 'Missing property \'platform\'. Skipping entry...', index + 1) // we rather count from 1 for the normal people?
        return
      }

      const platformIdentifier: PlatformName | PlatformIdentifier = platformConfig.platform
      const displayName = platformConfig.name || platformIdentifier

      let plugin: Plugin
      let constructor: PlatformPluginConstructor

      // do not load homebridge-config-ui-x when running in service mode
      if (platformIdentifier === 'config' && process.env.UIX_SERVICE_MODE === '1') {
        return
      }

      try {
        plugin = this.pluginManager.getPluginForPlatform(platformIdentifier)
      } catch (error: any) {
        log.error(error.message)
        return
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the platform "${platformIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`)
        return
      }

      try {
        constructor = plugin.getPlatformConstructor(platformIdentifier)
      } catch (error: any) {
        log.error(`Error loading the platform "${platformIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`)
        log.error(error) // error message contains more information and full stack trace
        return
      }

      const logger = Logger.withPrefix(displayName)
      logger('Initializing %s platform...', platformIdentifier)

      if (platformConfig._bridge) {
        // ensure the username is always uppercase
        platformConfig._bridge.username = platformConfig._bridge.username.toUpperCase()

        try {
          this.validateChildBridgeConfig(PluginType.PLATFORM, platformIdentifier, platformConfig._bridge)
        } catch (error: any) {
          log.error(error.message)
          return
        }

        logger(`Initializing child bridge ${platformConfig._bridge.username}`)
        const childBridge = new ChildBridgeService(
          PluginType.PLATFORM,
          platformIdentifier,
          plugin,
          platformConfig._bridge,
          this.config,
          this.options,
          this.api,
          this.ipcService,
          this.externalPortService,
        )

        // Set callback for external Matter bridge registration
        childBridge.onExternalBridgeRegistered = this.registerExternalMatterBridge.bind(this)
        // Cancel the parent-side fallback timer when this child answers a lookup
        childBridge.onAccessoryInfoResponse = this.cancelPendingMatterAccessoryInfoLookup.bind(this)

        this.childBridges.set(platformConfig._bridge.username, childBridge)

        // add config to child bridge service
        childBridge.addConfig(platformConfig)
        return
      }

      const platform: PlatformPlugin = new constructor(logger, platformConfig, this.api)

      if (HomebridgeAPI.isDynamicPlatformPlugin(platform)) {
        plugin.assignDynamicPlatform(platformIdentifier, platform)
      } else if (HomebridgeAPI.isStaticPlatformPlugin(platform)) { // Plugin 1.0, load accessories
        promises.push(this.bridgeService.loadPlatformAccessories(plugin, platform, platformIdentifier, logger))
      } else {
        // otherwise it's a IndependentPlatformPlugin which doesn't expose any methods at all.
        // We just call the constructor and let it be enabled.
      }
    })

    return promises
  }

  /**
   * Validate an external bridge config
   */
  private validateChildBridgeConfig(type: PluginType, identifier: string, bridgeConfig: BridgeConfiguration): void {
    // All child bridges require username
    if (!bridgeConfig.username) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - `
        + 'Missing required field "_bridge.username".',
      )
    }

    // Normalise the child username to uppercase, mirroring the main bridge
    // (loadConfig). validMacAddress only accepts A-F, so without this a lowercase
    // MAC in _bridge.username would be rejected here even though the identical
    // value is accepted on the main bridge. Guarded so a non-string value still
    // falls through to the proper "not a valid username" error below.
    if (typeof bridgeConfig.username === 'string') {
      bridgeConfig.username = bridgeConfig.username.toUpperCase()
    }

    if (!validMacAddress(bridgeConfig.username)) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - `
        + `not a valid username in _bridge.username: "${bridgeConfig.username}". Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`,
      )
    }

    if (this.childBridges.has(bridgeConfig.username)) {
      const childBridge = this.childBridges.get(bridgeConfig.username)
      if (type === PluginType.PLATFORM) {
        // only a single platform can exist on one child bridge
        throw new Error(
          `Error loading the ${type} "${identifier}" requested in your config.json - `
          + `Duplicate username found in _bridge.username: "${bridgeConfig.username}". Each platform child bridge must have it's own unique username.`,
        )
      } else if (childBridge?.identifier !== identifier) {
        // only accessories of the same type can be added to the same child bridge
        throw new Error(
          `Error loading the ${type} "${identifier}" requested in your config.json - `
          + `Duplicate username found in _bridge.username: "${bridgeConfig.username}". You can only group accessories of the same type in a child bridge.`,
        )
      }
    }

    // Both usernames are normalised to uppercase (main in loadConfig, child
    // above), so a direct comparison is case-consistent.
    if (bridgeConfig.username === this.config.bridge.username) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - `
        + `Username found in _bridge.username: "${bridgeConfig.username}" is the same as the main bridge. Each child bridge platform/accessory must have it's own unique username.`,
      )
    }

    // Validate the child bridge HAP config (shape + externalsOnly/enabled coherence).
    // For accessory child bridges, `hap.externalsOnly` is stripped with a warning
    // since externals are not supported via the accessory plugin API.
    validateHapConfig(bridgeConfig, {
      bridgeLabel: `${type} "${identifier}" child bridge`,
      isAccessoryPlugin: type === PluginType.ACCESSORY,
    })
  }

  /**
   * Takes care of the IPC Events sent to Homebridge
   */
  private initializeIpcEventHandlers() {
    // start ipc service
    this.ipcService.start()

    // handle restart child bridge event
    this.ipcService.on(IpcIncomingEvent.RESTART_CHILD_BRIDGE, (username) => {
      // noinspection SuspiciousTypeOfGuard
      if (typeof username === 'string') {
        const childBridge = this.childBridges.get(username.toUpperCase())
        childBridge?.restartChildBridge()
      }
    })

    // handle stop child bridge event
    this.ipcService.on(IpcIncomingEvent.STOP_CHILD_BRIDGE, (username) => {
      // noinspection SuspiciousTypeOfGuard
      if (typeof username === 'string') {
        const childBridge = this.childBridges.get(username.toUpperCase())
        childBridge?.stopChildBridge()
      }
    })

    // handle start child bridge event
    this.ipcService.on(IpcIncomingEvent.START_CHILD_BRIDGE, (username) => {
      // noinspection SuspiciousTypeOfGuard
      if (typeof username === 'string') {
        const childBridge = this.childBridges.get(username.toUpperCase())
        childBridge?.startChildBridge()
      }
    })

    this.ipcService.on(IpcIncomingEvent.CHILD_BRIDGE_METADATA_REQUEST, () => {
      this.ipcService.sendMessage(
        IpcOutgoingEvent.CHILD_BRIDGE_METADATA_RESPONSE,
        Array.from(this.childBridges.values(), x => x.getMetadata()),
      )
    })

    // Matter monitoring lifecycle handlers
    this.ipcService.on(IpcIncomingEvent.START_MATTER_MONITORING, (data) => {
      this.handleStartMatterMonitoring(data)
    })

    this.ipcService.on(IpcIncomingEvent.STOP_MATTER_MONITORING, (data) => {
      this.handleStopMatterMonitoring(data)
    })

    this.ipcService.on(IpcIncomingEvent.GET_MATTER_ACCESSORIES, (data) => {
      void this.handleGetMatterAccessories(data)
    })

    this.ipcService.on(IpcIncomingEvent.GET_MATTER_ACCESSORY_INFO, (data) => {
      this.handleGetMatterAccessoryInfo(data?.uuid)
    })

    this.ipcService.on(IpcIncomingEvent.MATTER_ACCESSORY_CONTROL, (data) => {
      void this.handleMatterAccessoryControl(data)
    })
  }

  /**
   * Handle start Matter monitoring request from UI
   * Only starts monitoring if this is the first client.
   *
   * The UI parks each `startMatterMonitoring` request under a `correlationId`
   * so it can route the ack back to the matching waiter and gate its first
   * `getMatterAccessories` on it; echo it on the reply so the UI's dispatcher
   * (which drops events without a correlationId) can deliver it.
   */
  private handleStartMatterMonitoring(data?: { correlationId?: string }): void {
    const correlationId = data?.correlationId
    this.matterMonitoringClients++

    // Only setup monitoring if this is the first client
    if (this.matterMonitoringClients === 1) {
      this.matterMonitoringActive = true

      // Enable monitoring on main bridge Matter servers
      this.matterManager?.enableStateMonitoring()

      // Enable monitoring on all child bridges
      for (const childBridge of this.childBridges.values()) {
        childBridge.startMatterMonitoring()
      }

      const event: MatterEvent = {
        type: 'monitoringStarted',
        correlationId,
        data: { success: true },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    } else {
      // Already monitoring, just acknowledge
      const event: MatterEvent = {
        type: 'monitoringStarted',
        correlationId,
        data: { success: true, alreadyActive: true },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Handle stop Matter monitoring request from UI
   * Only stops monitoring when no more clients.
   *
   * Echo the request's `correlationId` for the same reason as
   * `handleStartMatterMonitoring`.
   */
  private handleStopMatterMonitoring(data?: { correlationId?: string }): void {
    const correlationId = data?.correlationId

    if (this.matterMonitoringClients <= 0) {
      // Nothing to do, but still acknowledge so the UI doesn't sit waiting
      // for a confirmation event that never comes.
      const event: MatterEvent = {
        type: 'monitoringStopped',
        correlationId,
        data: { success: true, alreadyStopped: true },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
      return
    }

    this.matterMonitoringClients--

    // Only stop monitoring when no more clients
    if (this.matterMonitoringClients === 0) {
      this.matterMonitoringActive = false

      // Disable monitoring on main bridge Matter servers
      this.matterManager?.disableStateMonitoring()

      // Disable monitoring on all child bridges
      for (const childBridge of this.childBridges.values()) {
        childBridge.stopMatterMonitoring()
      }

      const event: MatterEvent = {
        type: 'monitoringStopped',
        correlationId,
        data: { success: true },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    } else {
      // Other clients still monitoring
      const event: MatterEvent = {
        type: 'monitoringStopped',
        correlationId,
        data: { success: true, othersActive: true },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Register an external Matter bridge (e.g., robot vacuum with own bridge)
   * This allows routing control commands directly to the correct owner
   * @param externalBridgeUsername - Username of the external Matter bridge
   * @param ownerUsername - Username of the bridge that owns it (main bridge or child bridge username)
   */
  public registerExternalMatterBridge(externalBridgeUsername: string, ownerUsername: string): void {
    const normalizedExternal = externalBridgeUsername.toUpperCase()
    const normalizedOwner = ownerUsername.toUpperCase()
    matterLogger.debug(`Registering external Matter bridge ${normalizedExternal} → owner: ${normalizedOwner}`)
    this.externalMatterBridgeRegistry.set(normalizedExternal, normalizedOwner)
  }

  /**
   * Cancel the pending fallback timer for a forwarded Matter accessory lookup.
   * Called by ChildBridgeService when a child responds with accessoryInfoData
   * so the 2s "Timed out" event isn't sent after a successful response.
   */
  private cancelPendingMatterAccessoryInfoLookup(uuid: string): void {
    const timer = this.pendingMatterAccessoryInfoLookups.get(uuid)
    if (timer) {
      clearTimeout(timer)
      this.pendingMatterAccessoryInfoLookups.delete(uuid)
    }
  }

  /**
   * Get Matter accessories for a specific bridge or all bridges.
   *
   * The UI parks each request under a `correlationId` and routes responses
   * back to the matching waiter; events without the original correlationId
   * are dropped, so every emitted `accessoriesData` event must echo it.
   */
  private async handleGetMatterAccessories(data?: { bridgeUsername?: string, correlationId?: string }): Promise<void> {
    const bridgeUsername = data?.bridgeUsername
    const correlationId = data?.correlationId

    // Check if monitoring is active
    if (!this.matterMonitoringActive) {
      matterLogger.warn('Matter monitoring not active - cannot get accessories')
      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername,
          error: 'Matter monitoring not active',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
      return
    }

    // Check if Matter is enabled on main bridge
    if (!this.api.isMatterEnabled() && this.childBridges.size === 0) {
      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername,
          accessories: [],
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
      return
    }

    try {
      // Get accessories from main bridge
      const allAccessories = this.matterManager?.collectAllAccessories(bridgeUsername) || []

      // Request from child bridges and wait for responses (with timeout)
      if (this.childBridges.size > 0) {
        const results = await Promise.allSettled(
          Array.from(this.childBridges.values(), childBridge => childBridge.requestMatterAccessories()),
        )

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value?.accessories) {
            allAccessories.push(...result.value.accessories)
          }
        }
      }

      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername: bridgeUsername || 'all',
          accessories: allAccessories,
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    } catch (error) {
      matterLogger.error('Failed to get Matter accessories:', error)
      const event: MatterEvent = {
        type: 'accessoriesData',
        correlationId,
        data: {
          bridgeUsername,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Get detailed info for a specific Matter accessory
   */
  private handleGetMatterAccessoryInfo(uuid?: string): void {
    if (!uuid) {
      const event: MatterEvent = {
        type: 'accessoryInfoData',
        data: {
          error: 'UUID is required',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
      return
    }

    try {
      // Try to get from main bridge first
      const accessoryInfo = this.matterManager?.getAccessoryInfo(uuid)

      if (accessoryInfo) {
        const event: MatterEvent = {
          type: 'accessoryInfoData',
          data: accessoryInfo,
        }
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
        return
      }

      // If not found on main bridge, forward to child bridges whose Matter is
      // actually active. A child with `matter: { enabled: false }` still carries
      // a matterConfig block but never starts a Matter message handler, so it
      // would never answer — forwarding to it would only make the UI wait out
      // the 2s fallback instead of getting an immediate "not found". Gate on
      // isMatterActive (enabled or externalsOnly), which mirrors the condition
      // under which the child actually creates its Matter handler.
      // The matching child responds directly to the UI via the existing
      // MATTER_EVENT forwarding path; schedule a fallback error so the UI
      // doesn't hang if no child knows the UUID either.
      let forwardedToChildren = false
      for (const childBridge of this.childBridges.values()) {
        if (isMatterActive(childBridge.getMetadata().matterConfig)) {
          childBridge.getMatterAccessoryInfo(uuid)
          forwardedToChildren = true
        }
      }

      if (!forwardedToChildren) {
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
          type: 'accessoryInfoData',
          data: { error: `Accessory ${uuid} not found`, uuid },
        })
        return
      }

      // 2s is comfortably longer than a healthy child response and short
      // enough that the UI doesn't feel stuck. Use unref() so a late
      // shutdown doesn't wait on this timer. The timer is registered in
      // pendingMatterAccessoryInfoLookups so a child's accessoryInfoData
      // response (routed via ChildBridgeService.onAccessoryInfoResponse) can
      // cancel it before it fires a spurious timed-out event. A second
      // concurrent request for the same uuid replaces the existing timer.
      const existing = this.pendingMatterAccessoryInfoLookups.get(uuid)
      if (existing) {
        clearTimeout(existing)
      }
      const fallback = setTimeout(() => {
        this.pendingMatterAccessoryInfoLookups.delete(uuid)
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
          type: 'accessoryInfoData',
          data: {
            error: `Timed out looking up Matter accessory ${uuid}; it may not be registered.`,
            uuid,
            timedOut: true,
          },
        })
      }, 2000)
      fallback.unref()
      this.pendingMatterAccessoryInfoLookups.set(uuid, fallback)
    } catch (error) {
      matterLogger.error('Failed to get Matter accessory info:', error)
      const event: MatterEvent = {
        type: 'accessoryInfoData',
        data: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Handle Matter accessory control command
   */
  private async handleMatterAccessoryControl(data?: {
    uuid: string
    cluster: string
    attributes: Record<string, unknown>
    bridgeUsername?: string
    partId?: string
  }): Promise<void> {
    matterLogger.debug(`Matter control request: uuid=${data?.uuid}, cluster=${data?.cluster}, bridge=${data?.bridgeUsername || 'auto'}, part=${data?.partId || 'main'}`)

    if (!data?.uuid || !data?.cluster || !data?.attributes) {
      matterLogger.error('Missing required parameters for Matter control')
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
        type: 'accessoryControlResponse',
        data: {
          success: false,
          error: 'Missing required parameters',
        },
      })
      return
    }

    // If bridge username is provided, route directly to that bridge
    if (data.bridgeUsername) {
      const targetUsername = data.bridgeUsername.toUpperCase()

      // Check if it's the main bridge
      if (targetUsername === this.config.bridge.username.toUpperCase()) {
        matterLogger.debug(`Routing to main bridge (${targetUsername})`)
        try {
          await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId)
          matterLogger.debug(`Main bridge successfully controlled accessory ${data.uuid}`)
          this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
            type: 'accessoryControlResponse',
            data: {
              success: true,
              uuid: data.uuid,
            },
          })
        } catch (error: any) {
          matterLogger.error(`Main bridge failed to control ${data.uuid}: ${error.message}`)
          this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
            type: 'accessoryControlResponse',
            data: {
              success: false,
              error: error.message,
              uuid: data.uuid,
            },
          })
        }
        return
      }

      // Check if it's a specific child bridge
      for (const childBridge of this.childBridges.values()) {
        if (childBridge.getMetadata().username.toUpperCase() === targetUsername) {
          matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${targetUsername})`)
          childBridge.controlMatterAccessory(data)
          return
        }
      }

      // Check if it's an external Matter bridge (e.g., robot vacuum with own bridge)
      // Use registry for efficient direct routing
      const ownerUsername = this.externalMatterBridgeRegistry.get(targetUsername)
      if (ownerUsername) {
        matterLogger.debug(`Found external bridge ${targetUsername} in registry, owned by ${ownerUsername}`)

        if (ownerUsername === this.config.bridge.username.toUpperCase()) {
          // External accessory on main bridge
          matterLogger.debug(`Routing to main bridge's external accessories for ${data.uuid}`)
          try {
            await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId)
            matterLogger.debug(`External accessory ${data.uuid} successfully controlled via main bridge`)
            this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
              type: 'accessoryControlResponse',
              data: {
                success: true,
                uuid: data.uuid,
              },
            })
          } catch (error: any) {
            matterLogger.error(`Main bridge failed to control external accessory ${data.uuid}: ${error.message}`)
            this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
              type: 'accessoryControlResponse',
              data: {
                success: false,
                error: error.message,
                uuid: data.uuid,
              },
            })
          }
        } else {
          // External accessory on child bridge - lookup by username
          const childBridge = this.childBridges.get(ownerUsername)
          if (childBridge) {
            matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${ownerUsername}) for external accessory ${data.uuid}`)
            childBridge.controlMatterAccessory(data)
          } else {
            matterLogger.error(`Owner bridge ${ownerUsername} not found for external bridge ${targetUsername}`)
            this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
              type: 'accessoryControlResponse',
              data: {
                success: false,
                error: `Owner bridge ${ownerUsername} not found`,
                uuid: data.uuid,
              },
            })
          }
        }
        return
      }

      // Bridge username provided but not found anywhere
      // With registry, we should always be able to find the bridge if the data is correct
      matterLogger.error(`Bridge ${targetUsername} not found in main/child bridges or registry`)
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
        type: 'accessoryControlResponse',
        data: {
          success: false,
          error: `Bridge ${targetUsername} not found`,
          uuid: data.uuid,
        },
      })
      return
    }

    // No bridge username provided - broadcast mode (try main, then all children)
    matterLogger.debug(`Broadcast mode: trying main bridge for accessory ${data.uuid}`)
    try {
      await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId)
      matterLogger.debug(`Main bridge successfully controlled accessory ${data.uuid}`)
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
        type: 'accessoryControlResponse',
        data: {
          success: true,
          uuid: data.uuid,
        },
      })
    } catch (error) {
      // Main bridge doesn't have accessory - forward to child bridges whose
      // Matter is actually active. A child with `matter: { enabled: false }`
      // still carries a matterConfig block but never starts a Matter handler,
      // so forwarding a control request to it would just be dropped. Gate on
      // isMatterActive (enabled or externalsOnly) — the same condition under
      // which the child creates its Matter handler.
      const matterChildBridges = [...this.childBridges.values()].filter(
        bridge => isMatterActive(bridge.getMetadata().matterConfig),
      )

      if (matterChildBridges.length > 0) {
        matterLogger.debug(`Main bridge doesn't have accessory ${data.uuid}, forwarding to ${matterChildBridges.length} child bridge(s) with Matter enabled`)
        for (const childBridge of matterChildBridges) {
          childBridge.controlMatterAccessory(data)
        }
      } else {
        matterLogger.warn(`Accessory ${data.uuid} not found - not on main bridge and no child bridges with Matter available`)
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
          type: 'accessoryControlResponse',
          data: {
            success: false,
            error: 'Accessory not found',
            uuid: data.uuid,
          },
        })
      }
    }
  }

  private printSetupInfo(pin: string): void {
    /* eslint-disable no-console */
    console.log('Setup Payload:')
    console.log(this.bridgeService.bridge.setupURI())

    if (!this.options.hideQRCode) {
      console.log('Scan this code with your HomeKit app on your iOS device to pair with Homebridge:')
      qrcode.setErrorLevel('M') // HAP specifies level M or higher for ECC
      qrcode.generate(this.bridgeService.bridge.setupURI())
      console.log('Or enter this code with your HomeKit app on your iOS device to pair with Homebridge:')
    } else {
      console.log('Enter this code with your HomeKit app on your iOS device to pair with Homebridge:')
    }

    console.log(chalk.black.bgWhite('                       '))
    console.log(chalk.black.bgWhite('    ┌────────────┐     '))
    console.log(chalk.black.bgWhite(`    │ ${pin} │     `))
    console.log(chalk.black.bgWhite('    └────────────┘     '))
    console.log(chalk.black.bgWhite('                       '))
    /* eslint-enable no-console */
  }
}
