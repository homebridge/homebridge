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
import type { InternalMatterAccessory, MatterAccessory } from './matter/index.js'
import type { Plugin } from './plugin.js'
import type { PluginManagerOptions } from './pluginManager.js'

import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import chalk from 'chalk'
import { AccessoryEventTypes, MDNSAdvertiser } from 'hap-nodejs'
import qrcode from 'qrcode-terminal'

import { HomebridgeAPI, InternalAPIEvent, PluginType } from './api.js'
import { BridgeService } from './bridgeService.js'
import { ChildBridgeService } from './childBridgeService.js'
import { ExternalPortService } from './externalPortService.js'
import { IpcIncomingEvent, IpcOutgoingEvent, IpcService, ServerStatusUpdate } from './ipcService.js'
import { Logger } from './logger.js'
import { MatterBridgeManager, MatterConfigCollector } from './matter/index.js'
import { PlatformAccessory } from './platformAccessory.js'
import { PluginManager } from './pluginManager.js'
import { User } from './user.js'
import { validMacAddress } from './util/mac.js'

const log = Logger.internal

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
  private readonly ipcService: IpcService
  private readonly externalPortService: ExternalPortService

  private readonly config: HomebridgeConfig

  // used to keep track of child bridges
  // Key is HAP username (MAC address)
  private readonly childBridges: Map<string, ChildBridgeService> = new Map()

  // Matter bridge manager (handles Matter server lifecycle)
  // Made optional to handle initialization order - gets created in constructor after first setServerStatus call
  private matterManager?: MatterBridgeManager

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
    const configuredMatterPorts = MatterBridgeManager.collectConfiguredMatterPorts(this.config)

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

    // Create Matter bridge manager
    this.matterManager = new MatterBridgeManager(
      this.config,
      this.api,
      this.externalPortService,
      this.pluginManager,
      this.options,
    )

    // Set manager reference on API for getAccessoryState
    this.api._setMatterManager(this.matterManager)

    // Handle platform accessory registration
    this.api.on(InternalAPIEvent.REGISTER_PLATFORM_ACCESSORIES, this.handleRegisterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UNREGISTER_PLATFORM_ACCESSORIES, this.handleUnregisterPlatformAccessories.bind(this))

    // Handle external accessories (cameras, etc.)
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_ACCESSORIES, this.handlePublishExternalAccessories.bind(this))

    // Handle Matter accessory registration (matching HAP pattern)
    this.api.on(InternalAPIEvent.PUBLISH_EXTERNAL_MATTER_ACCESSORIES, this.handlePublishExternalMatterAccessories.bind(this))
    this.api.on(InternalAPIEvent.REGISTER_MATTER_PLATFORM_ACCESSORIES, this.handleRegisterMatterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UPDATE_MATTER_PLATFORM_ACCESSORIES, this.handleUpdateMatterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UNREGISTER_MATTER_PLATFORM_ACCESSORIES, this.handleUnregisterMatterPlatformAccessories.bind(this))
    this.api.on(InternalAPIEvent.UNREGISTER_EXTERNAL_MATTER_ACCESSORIES, this.handleUnregisterExternalMatterAccessories.bind(this))
    this.api.on(InternalAPIEvent.UPDATE_MATTER_ACCESSORY_STATE, this.handleUpdateMatterAccessoryState.bind(this))

    // watch bridge events to check when server is online
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

    const statusUpdate: ServerStatusUpdate = {
      status: this.serverStatus,
      paired: this.bridgeService?.bridge?._accessoryInfo?.paired() ?? null,
      setupUri: this.bridgeService?.bridge?.setupURI() ?? null,
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

    // initialize plugins
    await this.pluginManager.initializeInstalledPlugins()

    // Initialize Matter server for main bridge if enabled
    await this.matterManager?.initialize()

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
      .then(() => this.publishBridge())
  }

  public async teardown(): Promise<void> {
    this.bridgeService.teardown()

    // Teardown Matter servers (main bridge and external accessories)
    await this.matterManager?.teardown()

    this.setServerStatus(ServerStatus.DOWN)
  }

  private publishBridge(): void {
    this.bridgeService.publishBridge()
    this.printSetupInfo(this.config.bridge.pin)
  }

  private handlePublishExternalAccessories(accessories: PlatformAccessory[]): void {
    // External accessories are published via HAP
    // Plugins should use api.matter to register Matter accessories explicitly
    log.info(`Publishing ${accessories.length} external accessories`)
  }

  /**
   * Handle external Matter accessories - delegates to MatterBridgeManager
   */
  private handlePublishExternalMatterAccessories(accessories: MatterAccessory[], registrationId: string): void {
    this.matterManager?.handlePublishExternalAccessories(accessories as InternalMatterAccessory[], registrationId).catch((error) => {
      log.error('Failed to publish external Matter accessories:', error)
      // Make sure to resolve the registration even on error
      this.api._resolveExternalRegistration(registrationId)
    })
  }

  private handleRegisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    // Route to HAP bridge
    this.bridgeService.handleRegisterPlatformAccessories(accessories)
  }

  private handleUnregisterPlatformAccessories(accessories: PlatformAccessory[]): void {
    // Route to HAP bridge
    this.bridgeService.handleUnregisterPlatformAccessories(accessories)
  }

  private handleRegisterMatterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): void {
    this.matterManager?.handleRegisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to register Matter accessories for ${pluginIdentifier}:`, error)
    })
  }

  private handleUpdateMatterPlatformAccessories(accessories: MatterAccessory[]): void {
    this.matterManager?.handleUpdatePlatformAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to update Matter platform accessories:', error)
    })
  }

  private handleUnregisterMatterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): void {
    this.matterManager?.handleUnregisterPlatformAccessories(pluginIdentifier, platformName, accessories as InternalMatterAccessory[]).catch((error) => {
      log.error(`Failed to unregister Matter accessories for ${pluginIdentifier}:`, error)
    })
  }

  private handleUnregisterExternalMatterAccessories(accessories: MatterAccessory[]): void {
    this.matterManager?.handleUnregisterExternalAccessories(accessories as InternalMatterAccessory[]).catch((error) => {
      log.error('Failed to unregister external Matter accessories:', error)
    })
  }

  private handleUpdateMatterAccessoryState(uuid: string, cluster: string, attributes: Record<string, any>, partId?: string): void {
    this.matterManager?.handleUpdateAccessoryState(uuid, cluster, attributes, partId).catch((error) => {
      log.error(`Failed to update Matter accessory state for ${uuid}:`, error)
    })
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

    if (config.matterPorts !== undefined) {
      if (config.matterPorts.start && config.matterPorts.end) {
        if (config.matterPorts.start > config.matterPorts.end) {
          log.error('Invalid Matter port pool configuration. End should be greater than or equal to start.')
          config.matterPorts = undefined
        }
      } else {
        log.error('Invalid configuration for \'matterPorts\'. Missing \'start\' and \'end\' properties! Ignoring it!')
        config.matterPorts = undefined
      }
    }

    const bridge: BridgeConfiguration = config.bridge || defaultBridge
    bridge.name = bridge.name || defaultBridge.name
    bridge.username = bridge.username || defaultBridge.username
    bridge.pin = bridge.pin || defaultBridge.pin
    config.bridge = bridge

    const username = config.bridge.username
    if (!validMacAddress(username)) {
      throw new Error(`Not a valid username: ${username}. Must be 6 pairs of colon-separated hexadecimal chars (A-F 0-9), like a MAC address.`)
    }

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

    // Validate Matter configuration for port conflicts
    MatterConfigCollector.validateMatterConfig(config as HomebridgeConfig)

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

    if (bridgeConfig.username === this.config.bridge.username.toUpperCase()) {
      throw new Error(
        `Error loading the ${type} "${identifier}" requested in your config.json - `
        + `Username found in _bridge.username: "${bridgeConfig.username}" is the same as the main bridge. Each child bridge platform/accessory must have it's own unique username.`,
      )
    }
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
        Array.from(this.childBridges.values()).map(x => x.getMetadata()),
      )
    })
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
