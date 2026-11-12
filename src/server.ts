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
import { BridgeService, isHapActive, isHapConfigEnabled, isHapExternalsOnly, validateHapConfig } from './bridgeService.js'
import { ChildBridgeService } from './childBridgeService.js'
import { collectConfiguredHapPorts, ExternalPortService } from './externalPortService.js'
import { IpcIncomingEvent, IpcOutgoingEvent, IpcService, ServerStatusUpdate } from './ipcService.js'
import { Logger } from './logger.js'
import { isMatterActive, isMatterExternalsOnly, MatterConfigCollector } from './matter/config.js'
import { MatterAccessoryNotOnBridgeError } from './matter/MatterError.js'
import { PluginManager } from './pluginManager.js'
import { User } from './user.js'
import { errorMessage } from './util/errorMessage.js'
import { validMacAddress } from './util/mac.js'
import { DEFAULT_PIN, validatePin } from './util/pin.js'

// HAP specifies QR error-correction level M or higher for ECC. Set once at
// module load — qrcode-terminal stores this on the (process-global) module,
// so re-setting it on every printSetupInfo call was redundant.
qrcode.setErrorLevel('M')

const log = Logger.internal
const matterLogger = Logger.withPrefix('Matter/MainManager')

/**
 * Read a TCP port from the config: a whole number from 1 to 65535. A number
 * written as a text ("51826") is taken as that number, as it was by Node.js
 * for a bridge port; anything else gives `undefined`.
 */
function parsePort(value: unknown): number | undefined {
  const port = typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value)
    : value
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : undefined
}

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

  // Fallback timers for child-bridge Matter accessory lookups. Keyed by the
  // request's correlationId (by uuid for a request without one) so that a
  // child's accessoryInfoData (success or error) can cancel the timer before
  // it fires a spurious "Timed out" event at the UI.
  private readonly pendingMatterAccessoryInfoLookups: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // The same fallback, for control requests broadcast to the child bridges.
  // Keyed by correlationId: a child that does not own the accessory stays
  // silent by design (every matter child is asked, only the owner answers), so
  // without this a control for an unknown uuid produced no response at all.
  private readonly pendingMatterControlRequests: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // current server status
  private serverStatus: ServerStatus = ServerStatus.PENDING

  constructor(
    private options: HomebridgeOptions = {},
  ) {
    this.config = Server.loadConfig()

    // object we feed to Plugins and BridgeService
    this.api = new HomebridgeAPI()
    this.api._setHapEnabled(isHapActive(this.config.bridge.hap), isHapExternalsOnly(this.config.bridge.hap))
    this.api._setMatterExternalsOnly(isMatterExternalsOnly(this.config.bridge.matter))
    this.ipcService = new IpcService()

    // Collect all configured Matter ports to avoid conflicts
    const configuredMatterPorts = MatterConfigCollector.collectConfiguredMatterPorts(this.config)

    this.externalPortService = new ExternalPortService(this.config.ports, this.config.matterPorts, configuredMatterPorts, collectConfiguredHapPorts(this.config))

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
  private setServerStatus(status: ServerStatus): void {
    this.serverStatus = status

    // setupURI() asserts the accessory is published. _accessoryInfo is only
    // set post-publish, so use it as the guard — covers both the HAP-disabled
    // case and the teardown path, where the bridge has been torn down.
    const bridge = this.bridgeService?.bridge
    const isPublished = !!bridge?._accessoryInfo

    const statusUpdate: ServerStatusUpdate = {
      status: this.serverStatus,
      paired: isPublished
        ? (bridge?._accessoryInfo?.paired() ?? null)
        : null,
      setupUri: isPublished
        ? (bridge?.setupURI() ?? null)
        : null,
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

    // Validate Matter configuration for every bridge up front (a no-op when no
    // bridge uses Matter). The validator may strip invalid entries, so the
    // main bridge is checked after it.
    await MatterConfigCollector.validateMatterConfig(this.config)

    // Only the main bridge's own config decides Matter here. A child bridge's
    // Matter runs in that child's process, so it must not make api.matter or
    // isMatterEnabled() true for plugins on the main bridge - the same rule
    // isHapEnabled() follows.
    let matterIsActive = isMatterActive(this.config.bridge.matter)

    // Eagerly load the MatterAPI facade before plugins initialize, so api.matter
    // is defined when plugin code runs on a Matter-enabled main bridge. The heavy
    // MatterBridgeManager init still happens after plugins load (below) — only
    // the API surface needs to be ready early.
    // If matter.js can not be loaded, the bridge starts without Matter.
    if (matterIsActive) {
      matterIsActive = await this.api.tryLoadMatterAPI()
    }

    // initialize plugins
    await this.pluginManager.initializeInstalledPlugins()

    // Initialize Matter manager only if the main bridge uses Matter. Heavy
    // Matter.js libraries are loaded here (async), avoiding sync blocking
    // during construction.
    if (matterIsActive) {
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
    await this.matterManager?.restoreCachedAccessories(this.options.keepOrphanedCachedAccessories ?? false)

    this.api.signalFinished()

    // wait for all platforms to publish their accessories before we publish the bridge
    await Promise.all(promises)

    if (Server.isHapEnabled(this.config.bridge)) {
      await this.bridgeService.checkBridgePort()
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
    // Saves the cache and signals the plugins now; the promise is for the
    // goodbye of the HAP accessories, which is awaited below.
    const hapUnpublished = this.bridgeService.teardown()

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

    for (const timer of this.pendingMatterControlRequests.values()) {
      clearTimeout(timer)
    }
    this.pendingMatterControlRequests.clear()

    // "down" is only true once the accessories are off the network
    await hapUnpublished

    this.ipcService.stop()
    this.setServerStatus(ServerStatus.DOWN)
  }

  private publishBridge(): void {
    this.bridgeService.publishBridge()

    // The setup payload comes from what publish() stores on the bridge. When
    // the publish failed before that (it is logged by the bridge service),
    // asking for the payload threw "Cannot generate setupURI on an accessory
    // that isn't published yet!" and stopped Homebridge with that as the reason.
    if (!this.bridgeService.bridge._accessoryInfo) {
      log.error('The bridge was not published, so there is no setup code to show.')
      return
    }

    this.printSetupInfo(this.config.bridge.pin)
  }

  /**
   * Handle Matter command trigger from IPC (for UI control)
   * This is called by IPC handlers, not API events
   */
  private async handleTriggerMatterCommand(uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string): Promise<void> {
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

  private static loadConfig(): HomebridgeConfig {
    // Look for the configuration file
    const configPath = User.configPath()

    const defaultBridge: BridgeConfiguration = {
      name: 'Homebridge',
      username: 'CC:22:3D:E3:CE:30',
      pin: DEFAULT_PIN,
    }

    if (!existsSync(configPath)) {
      log.warn('config.json (%s) not found.', configPath)
      validatePin(defaultBridge.pin, 'bridge.pin')
      return { // return a default configuration
        bridge: defaultBridge,
        accessories: [],
        platforms: [],
      }
    }

    let config: Partial<HomebridgeConfig>
    try {
      // strip a UTF-8 byte order mark, which some Windows editors add and JSON.parse rejects
      config = JSON.parse(readFileSync(configPath, { encoding: 'utf8' }).replace(/^\uFEFF/, ''))
    } catch (error: unknown) {
      log.error('There was a problem reading your config.json file.')
      log.error('Please try pasting your config.json file here to validate it: https://jsonlint.com')
      log.error('')
      throw error
    }

    // Valid JSON that is not an object ("null", a list, a text) has none of the settings read below
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      throw new TypeError('Your config.json does not hold a configuration: it must be an object ({ ... }) with a "bridge" section.')
    }
    // "bridge": null got the default bridge before, as a missing section does: it still does
    if (config.bridge === null) {
      log.warn('The "bridge" section of your config.json is null, so the default bridge settings are used.')
      config.bridge = undefined as unknown as BridgeConfiguration
    }
    if (config.bridge !== undefined && (typeof config.bridge !== 'object' || Array.isArray(config.bridge))) {
      throw new TypeError('The "bridge" section of your config.json must be an object ({ ... }) with "name", "username" and "pin".')
    }

    config.accessories = Server.configBlocks(config.accessories, 'accessories')
    config.platforms = Server.configBlocks(config.platforms, 'platforms')

    if (config.ports !== undefined) {
      if (config.ports?.start && config.ports.end) {
        // Texts were used as they were: the port after "52100" was "521001".
        const start = parsePort(config.ports.start)
        const end = parsePort(config.ports.end)
        if (start === undefined || end === undefined) {
          log.error('Invalid configuration for \'ports\'. \'start\' and \'end\' must be whole numbers from 1 to 65535! Ignoring it!')
          config.ports = undefined
        } else if (start > end) {
          log.error('Invalid port pool configuration. End should be greater than or equal to start.')
          config.ports = undefined
        } else {
          config.ports = { start, end }
        }
      } else {
        log.error('Invalid configuration for \'ports\'. Missing \'start\' and \'end\' properties! Ignoring it!')
        config.ports = undefined
      }
    }

    const bridge: BridgeConfiguration = config.bridge || defaultBridge
    bridge.name = bridge.name || defaultBridge.name
    if (typeof bridge.name !== 'string') {
      // a name written as a number or true/false; anything else has no usable text
      const name: unknown = bridge.name
      bridge.name = typeof name === 'number' || typeof name === 'boolean'
        ? String(name)
        : defaultBridge.name
      log.warn(`Value provided in bridge.name is not a text. Using "${bridge.name}" as the name of the bridge.`)
    }
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

    validatePin(config.bridge.pin, 'bridge.pin')

    // No port, or 0, lets the system pick a free one
    if (config.bridge.port !== undefined && config.bridge.port !== null && config.bridge.port !== 0) {
      const port = parsePort(config.bridge.port)
      if (port === undefined) {
        log.error('Value provided in bridge.port is not valid: it must be a whole number from 1 to 65535. Using a random port instead.')
      }
      config.bridge.port = port
    }

    // Validate the main bridge HAP config (shape + externalsOnly/enabled coherence).
    validateHapConfig(config.bridge, { bridgeLabel: 'main bridge' })

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

  /**
   * The `accessories` or `platforms` list from the config, without the
   * entries that are not objects. Everything that walks these lists (the
   * loaders, the port collectors, the Matter validation) reads properties of
   * each entry, and a `null` entry made start-up fail with a TypeError.
   */
  private static configBlocks<T extends object>(value: unknown, section: 'accessories' | 'platforms'): T[] {
    if (value === undefined || value === null) {
      return []
    }
    if (!Array.isArray(value)) {
      log.error(`Value provided for ${section} must be an array[]`)
      return []
    }
    return value.filter((entry, index): entry is T => {
      const isBlock = typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      if (!isBlock) {
        log.warn(`Your config.json contains an entry in ${section} at position ${index + 1} that is not an object. Skipping entry...`)
      }
      return isBlock
    })
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
      } catch (error: unknown) {
        log.error(errorMessage(error))
        return
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the accessory "${accessoryIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`)
        return
      }

      try {
        constructor = plugin.getAccessoryConstructor(accessoryIdentifier)
      } catch (error: unknown) {
        log.error(`Error loading the accessory "${accessoryIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`)
        log.error(error instanceof Error
          ? (error.stack ?? error.message)
          : String(error)) // the stack holds the message and where it came from
        return
      }

      const logger = Logger.withPrefix(displayName)
      logger('Initializing %s accessory...', accessoryIdentifier)

      if (accessoryConfig._bridge) {
        try {
          this.validateChildBridgeConfig(PluginType.ACCESSORY, accessoryIdentifier, accessoryConfig._bridge)
        } catch (error: unknown) {
          log.error(errorMessage(error))
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
          childBridge.onExternalBridgeUnregistered = this.unregisterExternalMatterBridge.bind(this)
          // Cancel the parent-side fallback timer when this child answers a lookup
          childBridge.onAccessoryInfoResponse = this.cancelPendingMatterAccessoryInfoLookup.bind(this)
          childBridge.onAccessoryControlResponse = this.cancelPendingMatterControlRequest.bind(this)
          // Let the child's ONLINE handler re-arm Matter monitoring after a (re)start
          childBridge.isMatterMonitoringActive = () => this.matterMonitoringActive

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
        } catch (error: unknown) {
          logger.error(`Error loading the accessory "${accessoryIdentifier}" from "${plugin.getPluginIdentifier()}" requested in your config.json:`, errorMessage(error))
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
      } catch (error: unknown) {
        log.error(errorMessage(error))
        return
      }

      // check the plugin is not disabled
      if (plugin.disabled) {
        log.warn(`Ignoring config for the platform "${platformIdentifier}" in your config.json as the plugin "${plugin.getPluginIdentifier()}" has been disabled.`)
        return
      }

      try {
        constructor = plugin.getPlatformConstructor(platformIdentifier)
      } catch (error: unknown) {
        log.error(`Error loading the platform "${platformIdentifier}" requested in your config.json at position ${index + 1} - this is likely an issue with the "${plugin.getPluginIdentifier()}" plugin.`)
        log.error(error instanceof Error
          ? (error.stack ?? error.message)
          : String(error)) // the stack holds the message and where it came from
        return
      }

      const logger = Logger.withPrefix(displayName)
      logger('Initializing %s platform...', platformIdentifier)

      if (platformConfig._bridge) {
        try {
          this.validateChildBridgeConfig(PluginType.PLATFORM, platformIdentifier, platformConfig._bridge)
        } catch (error: unknown) {
          log.error(errorMessage(error))
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
        childBridge.onExternalBridgeUnregistered = this.unregisterExternalMatterBridge.bind(this)
        // Cancel the parent-side fallback timer when this child answers a lookup
        childBridge.onAccessoryInfoResponse = this.cancelPendingMatterAccessoryInfoLookup.bind(this)
        childBridge.onAccessoryControlResponse = this.cancelPendingMatterControlRequest.bind(this)
        // Let the child's ONLINE handler re-arm Matter monitoring after a (re)start
        childBridge.isMatterMonitoringActive = () => this.matterMonitoringActive

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
   * Validate a child bridge config (the `_bridge` block of a platform or accessory)
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
          + `Duplicate username found in _bridge.username: "${bridgeConfig.username}". Each platform child bridge must have its own unique username.`,
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
        + `Username found in _bridge.username: "${bridgeConfig.username}" is the same as the main bridge. Each child bridge platform/accessory must have its own unique username.`,
      )
    }

    // A child bridge with no pin of its own uses the one of the main bridge
    if (bridgeConfig.pin !== undefined && bridgeConfig.pin !== null && (bridgeConfig.pin as unknown) !== '') {
      try {
        validatePin(bridgeConfig.pin, '_bridge.pin')
      } catch (error: unknown) {
        throw new Error(
          `Error loading the ${type} "${identifier}" requested in your config.json - ${errorMessage(error)}`,
        )
      }
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
  private initializeIpcEventHandlers(): void {
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
      this.handleGetMatterAccessoryInfo(data?.uuid, data?.correlationId)
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
   * Forget an external Matter bridge whose accessory was unregistered, so the
   * routing list does not keep an entry for every accessory there ever was.
   * @param externalBridgeUsername - Username of the external Matter bridge
   */
  public unregisterExternalMatterBridge(externalBridgeUsername: string): void {
    const normalizedExternal = externalBridgeUsername.toUpperCase()
    if (this.externalMatterBridgeRegistry.delete(normalizedExternal)) {
      matterLogger.debug(`Removed external Matter bridge ${normalizedExternal} from the routing list`)
    }
  }

  /**
   * Cancel the pending fallback timer for a forwarded Matter accessory lookup.
   * Called by ChildBridgeService when a child responds with accessoryInfoData
   * so the 2s "Timed out" event isn't sent after a successful response.
   */
  private cancelPendingMatterAccessoryInfoLookup(uuid: string, correlationId?: string): void {
    // Same key as handleGetMatterAccessoryInfo: the id of the request when it
    // has one, so two lookups of one accessory do not cancel each other.
    const key = correlationId ?? uuid
    const timer = this.pendingMatterAccessoryInfoLookups.get(key)
    if (timer) {
      clearTimeout(timer)
      this.pendingMatterAccessoryInfoLookups.delete(key)
    }
  }

  /**
   * Cancel the fallback for a broadcast control request, because the child
   * that owns the accessory has answered it.
   */
  private cancelPendingMatterControlRequest(correlationId: string): void {
    const timer = this.pendingMatterControlRequests.get(correlationId)
    if (timer) {
      clearTimeout(timer)
      this.pendingMatterControlRequests.delete(correlationId)
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

      // Request from child bridges and wait for responses (with timeout).
      // A request that names a bridge is for that bridge only, as it is for
      // the main bridge above: before, every child bridge was asked and every
      // answer added, whatever the request said.
      const wantedUsername = bridgeUsername?.toUpperCase()
      const childBridges = [
        ...this.childBridges.values(),
      ].filter(
        childBridge => !wantedUsername || childBridge.getMetadata().username.toUpperCase() === wantedUsername,
      )
      if (childBridges.length > 0) {
        const results = await Promise.allSettled(
          childBridges.map(childBridge => childBridge.requestMatterAccessories()),
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
          error: error instanceof Error
            ? error.message
            : 'Unknown error',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Get detailed info for a specific Matter accessory.
   *
   * Every reply echoes the request's `correlationId`, as the other three
   * request types do: the UI drops an event that does not carry it.
   */
  private handleGetMatterAccessoryInfo(uuid?: string, correlationId?: string): void {
    if (!uuid) {
      const event: MatterEvent = {
        type: 'accessoryInfoData',
        correlationId,
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
          correlationId,
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
          childBridge.getMatterAccessoryInfo(uuid, correlationId)
          forwardedToChildren = true
        }
      }

      if (!forwardedToChildren) {
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
          type: 'accessoryInfoData',
          correlationId,
          data: { error: `Accessory ${uuid} not found`, uuid },
        })
        return
      }

      // 2s is comfortably longer than a healthy child response and short
      // enough that the UI doesn't feel stuck. Use unref() so a late
      // shutdown doesn't wait on this timer. The timer is registered in
      // pendingMatterAccessoryInfoLookups so a child's accessoryInfoData
      // response (routed via ChildBridgeService.onAccessoryInfoResponse) can
      // cancel it before it fires a spurious timed-out event. The timer is
      // kept under the request's correlationId; a request without one falls
      // back to the uuid, where a second concurrent request for the same uuid
      // replaces the existing timer.
      const lookupKey = correlationId ?? uuid
      const existing = this.pendingMatterAccessoryInfoLookups.get(lookupKey)
      if (existing) {
        clearTimeout(existing)
      }
      const fallback = setTimeout(() => {
        this.pendingMatterAccessoryInfoLookups.delete(lookupKey)
        this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
          type: 'accessoryInfoData',
          correlationId,
          data: {
            error: `Timed out looking up Matter accessory ${uuid}; it may not be registered.`,
            uuid,
            timedOut: true,
          },
        })
      }, 2000)
      fallback.unref()
      this.pendingMatterAccessoryInfoLookups.set(lookupKey, fallback)
    } catch (error) {
      matterLogger.error('Failed to get Matter accessory info:', error)
      const event: MatterEvent = {
        type: 'accessoryInfoData',
        correlationId,
        data: {
          error: error instanceof Error
            ? error.message
            : 'Unknown error',
        },
      }
      this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, event)
    }
  }

  /**
   * Send an `accessoryControlResponse` back over IPC, echoing the request's
   * `correlationId` when one was given. The UI parks each control request
   * under its correlationId and its dispatcher only delivers events that
   * carry it — a response without one is dropped, so the request would sit
   * through a 10s timeout, be retried (running the command a second time),
   * and then be reported as failed even though the control succeeded.
   */
  private sendMatterControlResponse(
    data: { success: boolean, uuid?: string, error?: string },
    correlationId?: string,
  ): void {
    this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, {
      type: 'accessoryControlResponse',
      correlationId,
      data,
    })
  }

  /**
   * Arm the "nobody answered" reply for a control request that was handed to
   * one or more child bridges. A child that does not have the accessory, or
   * has no Matter running, stays silent, so without this nothing is sent back
   * at all. Mirrors the accessoryInfoData fallback: a short timer that the
   * owner's response cancels (via ChildBridgeService.onAccessoryControlResponse).
   *
   * Only meaningful with a correlationId: the UI drops any response without
   * one, so there would be nothing to rescue.
   */
  private armMatterControlFallback(uuid: string, correlationId: string | undefined, reason: string): void {
    if (!correlationId) {
      return
    }
    const existing = this.pendingMatterControlRequests.get(correlationId)
    if (existing) {
      clearTimeout(existing)
    }
    const fallback = setTimeout(() => {
      this.pendingMatterControlRequests.delete(correlationId)
      matterLogger.warn(`Accessory ${uuid} not found - ${reason}`)
      this.sendMatterControlResponse({ success: false, error: 'Accessory not found', uuid }, correlationId)
    }, 2000)
    fallback.unref()
    this.pendingMatterControlRequests.set(correlationId, fallback)
  }

  /**
   * Hand a control request to the one child bridge it names. The request is
   * always answered: at once when the child process is not running (stopped,
   * restarting, or waiting to be restarted after a crash), and by the fallback
   * when the child is running but does not answer.
   */
  private forwardMatterControlToChild(
    childBridge: ChildBridgeService,
    data: { uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string, correlationId?: string },
  ): void {
    if (!childBridge.controlMatterAccessory(data)) {
      matterLogger.warn(`Cannot control ${data.uuid} - child bridge ${childBridge.identifier} is not running`)
      this.sendMatterControlResponse({ success: false, error: 'Child bridge is not running', uuid: data.uuid }, data.correlationId)
      return
    }
    this.armMatterControlFallback(data.uuid, data.correlationId, `child bridge ${childBridge.identifier} did not claim it`)
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
    correlationId?: string
  }): Promise<void> {
    matterLogger.debug(`Matter control request: uuid=${data?.uuid}, cluster=${data?.cluster}, bridge=${data?.bridgeUsername || 'auto'}, part=${data?.partId || 'main'}`)
    const correlationId = data?.correlationId

    if (!data?.uuid || !data?.cluster || !data?.attributes) {
      matterLogger.error('Missing required parameters for Matter control')
      this.sendMatterControlResponse({
        success: false,
        error: 'Missing required parameters',
      }, correlationId)
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
          this.sendMatterControlResponse({ success: true, uuid: data.uuid }, correlationId)
        } catch (error: unknown) {
          matterLogger.error(`Main bridge failed to control ${data.uuid}: ${errorMessage(error)}`)
          this.sendMatterControlResponse({
            success: false,
            error: errorMessage(error),
            uuid: data.uuid,
          }, correlationId)
        }
        return
      }

      // Check if it's a specific child bridge
      for (const childBridge of this.childBridges.values()) {
        if (childBridge.getMetadata().username.toUpperCase() === targetUsername) {
          matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${targetUsername})`)
          this.forwardMatterControlToChild(childBridge, data)
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
            this.sendMatterControlResponse({ success: true, uuid: data.uuid }, correlationId)
          } catch (error: unknown) {
            matterLogger.error(`Main bridge failed to control external accessory ${data.uuid}: ${errorMessage(error)}`)
            this.sendMatterControlResponse({
              success: false,
              error: errorMessage(error),
              uuid: data.uuid,
            }, correlationId)
          }
        } else {
          // External accessory on child bridge - lookup by username
          const childBridge = this.childBridges.get(ownerUsername)
          if (childBridge) {
            matterLogger.debug(`Routing to child bridge ${childBridge.identifier} (${ownerUsername}) for external accessory ${data.uuid}`)
            this.forwardMatterControlToChild(childBridge, data)
          } else {
            matterLogger.error(`Owner bridge ${ownerUsername} not found for external bridge ${targetUsername}`)
            this.sendMatterControlResponse({ success: false, error: `Owner bridge ${ownerUsername} not found`, uuid: data.uuid }, correlationId)
          }
        }
        return
      }

      // Bridge username provided but not found anywhere
      // With registry, we should always be able to find the bridge if the data is correct
      matterLogger.error(`Bridge ${targetUsername} not found in main/child bridges or registry`)
      this.sendMatterControlResponse({ success: false, error: `Bridge ${targetUsername} not found`, uuid: data.uuid }, correlationId)
      return
    }

    // No bridge username provided - broadcast mode (try main, then all children)
    if (this.matterManager) {
      matterLogger.debug(`Broadcast mode: trying main bridge for accessory ${data.uuid}`)
      try {
        await this.handleTriggerMatterCommand(data.uuid, data.cluster, data.attributes, data.partId)
        matterLogger.debug(`Main bridge successfully controlled accessory ${data.uuid}`)
        this.sendMatterControlResponse({ success: true, uuid: data.uuid }, correlationId)
        return
      } catch (error: unknown) {
        // Only "this bridge does not have the accessory" sends the request on
        // to the child bridges. Any other error is a real failure on the main
        // bridge's own accessory (a plugin handler that threw, say): before,
        // it was dropped without a log line and the UI was told "Accessory not
        // found" two seconds later.
        if (!(error instanceof MatterAccessoryNotOnBridgeError)) {
          const message = error instanceof Error
            ? error.message
            : String(error)
          matterLogger.error(`Main bridge failed to control ${data.uuid}: ${message}`)
          this.sendMatterControlResponse({ success: false, error: message, uuid: data.uuid }, correlationId)
          return
        }
      }
    }

    // Main bridge doesn't have accessory - forward to child bridges whose
    // Matter is actually active. A child with `matter: { enabled: false }`
    // still carries a matterConfig block but never starts a Matter handler,
    // so forwarding a control request to it would just be dropped. Gate on
    // isMatterActive (enabled or externalsOnly) — the same condition under
    // which the child creates its Matter handler.
    const matterChildBridges = [
      ...this.childBridges.values(),
    ].filter(
      bridge => isMatterActive(bridge.getMetadata().matterConfig),
    )

    if (matterChildBridges.length > 0) {
      matterLogger.debug(`Main bridge doesn't have accessory ${data.uuid}, forwarding to ${matterChildBridges.length} child bridge(s) with Matter enabled`)
      for (const childBridge of matterChildBridges) {
        childBridge.controlMatterAccessory(data)
      }

      // Every Matter child is asked and only the owner answers - a child that
      // does not have the accessory returns silently, by design. So when no
      // child owns it nothing is sent back at all, and the UI sat through its
      // own 10s timeout, retried the command, then reported a failure.
      this.armMatterControlFallback(data.uuid, correlationId, 'no child bridge with Matter claimed it')
    } else {
      matterLogger.warn(`Accessory ${data.uuid} not found - not on main bridge and no child bridges with Matter available`)
      this.sendMatterControlResponse({ success: false, error: 'Accessory not found', uuid: data.uuid }, correlationId)
    }
  }

  private printSetupInfo(pin: string): void {
    /* eslint-disable no-console */
    console.log('Setup Payload:')
    console.log(this.bridgeService.bridge.setupURI())

    if (!this.options.hideQRCode) {
      console.log('Scan this code with your HomeKit app on your iOS device to pair with Homebridge:')
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
