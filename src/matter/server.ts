/**
 * Matter.js Server Implementation for Homebridge Plugin API
 *
 * This provides a Matter bridge that plugins can use to register
 * Matter accessories via the Homebridge API.
 */

import type { EndpointType } from '@matter/main'
import type { Behavior } from '@matter/node'

import type { SerializedMatterAccessory } from './accessoryCache.js'

import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { constants } from 'node:fs'
import { access, writeFile } from 'node:fs/promises'
import { homedir, release } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import process from 'node:process'

import {
  Endpoint,
  Environment,
  Logger as MatterLogger,
  LogLevel as MatterLogLevel,
  ServerNode,
  StorageService,
  VendorId,
} from '@matter/main'
import { BridgedDeviceBasicInformationServer } from '@matter/main/behaviors'
import * as clusters from '@matter/main/clusters'
import * as devices from '@matter/main/devices'
import { AggregatorEndpoint } from '@matter/main/endpoints'
import { PowerSourceServer } from '@matter/node/behaviors'
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/types/schema'
import fse from 'fs-extra'
import QRCode from 'qrcode-terminal'

import { Logger } from '../logger.js'
import getVersion from '../version.js'
import { MatterAccessoryCache } from './accessoryCache.js'
import {
  BehaviorRegistry,
  HomebridgeAirQualityServer,
  HomebridgeColorControlServer,
  HomebridgeDoorLockServer,
  HomebridgeFanControlServer,
  HomebridgeIdentifyServer,
  HomebridgeLevelControlServer,
  HomebridgeOnOffServer,
  HomebridgeRvcCleanModeServer,
  HomebridgeRvcOperationalStateServer,
  HomebridgeRvcRunModeServer,
  HomebridgeServiceAreaServer,
  HomebridgeThermostatServer,
  HomebridgeWindowCoveringServer,
} from './behaviors/index.js'
import { sanitizeUniqueId, truncateString, validatePort } from './configValidator.js'
import { errorHandler } from './errorHandler.js'
import { createHomebridgeLogFormatter } from './logFormatter.js'
import {
  applyWindowCoveringFeatures,
  CLUSTER_IDS,
  detectBehaviorFeatures,
  detectWindowCoveringFeatures,
  determineColorControlFeaturesFromHandlers,
  extractColorControlFeatures,
  extractThermostatFeatures,
  validateAccessoryRequiredFields,
} from './serverHelpers.js'
import { MatterServerConfig } from './sharedTypes.js'
import { MatterStorageManager } from './storage.js'
import { isDeviceType, withBehaviors, withFeatures } from './typeHelpers.js'
import {
  deviceTypes,
  InternalMatterAccessory,
  InternalMatterAccessoryPart,
  MatterAccessory,
  MatterAccessoryEventEmitter,
  MatterDeviceError,
  MatterServerEvents,
} from './types.js'

/**
 * Type representing a behavior class (constructor)
 */
type BehaviorType = Behavior.Type

const log = Logger.withPrefix('Matter/Server')

/**
 * Constants for Matter server configuration
 */
const DEFAULT_MATTER_PORT = 5540
const DEFAULT_VENDOR_ID = 0xFFF1 // test vendor ID from Matter spec
const DEFAULT_PRODUCT_ID = 0x8001 // test product ID
const MAX_DEVICES_PER_BRIDGE = 1000 // matter spec maximum devices per aggregator
const SERVER_READY_TIMEOUT_MS = 5000
const SERVER_READY_POLL_INTERVAL_MS = 100
const SERVER_INIT_DELAY_MS = 200
const MAX_PASSCODE_ATTEMPTS = 100

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

  private readonly config: MatterServerConfig
  private serverNode: ServerNode | null = null
  private aggregator: Endpoint<typeof AggregatorEndpoint> | null = null
  private accessories: Map<string, InternalMatterAccessory> = new Map()
  private readonly behaviorRegistry: BehaviorRegistry
  private isRunning = false
  private readonly MAX_DEVICES = MAX_DEVICES_PER_BRIDGE
  private shutdownHandler: (() => Promise<void>) | null = null

  // Map cluster names to custom behavior classes
  // Only clusters with user-triggered commands need custom behaviors
  private static readonly CLUSTER_BEHAVIOR_MAP: Record<string, BehaviorType> = {
    // Core controls
    onOff: HomebridgeOnOffServer,
    levelControl: HomebridgeLevelControlServer,
    colorControl: HomebridgeColorControlServer,

    // Coverings & locks
    windowCovering: HomebridgeWindowCoveringServer,
    doorLock: HomebridgeDoorLockServer,

    // Climate control
    fanControl: HomebridgeFanControlServer,
    thermostat: HomebridgeThermostatServer,

    // Robotic vacuum cleaners
    rvcOperationalState: HomebridgeRvcOperationalStateServer,
    rvcRunMode: HomebridgeRvcRunModeServer,
    rvcCleanMode: HomebridgeRvcCleanModeServer,
    serviceArea: HomebridgeServiceAreaServer,

    // Identification
    identify: HomebridgeIdentifyServer,
  } as const

  // Internal commissioning values (generated, not user-configurable)
  private passcode: number = 0
  private discriminator: number = 0
  private readonly vendorId: number
  private readonly productId: number

  private commissioningInfo: {
    qrCode?: string
    manualPairingCode?: string
    qrCodeUrl?: string
  } = {}

  private serialNumber?: string
  private cleanupHandlers: Array<() => void | Promise<void>> = []
  private storageManager: MatterStorageManager | null = null
  private matterStoragePath?: string
  private accessoryCache: MatterAccessoryCache | null = null

  constructor(config: MatterServerConfig) {
    super()

    // Store the validated config
    this.config = this.validateAndSanitizeConfig(config)

    // Configure Matter.js library logging
    // Suppress DEBUG/INFO logs from Matter.js library unless debug mode is explicitly enabled
    if (this.config.debugModeEnabled) {
      log.info('Matter debug mode enabled - verbose logging active')
      MatterLogger.level = MatterLogLevel.DEBUG
    } else {
      MatterLogger.level = MatterLogLevel.NOTICE
    }

    // Set custom log format to match homebridge format
    MatterLogger.format = createHomebridgeLogFormatter()

    // Redirect all Matter.js logs to console.log to prevent console.debug() suppression.
    // Matter.js uses console.debug() for DEBUG level logs, which is silently ignored in many Node.js environments.
    MatterLogger.destinations.default.write = (text: string) => {
      // Skip empty strings to avoid blank lines (from suppressed log facilities)
      if (text.trim() !== '') {
        console.log(text) // eslint-disable-line no-console
      }
    }

    // Initialize commissioning values (will be loaded from storage in start())
    this.vendorId = DEFAULT_VENDOR_ID
    this.productId = DEFAULT_PRODUCT_ID

    // Create behavior registry and set it on all behavior classes
    this.behaviorRegistry = new BehaviorRegistry(this.accessories)

    // Set the registry on all custom behavior classes
    HomebridgeAirQualityServer.setRegistry(this.behaviorRegistry)
    HomebridgeOnOffServer.setRegistry(this.behaviorRegistry)
    HomebridgeLevelControlServer.setRegistry(this.behaviorRegistry)
    HomebridgeColorControlServer.setRegistry(this.behaviorRegistry)
    HomebridgeWindowCoveringServer.setRegistry(this.behaviorRegistry)
    HomebridgeDoorLockServer.setRegistry(this.behaviorRegistry)
    HomebridgeFanControlServer.setRegistry(this.behaviorRegistry)
    HomebridgeThermostatServer.setRegistry(this.behaviorRegistry)
    HomebridgeIdentifyServer.setRegistry(this.behaviorRegistry)
    HomebridgeRvcOperationalStateServer.setRegistry(this.behaviorRegistry)
    HomebridgeRvcRunModeServer.setRegistry(this.behaviorRegistry)
    HomebridgeRvcCleanModeServer.setRegistry(this.behaviorRegistry)
    HomebridgeServiceAreaServer.setRegistry(this.behaviorRegistry)
  }

  /**
   * Validate and sanitize Matter server configuration
   * Throws descriptive errors if configuration is invalid
   */
  private validateAndSanitizeConfig(config: MatterServerConfig): MatterServerConfig {
    const errors: string[] = []

    // Validate port
    const port = config.port || DEFAULT_MATTER_PORT
    const portValidation = validatePort(port, false)
    if (!portValidation.valid) {
      errors.push(`Invalid port: ${portValidation.error}`)
    }

    // Validate and sanitize uniqueId (REQUIRED)
    if (!config.uniqueId) {
      errors.push('uniqueId is required for Matter server configuration')
    }

    const rawUniqueId = config.uniqueId || ''
    const uniqueIdResult = sanitizeUniqueId(rawUniqueId)
    const uniqueId = uniqueIdResult.value

    if (uniqueId.length === 0) {
      errors.push('Invalid uniqueId: must be a non-empty string')
    }

    // Validate storagePath (if provided)
    let storagePath = config.storagePath
    if (storagePath !== undefined) {
      storagePath = resolve(storagePath) // resolve to absolute path
    }

    // Validate and sanitize manufacturer
    let manufacturer = config.manufacturer
    if (manufacturer !== undefined) {
      manufacturer = truncateString(manufacturer, 32, 'Manufacturer name').value
    }

    // Validate and sanitize model
    let model = config.model
    if (model !== undefined) {
      model = truncateString(model, 32, 'Model name').value
    }

    // Validate firmwareRevision
    let firmwareRevision = config.firmwareRevision
    if (firmwareRevision !== undefined) {
      firmwareRevision = truncateString(firmwareRevision, 64, 'Firmware revision').value
    }

    // Validate serialNumber
    let serialNumber = config.serialNumber
    if (serialNumber !== undefined) {
      serialNumber = truncateString(serialNumber, 32, 'Serial number').value
    }

    // Validate debugModeEnabled
    const debugModeEnabled = config.debugModeEnabled || false

    // Validate externalAccessory
    const externalAccessory = config.externalAccessory || false

    // Throw if there are validation errors
    if (errors.length > 0) {
      throw new MatterDeviceError(
        `Matter configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`,
      )
    }

    return {
      port,
      uniqueId,
      storagePath,
      manufacturer,
      model,
      firmwareRevision,
      serialNumber,
      debugModeEnabled,
      externalAccessory,
    }
  }

  /**
   * Generate a secure random passcode
   * According to Matter spec, passcode must be:
   * - 8 digits (00000001 to 99999998)
   * - Not in the invalid list
   * - Not sequential or repeating patterns
   */
  private generateSecurePasscode(): number {
    let passcode: number
    const maxAttempts = MAX_PASSCODE_ATTEMPTS
    let attempts = 0

    const invalidPasscodes = [
      0,
      11111111,
      22222222,
      33333333,
      44444444,
      55555555,
      66666666,
      77777777,
      88888888,
      99999999,
      12345678,
      87654321,
    ]

    do {
      // Use cryptographically secure random number generation
      const randomValue = randomBytes(4).readUInt32BE(0)
      // Generate a value between 1 and 99999998
      passcode = (randomValue % 99999998) + 1

      attempts++
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate secure passcode after maximum attempts')
      }
    } while (
      invalidPasscodes.includes(passcode)
      || !this.isValidPasscode(passcode)
    )

    return passcode
  }

  /**
   * Validate a passcode according to Matter specifications
   */
  private isValidPasscode(passcode: number): boolean {
    // Must be between 1 and 99999998
    if (passcode < 1 || passcode > 99999998) {
      return false
    }

    // Convert to 8-digit string
    const passcodeStr = passcode.toString().padStart(8, '0')

    // Check for sequential patterns (12345678, 23456789, etc.)
    let isSequential = true
    for (let i = 1; i < passcodeStr.length; i++) {
      if (Number.parseInt(passcodeStr[i]) !== Number.parseInt(passcodeStr[i - 1]) + 1) {
        isSequential = false
        break
      }
    }
    if (isSequential) {
      return false
    }

    // Check for reverse sequential (87654321, 76543210, etc.)
    let isReverseSequential = true
    for (let i = 1; i < passcodeStr.length; i++) {
      if (Number.parseInt(passcodeStr[i]) !== Number.parseInt(passcodeStr[i - 1]) - 1) {
        isReverseSequential = false
        break
      }
    }
    if (isReverseSequential) {
      return false
    }

    // Check for too many repeating digits (more than 3 of same digit)
    const digitCounts = new Map<string, number>()
    for (const digit of passcodeStr) {
      digitCounts.set(digit, (digitCounts.get(digit) || 0) + 1)
      const count = digitCounts.get(digit)
      if (count !== undefined && count > 3) {
        return false
      }
    }

    return true
  }

  /**
   * Generate a random discriminator
   * According to Matter spec, discriminator must be:
   * - 12 bits (0-4095)
   * - Should be random for security
   */
  private generateRandomDiscriminator(): number {
    // Generate cryptographically secure random 12-bit discriminator (0-4095)
    const discriminator = randomBytes(2).readUInt16BE(0) & 0x0FFF // Mask to 12 bits

    // Validate discriminator range
    if (discriminator < 0 || discriminator > 4095) {
      throw new Error(`Invalid discriminator generated: ${discriminator}`)
    }

    return discriminator
  }

  /**
   * Create ServerNode with automatic recovery from corrupted storage
   *
   * Matter.js can fail to start if fabric data is corrupted (common after
   * hard shutdowns or disk errors). This method implements automatic recovery by:
   *
   * 1. Attempting normal ServerNode creation
   * 2. If it fails with storage errors, identifying and removing corrupted files
   * 3. Retrying ServerNode creation with fresh storage
   *
   * This prevents the need for manual intervention while preserving data
   * safety by only removing storage on confirmed corruption errors.
   *
   * @param nodeOptions - Matter.js ServerNode configuration
   * @param sanitizedId - Filesystem-safe bridge identifier
   * @returns Initialized ServerNode instance
   * @throws Error if recovery fails or error is not storage-related
   */
  private async createServerNodeWithRecovery(
    nodeOptions: Parameters<typeof ServerNode.create>[0],
    sanitizedId: string,
  ): Promise<ServerNode> {
    try {
      // First attempt to create ServerNode
      return await ServerNode.create(nodeOptions)
    } catch (error: unknown) {
      // Check if this is a storage corruption error
      const errorMessage = error instanceof Error ? error.message : ''
      const causeMessage = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      const isStorageError = errorMessage.includes('Invalid public key encoding')
        || errorMessage.includes('FabricManager unavailable')
        || errorMessage.includes('key-input')
        || causeMessage.includes('Invalid public key encoding')

      if (!isStorageError) {
        // Not a storage error, rethrow
        throw error
      }

      // Storage is corrupted - clean up and retry
      log.warn('Detected corrupted Matter storage, attempting automatic recovery...')

      // The ServerNodeStore directory is inside our storage path with the same name as the bridge ID
      const environment = Environment.default
      const storageService = environment.get(StorageService)
      const storageLocation = storageService.location

      if (!storageLocation) {
        throw new Error('Storage location not set, cannot recover from corrupted storage')
      }

      const serverNodeStorePath = join(storageLocation, sanitizedId)
      const serverNodeStoreJsonFile = `${serverNodeStorePath}.json`

      try {
        let removedSomething = false

        // Delete the ServerNodeStore subdirectory (async check and removal)
        try {
          await fse.stat(serverNodeStorePath)
          log.info(`Removing corrupted ServerNodeStore directory: ${serverNodeStorePath}`)
          await fse.remove(serverNodeStorePath)
          removedSomething = true
        } catch (err: unknown) {
          const code = err instanceof Error && 'code' in err ? (err as any).code : undefined
          if (code !== 'ENOENT') {
            throw err
          }
        }

        // Delete the ServerNodeStore JSON file (contains fabric data)
        try {
          await fse.stat(serverNodeStoreJsonFile)
          log.info(`Removing corrupted ServerNodeStore JSON file: ${serverNodeStoreJsonFile}`)
          await fse.remove(serverNodeStoreJsonFile)
          removedSomething = true
        } catch (err: unknown) {
          const code = err instanceof Error && 'code' in err ? (err as any).code : undefined
          if (code !== 'ENOENT') {
            throw err
          }
        }

        if (removedSomething) {
          log.info('Corrupted storage removed, retrying ServerNode creation...')
        } else {
          log.warn('No corrupted storage files found, corruption may be elsewhere')
        }

        // Retry ServerNode creation
        const serverNode = await ServerNode.create(nodeOptions)
        log.info('Successfully recovered from corrupted Matter storage')
        return serverNode
      } catch (retryError) {
        log.error('Failed to recover from corrupted storage:', retryError)
        log.error('Original error:', error)
        throw new Error(
          'Matter storage is corrupted and automatic recovery failed. '
          + `Please manually delete: ${serverNodeStorePath}`,
        )
      }
    }
  }

  /**
   * Start the Matter server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Matter server is already running')
      return
    }

    try {
      log.info('Starting Matter.js server...')

      // IMPORTANT: Storage must be configured BEFORE any Matter.js operations
      // This ensures persistent fabric data across restarts
      await this.setupStorage()

      // Load or generate commissioning credentials
      await this.loadOrGenerateCredentials()

      log.info(`Configuration: Port=${this.config.port}, Passcode=${this.passcode}, Discriminator=${this.discriminator}`)

      // Configure network interfaces if specified in the config
      if (this.config.networkInterfaces && this.config.networkInterfaces.length > 0) {
        const environment = Environment.default
        const interfaceConfig: Record<string, { type: number }> = {}

        // Map each interface name to type 2 (Ethernet) as default
        // Matter.js will use only these interfaces for the server
        for (const interfaceName of this.config.networkInterfaces) {
          interfaceConfig[interfaceName] = { type: 2 } // 2 = Ethernet
        }

        environment.vars.set('network.interface', interfaceConfig)
        log.info(`Configured Matter server to use network interfaces: ${this.config.networkInterfaces.join(', ')}`)
      } else {
        log.debug('No network interfaces specified, using all available interfaces')
      }

      // Create commissioning options
      const commissioningOptions = {
        passcode: this.passcode,
        discriminator: this.discriminator,
      }

      log.info(`Using commissioning credentials: passcode=${this.passcode}, discriminator=${this.discriminator}`)

      // Use different names based on mode
      const displayName = this.config.externalAccessory
        ? (this.config.model || 'Matter Device')
        : 'Homebridge Matter Bridge'

      // uniqueId is already sanitized in validateAndSanitizeConfig()
      const sanitizedId = this.config.uniqueId!

      // Create node options with proper typing
      const nodeOptions: Parameters<typeof ServerNode.create>[0] = {
        id: sanitizedId,
        network: {
          port: this.config.port,
          ipv4: true, // Always enable IPv4 for Matter
        },
        commissioning: commissioningOptions,
        basicInformation: {
          nodeLabel: displayName.slice(0, 32), // Maximum 32 characters
          vendorId: VendorId(this.vendorId),
          vendorName: (this.config.manufacturer || 'Homebridge').slice(0, 32),
          productId: this.productId,
          productName: displayName.slice(0, 32),
          productLabel: displayName.slice(0, 64), // Maximum 64 characters
          serialNumber: this.serialNumber = this.config.serialNumber || this.config.uniqueId,
          hardwareVersion: 1,
          hardwareVersionString: release(),
          softwareVersion: 1,
          softwareVersionString: this.config.firmwareRevision || getVersion(),
          reachable: true,
        },
      }

      // Only add productDescription with bridge deviceType in bridge mode
      if (!this.config.externalAccessory) {
        nodeOptions.productDescription = {
          name: displayName,
          deviceType: AggregatorEndpoint.deviceType,
        }
      }

      // Create server node with automatic recovery from corrupted storage
      this.serverNode = await this.createServerNodeWithRecovery(nodeOptions, sanitizedId)

      // Set up commissioning event listeners
      this.setupCommissioningEventListeners()

      // Create aggregator endpoint for bridge pattern (skip for external accessories)
      if (!this.config.externalAccessory) {
        this.aggregator = new Endpoint(AggregatorEndpoint, {
          id: 'homebridge-aggregator',
        })

        // Add aggregator to server
        await this.serverNode.add(this.aggregator)
        log.debug('Created aggregator endpoint for bridged mode')
      } else {
        log.debug('External accessory mode - skipping aggregator creation')
      }

      // Generate and display commissioning information
      await this.generateCommissioningInfo()

      // Set up graceful shutdown handler
      this.shutdownHandler = async () => {
        log.info('Shutting down Matter server...')
        await this.stop()
      }

      // Register shutdown handlers
      process.on('SIGINT', this.shutdownHandler)
      process.on('SIGTERM', this.shutdownHandler)

      // If external accessory mode, skip running the server now (will be run later via runServer())
      if (!this.config.externalAccessory) {
        // Start the server in a non-blocking way
        this.serverNode.run().then(
          () => {
            log.info('Matter server stopped normally')
          },
          (error) => {
            log.error('Matter server stopped with error:', error)
            errorHandler.handleError(error, 'server-runtime')
          },
        )

        // Wait for server to be ready
        await this.waitForServerReady()

        // Load cached accessories (don't restore them yet - wait for plugins to re-register)
        if (this.accessoryCache) {
          const loaded = await this.accessoryCache.load()
          log.debug(`Matter cache loaded: ${loaded.size} accessories`)
        } else {
          log.debug('No accessory cache available')
        }

        // Update commissioning file to reflect current state
        this.updateCommissioningFile().catch((error) => {
          log.warn('Failed to update commissioning file on startup:', error)
        })

        this.isRunning = true
      } else {
        log.debug('Deferred start mode - server prepared but not running yet (will start after device registration)')
      }
      log.info(`Matter server started successfully on port ${this.config.port}`)
      log.info('Plugins can now register Matter accessories via the API')
    } catch (error) {
      log.error('Failed to start Matter server:', error)
      await this.cleanup()
      throw error
    }
  }

  /**
   * Run the server after devices have been added (for external accessory mode)
   *
   * This must be called after registerPlatformAccessories() when using externalAccessory mode.
   * In bridge mode, the server starts automatically when accessories are registered.
   *
   * @throws {MatterDeviceError} If server node is not initialized or server is already running
   * @example
   * ```typescript
   * await matterServer.start()
   * await matterServer.registerPlatformAccessories('plugin', 'platform', accessories)
   * await matterServer.runServer() // External accessory mode only
   * ```
   */
  public async runServer(): Promise<void> {
    if (!this.serverNode) {
      throw new MatterDeviceError('Server node not initialized - call start() first')
    }

    if (this.isRunning) {
      log.warn('Matter server is already running')
      return
    }

    if (!this.config.externalAccessory) {
      throw new MatterDeviceError('runServer() should only be called when externalAccessory mode is enabled')
    }

    log.debug('Running deferred server with device(s) already attached')

    // Start the server in a non-blocking way
    this.serverNode.run().then(
      () => {
        log.info('Matter server stopped normally')
      },
      (error) => {
        log.error('Matter server stopped with error:', error)
        errorHandler.handleError(error, 'server-runtime')
      },
    )

    // Wait for server to be ready
    await this.waitForServerReady()

    // Load cached accessories (don't restore them yet - wait for plugins to re-register)
    if (this.accessoryCache) {
      const loaded = await this.accessoryCache.load()
      log.debug(`Matter cache loaded: ${loaded.size} accessories`)
    } else {
      log.debug('No accessory cache available')
    }

    // Update commissioning file to reflect current state
    this.updateCommissioningFile().catch((error) => {
      log.warn('Failed to update commissioning file on startup:', error)
    })

    this.isRunning = true
    log.info('Matter server is now running')
  }

  /**
   * Set up and validate storage
   */
  private async setupStorage(): Promise<void> {
    if (!this.config.storagePath) {
      throw new Error('Storage path is required for Matter server')
    }

    // Resolve to absolute path and validate
    const storagePath = resolve(this.config.storagePath)
    const normalizedPath = normalize(storagePath)

    // Ensure path is within allowed directories
    const allowedBasePaths = [
      resolve(homedir(), '.homebridge'),
      resolve(process.cwd()),
      '/var/lib/homebridge', // Common system location
    ]

    const isAllowed = allowedBasePaths.some(basePath =>
      normalizedPath.startsWith(basePath),
    )

    if (!isAllowed || normalizedPath.includes('..')) {
      throw new Error(`Storage path not allowed: ${normalizedPath}. Must be within homebridge directories.`)
    }

    // Ensure the storage directory exists with proper permissions
    try {
      await fse.ensureDir(normalizedPath)
      await access(normalizedPath, constants.R_OK | constants.W_OK)
    } catch (error) {
      throw new Error(`Storage path not accessible: ${error}`)
    }

    // Create bridge-specific storage directory
    // uniqueId is already sanitized in validateAndSanitizeConfig()
    const bridgeId = this.config.uniqueId || 'default'
    this.matterStoragePath = join(normalizedPath, bridgeId)
    await fse.ensureDir(this.matterStoragePath)

    // Create storage manager
    this.storageManager = new MatterStorageManager(this.matterStoragePath)

    // Create accessory cache
    this.accessoryCache = new MatterAccessoryCache(normalizedPath, bridgeId)

    // Configure environment to use our custom storage
    const environment = Environment.default
    const storageService = environment.get(StorageService)
    storageService.location = this.matterStoragePath

    // CRITICAL: Override storage factory with custom implementation
    // This ensures fabric data is properly persisted
    storageService.factory = (namespace: string) => {
      if (!this.storageManager) {
        throw new Error('Storage manager not initialized')
      }
      const storage = this.storageManager.getStorage(namespace)
      // Initialize asynchronously - Matter.js handles async storage properly
      storage.initialize().catch((error) => {
        log.error(`Failed to initialize storage namespace ${namespace}:`, error)
      })
      // Note: Cast to unknown first to satisfy TypeScript - our storage implements the required interface
      return storage as unknown as ReturnType<typeof storageService.factory>
    }

    // Add cleanup handler for storage
    this.cleanupHandlers.push(async () => {
      if (this.storageManager) {
        await this.storageManager.closeAll()
      }
    })

    log.info(`Matter storage initialized at: ${this.matterStoragePath}`)
  }

  /**
   * Load or generate commissioning credentials (passcode and discriminator)
   * These must be persistent across restarts to maintain the same QR code
   */
  private async loadOrGenerateCredentials(): Promise<void> {
    if (!this.storageManager) {
      throw new Error('Storage manager not initialized')
    }

    // Use 'credentials' namespace
    const storage = this.storageManager.getStorage('credentials')

    // CRITICAL: Initialize storage before reading to avoid race condition
    await storage.initialize()

    // Try to load existing credentials
    const storedPasscode = storage.get([], 'passcode') as number | undefined
    const storedDiscriminator = storage.get([], 'discriminator') as number | undefined

    if (storedPasscode && storedDiscriminator) {
      // Use stored credentials
      log.info('Loading existing commissioning credentials from storage')
      this.passcode = storedPasscode
      this.discriminator = storedDiscriminator
    } else {
      // Generate new credentials and store them
      log.info('Generating new commissioning credentials')
      this.passcode = this.generateSecurePasscode()
      this.discriminator = this.generateRandomDiscriminator()

      // Store for future use
      storage.set([], 'passcode', this.passcode)
      storage.set([], 'discriminator', this.discriminator)

      log.info('Commissioning credentials saved to storage')
    }
  }

  /**
   * Generate and display commissioning information
   */
  private async generateCommissioningInfo(): Promise<void> {
    const passcode = this.passcode.toString().padStart(8, '0')
    const discriminator = this.discriminator
    const vendorId = this.vendorId
    const productId = this.productId

    // Use Matter.js library to generate pairing codes properly
    const manualCode = ManualPairingCodeCodec.encode({
      discriminator,
      passcode: this.passcode,
    })

    // Format as XXXX-XXX-XXXX for display
    const manualPairingCode = `${manualCode.slice(0, 4)}-${manualCode.slice(4, 7)}-${manualCode.slice(7, 11)}`

    log.info(`Encoding QR code with: passcode=${this.passcode}, discriminator=${discriminator}, vendorId=${vendorId}, productId=${productId}`)

    const qrCodePayload = QrPairingCodeCodec.encode([{
      version: 0,
      vendorId,
      productId,
      flowType: 0, // Standard commissioning flow
      discoveryCapabilities: 4, // OnNetwork=4
      discriminator,
      passcode: this.passcode,
    }])

    log.info(`Generated QR code: ${qrCodePayload}`)
    log.info(`Generated manual code: ${manualPairingCode}`)

    // Store commissioning info
    this.commissioningInfo = {
      qrCode: qrCodePayload,
      manualPairingCode,
    }

    // Save commissioning info to disk for UI access
    try {
      if (!this.matterStoragePath) {
        throw new Error('Matter storage path not initialized')
      }
      const commissioningFilePath = join(this.matterStoragePath, 'commissioning.json')
      const commissioningData = {
        qrCode: qrCodePayload,
        manualPairingCode,
        serialNumber: this.serialNumber,
        passcode: this.passcode,
        discriminator: this.discriminator,
        commissioned: this.isCommissioned(),
      }
      await writeFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2), 'utf-8')
      log.debug(`Saved commissioning info to ${commissioningFilePath}`)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Failed to save commissioning info to disk: ${errorMessage}`)
    }

    // Display commissioning information
    log.info(`${'='.repeat(60)}`)
    log.info('📱 MATTER COMMISSIONING INFORMATION')
    log.info('='.repeat(60))
    log.info(`Manual Pairing Code: ${manualPairingCode}`)
    log.info(`Passcode: ${passcode}`)
    log.info(`Discriminator: ${discriminator}`)
    log.info('QR Code for commissioning:')

    // Generate and display QR code in terminal
    QRCode.generate(qrCodePayload, { small: true }, (qrcode) => {
      // eslint-disable-next-line no-console
      console.log(qrcode)
    })

    log.info(`${'='.repeat(60)}`)
  }

  /**
   * Wait for the server to be ready
   */
  private async waitForServerReady(maxWaitTime = SERVER_READY_TIMEOUT_MS): Promise<void> {
    const startTime = Date.now()

    // In external accessory mode, only wait for serverNode (no aggregator)
    // In bridge mode, wait for both serverNode and aggregator
    while (!this.serverNode || (!this.config.externalAccessory && !this.aggregator)) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Server failed to become ready within timeout')
      }
      await new Promise(resolve => setTimeout(resolve, SERVER_READY_POLL_INTERVAL_MS))
    }

    // Additional small delay to ensure everything is initialized
    await new Promise(resolve => setTimeout(resolve, SERVER_INIT_DELAY_MS))
  }

  /**
   * Set up Matter.js commissioning event listeners
   * Uses native Matter.js events instead of file watching for reliability
   */
  private setupCommissioningEventListeners(): void {
    if (!this.serverNode) {
      log.warn('Cannot set up commissioning event listeners - serverNode not initialized')
      return
    }

    log.debug('Setting up commissioning event listeners')

    try {
      // Listen for fabric changes (add/remove/update)
      this.serverNode.events.commissioning.fabricsChanged.on((fabricIndex, action) => {
        log.info(`Fabric ${action}: index ${fabricIndex}`)

        // Update commissioning file when fabrics change
        this.updateCommissioningFile().catch((error) => {
          log.warn('Failed to update commissioning file after fabric change:', error)
        })

        // Emit event for child bridge to update UI
        const commissioned = this.isCommissioned()
        const fabricCount = this.getCommissionedFabricCount()
        this.emit('commissioning-status-changed', commissioned, fabricCount)
      })

      // Listen for commissioning (first fabric added)
      this.serverNode.events.commissioning.commissioned.on(() => {
        log.info('Bridge commissioned')

        // Update commissioning file
        this.updateCommissioningFile().catch((error) => {
          log.warn('Failed to update commissioning file after commissioning:', error)
        })

        // Emit event for child bridge to update UI
        const fabricCount = this.getCommissionedFabricCount()
        this.emit('commissioning-status-changed', true, fabricCount)
      })

      // Listen for decommissioning (last fabric removed)
      this.serverNode.events.commissioning.decommissioned.on(() => {
        log.info('Bridge decommissioned')

        // Update commissioning file
        this.updateCommissioningFile().catch((error) => {
          log.warn('Failed to update commissioning file after decommissioning:', error)
        })

        // Emit event for child bridge to update UI
        this.emit('commissioning-status-changed', false, 0)
      })

      log.debug('Commissioning event listeners registered successfully')
    } catch (error) {
      log.error('Failed to set up commissioning event listeners:', error)
    }
  }

  /**
   * Update commissioning info file when commissioning state changes
   */
  private async updateCommissioningFile(): Promise<void> {
    try {
      if (!this.matterStoragePath) {
        return
      }

      const commissioningFilePath = join(this.matterStoragePath, 'commissioning.json')
      const commissioningData = {
        qrCode: this.commissioningInfo.qrCode,
        manualPairingCode: this.commissioningInfo.manualPairingCode,
        serialNumber: this.serialNumber,
        passcode: this.passcode,
        discriminator: this.discriminator,
        commissioned: this.isCommissioned(),
        fabricCount: this.getCommissionedFabricCount(),
        fabrics: this.getFabricInfo(),
      }
      await writeFile(commissioningFilePath, JSON.stringify(commissioningData, null, 2), 'utf-8')
      log.debug('Updated commissioning info file')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.debug(`Failed to update commissioning info file: ${errorMessage}`)
    }
  }

  /**
   * Register Matter platform accessories (Plugin API - matches HAP pattern)
   *
   * Registers Matter accessories from a dynamic platform plugin. Accessories are stored
   * and automatically restored on server restart.
   *
   * @param pluginIdentifier - The plugin identifier (e.g., 'homebridge-example')
   * @param platformName - The platform name from config.json
   * @param accessories - Array of Matter accessories to register
   * @throws {MatterDeviceError} If maximum device limit is reached or accessory is invalid
   * @see {@link MatterAccessory} for accessory structure
   */
  async registerPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): Promise<void> {
    for (const accessory of accessories) {
      await this.registerAccessory(pluginIdentifier, platformName, accessory)
    }
  }

  /**
   * Unregister Matter platform accessories (Plugin API - matches HAP pattern)
   */
  async unregisterPlatformAccessories(pluginIdentifier: string, platformName: string, accessories: MatterAccessory[]): Promise<void> {
    for (const accessory of accessories) {
      await this.unregisterAccessory(accessory.uuid)
    }
  }

  /**
   * Update Matter platform accessories in the cache
   * Similar to api.updatePlatformAccessories() for HAP accessories
   *
   * This updates the cached accessory information without unregistering and re-registering.
   * Useful when device metadata changes (name, manufacturer, firmware version, etc.)
   */
  async updatePlatformAccessories(accessories: MatterAccessory[]): Promise<void> {
    if (!this.accessoryCache) {
      log.warn('Cannot update Matter platform accessories - cache not initialized')
      return
    }

    for (const accessory of accessories) {
      const internal = accessory as InternalMatterAccessory

      // Verify accessory exists in current session and cache
      if (!this.accessories.has(accessory.uuid)) {
        log.warn(`Cannot update Matter accessory ${accessory.uuid} - not registered in current session`)
        continue
      }

      if (!this.accessoryCache.hasCached(accessory.uuid)) {
        log.warn(`Cannot update Matter accessory ${accessory.uuid} - not found in cache`)
        continue
      }

      // Update the in-memory accessory
      this.accessories.set(accessory.uuid, internal)

      log.debug(`Updated Matter accessory ${accessory.uuid} (${accessory.displayName})`)
    }

    // Save updated accessories to cache
    this.accessoryCache.requestSave(this.accessories)
  }

  /**
   * Register a single Matter accessory (internal method)
   */
  private async registerAccessory(pluginIdentifier: string, platformName: string, accessory: MatterAccessory): Promise<void> {
    // In external accessory mode, only check for serverNode (no aggregator).
    // In bridge mode, check for both serverNode and aggregator.
    if (!this.serverNode || (!this.config.externalAccessory && !this.aggregator)) {
      throw new MatterDeviceError('Matter server not started')
    }

    // Validate required fields
    validateAccessoryRequiredFields(accessory)

    // Check if already registered (during this session)
    if (this.accessories.has(accessory.uuid)) {
      const existing = this.accessories.get(accessory.uuid)
      throw new MatterDeviceError(
        `Matter accessory with UUID "${accessory.uuid}" is already registered.\n`
        + `Existing accessory: "${existing?.displayName}"\n`
        + `New accessory: "${accessory.displayName}"\n`
        + 'Each accessory must have a unique UUID. Use api.hap.uuid.generate() with a unique string.',
      )
    }

    // Restore cached state if available
    this.restoreCachedState(accessory)

    // Check device limit
    if (this.accessories.size >= this.MAX_DEVICES) {
      throw new MatterDeviceError(
        `Cannot register Matter accessory "${accessory.displayName}": `
        + `Maximum device limit reached (${this.MAX_DEVICES} devices).\n`
        + `Current registered devices: ${this.accessories.size}`,
      )
    }

    try {
      // Prepare device type with WindowCovering features
      let deviceType = accessory.deviceType
      const windowCoveringFeatures = detectWindowCoveringFeatures(accessory)
      if (windowCoveringFeatures.length > 0) {
        deviceType = applyWindowCoveringFeatures(deviceType, accessory, windowCoveringFeatures)
      }

      // Detect cluster features for behavior configuration
      const features = this.detectClusterFeatures(accessory, deviceType)

      // Build and apply custom behaviors based on handlers
      const customBehaviors = await this.buildCustomBehaviors(accessory, deviceType, features)
      if (customBehaviors.length > 0) {
        deviceType = withBehaviors(deviceType, customBehaviors)
        log.info(`Applied ${customBehaviors.length} custom behavior(s) to device type`)
      }

      // Add BridgedDeviceBasicInformationServer for bridged devices only
      // This is required by the Matter spec for devices behind an aggregator
      // External accessories should NOT have this cluster
      if (!this.config.externalAccessory) {
        deviceType = withBehaviors(deviceType, [BridgedDeviceBasicInformationServer])
        log.debug(`Added BridgedDeviceBasicInformationServer to ${accessory.displayName}`)
      }

      // Create endpoint with cluster states
      const endpointOptions = this.createEndpointOptions(accessory)
      const endpoint = new Endpoint(deviceType, endpointOptions)

      if (this.config.debugModeEnabled) {
        log.debug(`Created endpoint for ${accessory.displayName} with initial cluster states`)
      }

      // Add endpoint to aggregator or serverNode depending on mode
      if (this.config.externalAccessory) {
        await this.serverNode!.add(endpoint)
        log.debug(`Added ${accessory.displayName} as external accessory to ServerNode`)
      } else {
        await this.aggregator!.add(endpoint)
        if (this.config.debugModeEnabled) {
          log.debug(`Added endpoint for ${accessory.displayName} to aggregator`)
        }
      }

      // Register command handlers
      this.registerAccessoryHandlers(accessory)

      // Create and register child endpoints (parts)
      const internalParts = await this.createAccessoryParts(accessory)

      // Finalize registration (store, emit events, save cache)
      await this.finalizeAccessoryRegistration(
        accessory,
        endpoint,
        internalParts,
      )
    } catch (error) {
      log.error(`Failed to register Matter accessory ${accessory.displayName}:`, error)
      throw new MatterDeviceError(`Failed to register accessory: ${error}`)
    }
  }

  /**
   * Restore cached state for an accessory
   */
  private restoreCachedState(accessory: MatterAccessory): void {
    // Check if there's a cached version - merge cached cluster states with new registration.
    // This ensures state persistence across Homebridge restarts.
    if (this.accessoryCache && this.accessoryCache.hasCached(accessory.uuid)) {
      const cached = this.accessoryCache.getCached(accessory.uuid)
      if (cached?.clusters && accessory.clusters) {
        // Merge cached cluster states with new ones (prefer cached state to persist values across restarts)
        for (const [clusterName, cachedAttrs] of Object.entries(cached.clusters)) {
          if (!accessory.clusters[clusterName]) {
            // Cluster exists in cache but not in new registration - preserve it
            accessory.clusters[clusterName] = cachedAttrs
          } else {
            // Cluster exists in both - merge (prefer cached state over initial values)
            accessory.clusters[clusterName] = {
              ...accessory.clusters[clusterName],
              ...cachedAttrs,
            }
          }
        }

        // Restore context if available
        if (cached.context) {
          accessory.context = cached.context
        }

        log.info(`Restored cached state for Matter accessory: ${accessory.displayName}`)
      }
    }
  }

  /**
   * Detect cluster features for an accessory
   * Returns an object containing detected features for various clusters
   */
  private detectClusterFeatures(
    accessory: MatterAccessory,
    deviceType: EndpointType,
  ): {
    windowCoveringFeatures: string[]
    serviceAreaFeatures: string[] | null
    colorControlFeatures: string[] | null
    thermostatFeatures: string[] | null
  } {
    // Detect WindowCovering features
    const windowCoveringFeatures = detectWindowCoveringFeatures(accessory)

    // Detect ServiceArea features
    let serviceAreaFeatures: string[] | null = null
    if (accessory.clusters?.serviceArea) {
      const features: string[] = []

      // Check if Maps feature should be enabled (when supportedMaps is defined)
      if (accessory.clusters.serviceArea.supportedMaps) {
        features.push('Maps')
      }

      // Check if ProgressReporting feature should be enabled (when progress is defined)
      if (accessory.clusters.serviceArea.progress !== undefined) {
        features.push('ProgressReporting')
      }

      if (features.length > 0) {
        serviceAreaFeatures = features
        log.info(`ServiceArea features will be enabled for ${accessory.displayName}: ${features.join(', ')}`)
      }
    }

    // Detect ColorControl features
    let colorControlFeatures: string[] | null = null
    if (accessory.handlers?.colorControl) {
      colorControlFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.COLOR_CONTROL,
        extractColorControlFeatures,
      )
      if (colorControlFeatures) {
        colorControlFeatures = determineColorControlFeaturesFromHandlers(accessory.handlers.colorControl)
      }
    }

    // Detect Thermostat features
    let thermostatFeatures: string[] | null = null
    if (accessory.handlers?.thermostat) {
      thermostatFeatures = detectBehaviorFeatures(
        deviceType,
        CLUSTER_IDS.THERMOSTAT,
        extractThermostatFeatures,
      )
    }

    return {
      windowCoveringFeatures,
      serviceAreaFeatures,
      colorControlFeatures,
      thermostatFeatures,
    }
  }

  /**
   * Build custom behaviors for an accessory based on handlers
   */
  private async buildCustomBehaviors(
    accessory: MatterAccessory,
    deviceType: EndpointType,
    features: {
      windowCoveringFeatures: string[]
      serviceAreaFeatures: string[] | null
      colorControlFeatures: string[] | null
      thermostatFeatures: string[] | null
    },
  ): Promise<BehaviorType[]> {
    const customBehaviors: BehaviorType[] = []

    if (!accessory.handlers) {
      return customBehaviors
    }

    log.debug(`[${accessory.displayName}] Has handlers: ${Object.keys(accessory.handlers).join(', ')}`)

    // Use the static cluster behavior map
    const behaviorMap = MatterServer.CLUSTER_BEHAVIOR_MAP

    // For RoboticVacuumCleaner, add optional clusters if they're defined in accessory.clusters
    // These clusters need to be added to the device type even if there are no handlers
    if (isDeviceType(deviceType, devices.RoboticVacuumCleanerDevice)) {
      // Import RVC requirements
      const { RvcCleanModeServer, ServiceAreaServer } = devices.RoboticVacuumCleanerRequirements

      // Add RvcCleanMode if defined in clusters
      if (accessory.clusters?.rvcCleanMode) {
        // Check if there's a custom behavior with handlers
        if (accessory.handlers?.rvcCleanMode) {
          const behaviorClass = HomebridgeRvcCleanModeServer
          customBehaviors.push(behaviorClass)
          log.info('Adding custom RvcCleanMode behavior with handlers')
        } else {
          // No handlers, use base server
          customBehaviors.push(RvcCleanModeServer)
          log.info('Adding base RvcCleanMode server')
        }
      }

      // Add ServiceArea if defined in clusters
      if (accessory.clusters?.serviceArea) {
        // Check if there's a custom behavior with handlers
        if (accessory.handlers?.serviceArea) {
          let behaviorClass: BehaviorType = HomebridgeServiceAreaServer
          // Apply features if detected
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = withFeatures(behaviorClass, features.serviceAreaFeatures)
            log.info(`ServiceArea custom behavior will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.info('Adding custom ServiceArea behavior with handlers')
        } else {
          // No handlers, use base server with features
          let behaviorClass: BehaviorType = ServiceAreaServer
          if (features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
            behaviorClass = withFeatures(behaviorClass, features.serviceAreaFeatures)
            log.info(`ServiceArea base server will have features: ${features.serviceAreaFeatures.join(', ')}`)
          }
          customBehaviors.push(behaviorClass)
          log.info('Adding base ServiceArea server')
        }
      }

      // Add PowerSource if defined in clusters (for battery percentage)
      if (accessory.clusters?.powerSource) {
        // Detect Battery feature from cluster config
        const hasBattery = accessory.clusters.powerSource.batPercentRemaining !== undefined
          || accessory.clusters.powerSource.batChargeLevel !== undefined
        let powerSourceBehavior: BehaviorType = PowerSourceServer
        if (hasBattery) {
          powerSourceBehavior = withFeatures(PowerSourceServer, ['Battery'])
          log.debug('Adding PowerSource server with battery feature')
        } else {
          log.debug('Adding base PowerSource server')
        }
        customBehaviors.push(powerSourceBehavior)
      }
    }

    for (const clusterName of Object.keys(accessory.handlers || {})) {
      // Skip windowCovering if we already applied features via base WindowCoveringServer
      const skipWindowCoveringBehavior = accessory.context?._skipWindowCoveringBehavior as boolean | undefined
      if (clusterName === 'windowCovering' && skipWindowCoveringBehavior) {
        log.debug('Skipping custom WindowCovering behavior (using base server with features instead)')
        continue
      }

      // Skip RVC clusters - they're handled specially above for RoboticVacuumCleaner
      if (clusterName === 'rvcCleanMode' || clusterName === 'serviceArea' || clusterName === 'powerSource') {
        continue
      }

      let behaviorClass = behaviorMap[clusterName]

      // Apply ColorControl features if we detected them earlier
      if (clusterName === 'colorControl' && behaviorClass && features.colorControlFeatures && features.colorControlFeatures.length > 0) {
        behaviorClass = withFeatures(behaviorClass, features.colorControlFeatures)
        log.info(`ColorControl custom behavior will preserve features: ${features.colorControlFeatures.join(', ')}`)
      }

      // Apply Thermostat features if we detected them earlier
      if (clusterName === 'thermostat' && behaviorClass && features.thermostatFeatures && features.thermostatFeatures.length > 0) {
        behaviorClass = withFeatures(behaviorClass, features.thermostatFeatures)
        log.info(`Thermostat custom behavior will preserve features: ${features.thermostatFeatures.join(', ')}`)
      }

      // Apply ServiceArea features if we detected them earlier
      if (clusterName === 'serviceArea' && behaviorClass && features.serviceAreaFeatures && features.serviceAreaFeatures.length > 0) {
        behaviorClass = withFeatures(behaviorClass, features.serviceAreaFeatures)
        log.info(`ServiceArea custom behavior will preserve features: ${features.serviceAreaFeatures.join(', ')}`)
      }

      // Apply WindowCovering features to custom behavior as well
      // (features were already applied to base device type, but custom behavior needs them too)
      if (clusterName === 'windowCovering') {
        log.debug(`WindowCovering handler found: behaviorClass=${!!behaviorClass}, windowCoveringFeatures=${features.windowCoveringFeatures}, length=${features.windowCoveringFeatures?.length}`)
        if (behaviorClass && features.windowCoveringFeatures && features.windowCoveringFeatures.length > 0) {
          behaviorClass = withFeatures(behaviorClass, features.windowCoveringFeatures)
          log.debug(`WindowCovering custom behavior will have features: ${features.windowCoveringFeatures.join(', ')}`)
        } else {
          log.debug(`Skipping WindowCovering feature application: behaviorClass=${!!behaviorClass}, features=${features.windowCoveringFeatures}`)
        }
      }

      if (behaviorClass) {
        customBehaviors.push(behaviorClass)
        log.info(`Will use ${behaviorClass.name} for ${accessory.displayName}`)
      } else {
        log.warn(`No custom behavior class available for cluster '${clusterName}' - handlers will be registered but may not be called`)
      }
    }

    return customBehaviors
  }

  /**
   * Create endpoint options for an accessory
   */
  private createEndpointOptions(accessory: MatterAccessory): any {
    const endpointOptions: any = {
      id: accessory.uuid,
      ...accessory.clusters, // Spread cluster states as initial values
    }

    // Add bridgedDeviceBasicInformation cluster only for bridged devices
    // For external accessories, use the root basicInformation instead
    if (!this.config.externalAccessory) {
      endpointOptions.bridgedDeviceBasicInformation = {
        vendorName: accessory.manufacturer,
        nodeLabel: accessory.displayName, // Main end user name for the device
        productName: accessory.model,
        productLabel: accessory.displayName,
        serialNumber: accessory.serialNumber,
        reachable: true,
      }
    }

    return endpointOptions
  }

  /**
   * Register command handlers for an accessory
   */
  private registerAccessoryHandlers(accessory: MatterAccessory): void {
    if (!accessory.handlers) {
      return
    }

    log.info(`Setting up handlers for accessory ${accessory.uuid}`)

    // Register handlers with the custom behavior classes
    for (const [clusterName, handlers] of Object.entries(accessory.handlers)) {
      log.info(`  Processing cluster: ${clusterName}`)

      for (const [commandName, handler] of Object.entries(handlers)) {
        this.behaviorRegistry.registerHandler(accessory.uuid, clusterName, commandName, handler)
      }
    }
  }

  /**
   * Create and register child endpoints (parts) for an accessory
   */
  private async createAccessoryParts(
    accessory: MatterAccessory,
  ): Promise<InternalMatterAccessoryPart[]> {
    const internalParts: InternalMatterAccessoryPart[] = []

    if (!accessory.parts || accessory.parts.length === 0) {
      return internalParts
    }

    log.info(`Creating ${accessory.parts.length} child endpoint(s) for ${accessory.displayName}`)

    for (const part of accessory.parts) {
      // Create unique endpoint ID for this part
      const partEndpointId = `${accessory.uuid}-part-${part.id}`

      // Register the part endpoint mapping for handler context
      this.behaviorRegistry.registerPartEndpoint(partEndpointId, accessory.uuid, part.id)

      // Apply custom behaviors to part based on its handlers (same logic as main accessory)
      let partDeviceType: EndpointType = part.deviceType
      const partCustomBehaviors: BehaviorType[] = []

      if (part.handlers) {
        // Use the static cluster behavior map for parts as well
        const partBehaviorMap = MatterServer.CLUSTER_BEHAVIOR_MAP

        for (const clusterName of Object.keys(part.handlers)) {
          const behaviorClass = partBehaviorMap[clusterName]
          if (behaviorClass) {
            partCustomBehaviors.push(behaviorClass)
            log.info(`  Will use ${behaviorClass.name} for part ${part.id}`)
          } else {
            log.warn(`No custom behavior class available for cluster '${clusterName}' on part ${part.id}`)
          }
        }

        if (partCustomBehaviors.length > 0) {
          // Add custom behaviors to part device type
          partDeviceType = withBehaviors(partDeviceType, partCustomBehaviors)
          log.info(`  Applied ${partCustomBehaviors.length} custom behavior(s) to part ${part.id}`)
        }
      }

      // Add BridgedDeviceBasicInformationServer for bridged parts
      if (!this.config.externalAccessory) {
        partDeviceType = withBehaviors(partDeviceType, [BridgedDeviceBasicInformationServer])
      }

      // Create endpoint options with cluster states
      const partEndpointOptions: any = {
        id: partEndpointId,
        ...part.clusters,
      }

      // Add bridgedDeviceBasicInformation for the part
      if (!this.config.externalAccessory) {
        partEndpointOptions.bridgedDeviceBasicInformation = {
          vendorName: accessory.manufacturer,
          nodeLabel: part.displayName || `${accessory.displayName} - ${part.id}`,
          productName: accessory.model,
          productLabel: part.displayName || part.id,
          serialNumber: `${accessory.serialNumber}-${part.id}`,
          reachable: true,
        }
      }

      // Create the part endpoint
      const partEndpoint = new Endpoint(partDeviceType, partEndpointOptions)

      // Add part endpoint to aggregator or serverNode
      if (this.config.externalAccessory) {
        await this.serverNode!.add(partEndpoint)
      } else {
        await this.aggregator!.add(partEndpoint)
      }

      log.info(`  Created part endpoint: ${part.displayName || part.id} (${partEndpointId})`)

      // Set up handlers for this part
      if (part.handlers) {
        for (const [clusterName, handlers] of Object.entries(part.handlers)) {
          for (const [commandName, handler] of Object.entries(handlers)) {
            // Register handler with the part's endpoint ID
            this.behaviorRegistry.registerHandler(partEndpointId, clusterName, commandName, handler)
          }
        }
        log.debug(`  Registered ${Object.keys(part.handlers).length} handler(s) for part ${part.id}`)
      }

      // Store the internal part
      internalParts.push({
        ...part,
        endpoint: partEndpoint,
      })
    }

    return internalParts
  }

  /**
   * Finalize accessory registration (store, emit events, save cache)
   */
  private async finalizeAccessoryRegistration(
    accessory: MatterAccessory,
    endpoint: Endpoint,
    internalParts: InternalMatterAccessoryPart[],
  ): Promise<void> {
    // Store accessory with internal metadata and event emitter
    // The event emitter allows plugins to listen for lifecycle events (currently only 'ready')
    // Note: _associatedPlugin and _associatedPlatform are already set by MatterAPIImpl
    const internalAccessory: InternalMatterAccessory = {
      ...accessory,
      endpoint,
      registered: true,
      _parts: internalParts.length > 0 ? internalParts : undefined,
      _eventEmitter: new EventEmitter() as MatterAccessoryEventEmitter,
    }
    this.accessories.set(accessory.uuid, internalAccessory)

    log.info(`Registered Matter accessory: ${accessory.displayName} (${accessory.uuid})`)

    if (this.config.debugModeEnabled) {
      log.debug(`Total registered accessories: ${this.accessories.size}/${this.MAX_DEVICES}`)
    }

    // Notify controllers about the new device (parts list changed)
    // This allows the Home app to discover new devices without re-pairing
    await this.notifyPartsListChanged()

    // Request debounced save to cache (reduces disk I/O during rapid registration)
    if (this.accessoryCache) {
      this.accessoryCache.requestSave(this.accessories)
    }
  }

  /**
   * Unregister a Matter accessory (Plugin API)
   */
  async unregisterAccessory(uuid: string): Promise<void> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      // Accessory not in memory, but might be in cache - still remove from cache
      log.debug(`Accessory ${uuid} not found or not registered`)

      // Check if it exists in cache and remove it
      if (this.accessoryCache && this.accessoryCache.getCached(uuid)) {
        log.debug(`Removing ${uuid} from cache`)
        this.accessoryCache.removeCached(uuid)
        this.accessoryCache.requestSave(this.accessories)
      }
      return
    }

    try {
      if (accessory.endpoint && this.aggregator) {
        await accessory.endpoint.close()
        log.debug(`Removed endpoint for ${accessory.displayName}`)
      }

      this.accessories.delete(uuid)
      log.info(`Unregistered Matter accessory: ${accessory.displayName} (${uuid})`)

      // Notify controllers about the removed device (parts list changed)
      await this.notifyPartsListChanged()

      // Update cache (remove the accessory)
      if (this.accessoryCache) {
        this.accessoryCache.removeCached(uuid)
        this.accessoryCache.requestSave(this.accessories)
      }
    } catch (error) {
      log.error(`Failed to unregister Matter accessory ${uuid}:`, error)
      throw new MatterDeviceError(`Failed to unregister accessory: ${error}`)
    }
  }

  /**
   * Update a Matter accessory's state (Plugin API)
   *
   * This method can be called from anywhere, including from within handlers.
   * State updates are automatically deferred to avoid transaction conflicts.
   *
   * @param uuid - The UUID of the accessory
   * @param cluster - The cluster name
   * @param attributes - The attributes to update
   * @param partId - Optional: ID of the part to update (for composed devices)
   */
  async updateAccessoryState(
    uuid: string,
    cluster: string,
    attributes: Record<string, unknown>,
    partId?: string,
  ): Promise<void> {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      throw new MatterDeviceError(`Accessory ${uuid} not found or not registered`)
    }

    // Determine which endpoint to update
    let targetEndpoint: any
    let targetClusters: any
    let displayName: string

    if (partId) {
      // Update a specific part
      const part = accessory._parts?.find(p => p.id === partId)
      if (!part || !part.endpoint) {
        throw new MatterDeviceError(`Part ${partId} not found in accessory ${uuid}`)
      }
      targetEndpoint = part.endpoint
      targetClusters = part.clusters
      displayName = part.displayName || `${accessory.displayName} - ${partId}`
    } else {
      // Update the main accessory
      if (!accessory.endpoint) {
        throw new MatterDeviceError(`Accessory ${uuid} not registered or missing endpoint`)
      }
      targetEndpoint = accessory.endpoint
      targetClusters = accessory.clusters
      displayName = accessory.displayName
    }

    // Defer the update to avoid "read-only transaction" errors when called from handlers
    // Matter.js uses transactions, and we need to escape the current call stack
    // setImmediate ensures we're in a new event loop tick without arbitrary delays
    return new Promise((resolve, reject) => {
      setImmediate(async () => {
        try {
          // Construct the update object
          const updateObject = { [cluster]: attributes }

          // Use endpoint.set() which properly handles state updates
          await targetEndpoint.set(updateObject)

          // CRITICAL: Also update the cached clusters object so state persists across restarts
          // Merge the new attributes into the existing cluster state
          if (!targetClusters) {
            log.warn(`Target clusters undefined for ${displayName}, cannot cache state`)
          } else {
            if (!targetClusters[cluster]) {
              targetClusters[cluster] = {}
            }
            targetClusters[cluster] = {
              ...targetClusters[cluster],
              ...attributes,
            }
          }

          const partInfo = partId ? ` (part: ${partId})` : ''
          log.debug(`Updated ${cluster} state for ${displayName}${partInfo}:`, attributes)
          resolve()
        } catch (error) {
          const partInfo = partId ? ` part ${partId}` : ''
          log.error(`Failed to update state for accessory ${uuid}${partInfo}:`, error)
          reject(new MatterDeviceError(`Failed to update accessory state: ${error}`))
        }
      })
    })
  }

  /**
   * Get a Matter accessory's current state (Plugin API)
   *
   * Returns the current cluster attribute values that are exposed to Matter controllers.
   * This is useful for:
   * - Reading state after plugin restart (when local variables are lost)
   * - Verifying current state before making changes
   * - Multiple parts of code that need to read state
   * - Debugging and logging
   *
   * @param uuid - The UUID of the accessory
   * @param cluster - The cluster name (e.g., 'onOff', 'levelControl')
   * @param partId - Optional: ID of the part to get state from (for composed devices)
   * @returns Current cluster attribute values, or undefined if cluster not found
   */
  getAccessoryState(uuid: string, cluster: string, partId?: string): Record<string, unknown> | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      log.debug(`Accessory ${uuid} not found`)
      return undefined
    }

    // Determine which endpoint to read from
    let targetEndpoint: any
    let displayName: string

    if (partId) {
      const part = accessory._parts?.find(p => p.id === partId)
      if (!part || !part.endpoint) {
        log.debug(`Part ${partId} not found in accessory ${uuid}`)
        return undefined
      }
      targetEndpoint = part.endpoint
      displayName = part.displayName || `${accessory.displayName} - ${partId}`
    } else {
      if (!accessory.endpoint) {
        log.debug(`Accessory ${uuid} not registered or missing endpoint`)
        return undefined
      }
      targetEndpoint = accessory.endpoint
      displayName = accessory.displayName
    }

    try {
      if (!targetEndpoint.state) {
        log.debug(`endpoint.state is undefined for ${displayName}`)
        return undefined
      }

      if (!targetEndpoint.state[cluster]) {
        const availableClusters = Object.keys(targetEndpoint.state || {})
        log.debug(`Cluster '${cluster}' not found on ${displayName}. Available: ${availableClusters.join(', ')}`)
        return undefined
      }

      const clusterState = targetEndpoint.state[cluster]

      // Build result object by reading each property directly
      const result: Record<string, unknown> = {}

      // Get list of properties to read - use both approaches for maximum compatibility
      const allKeys = new Set([
        ...Object.keys(clusterState),
        ...Object.getOwnPropertyNames(clusterState),
      ])

      for (const key of allKeys) {
        try {
          // Skip internal properties, methods, and symbols
          if (key.startsWith('_') || key.startsWith('$')) {
            continue
          }

          // Try to read the value directly
          const value = clusterState[key]

          // Skip functions and undefined values
          if (typeof value === 'function' || value === undefined) {
            continue
          }

          result[key] = value
        } catch (propError) {
          log.debug(`Could not read property ${key} from ${cluster}:`, propError)
        }
      }

      if (Object.keys(result).length === 0) {
        log.debug(`Cluster ${cluster} found but no readable properties on accessory ${accessory.displayName}`)
        return undefined
      }

      return result
    } catch (error) {
      log.error(`Failed to get state for accessory ${uuid}:`, error)
      return undefined
    }
  }

  /**
   * Get all cached accessories (Internal - for restore process)
   * @internal
   */
  getAllCachedAccessories(): SerializedMatterAccessory[] {
    if (!this.accessoryCache) {
      log.debug('getAllCachedAccessories: No cache available')
      return []
    }
    const cached = Array.from(this.accessoryCache.getAllCached().values())
    log.debug(`getAllCachedAccessories: Returning ${cached.length} accessories`)
    return cached
  }

  /**
   * Get all registered accessories (Plugin API)
   */
  getAccessories(): MatterAccessory[] {
    return Array.from(this.accessories.values()).map((acc) => {
      // Return copy without internal fields
      // eslint-disable-next-line unused-imports/no-unused-vars
      const { endpoint, registered, ...publicAccessory } = acc
      return publicAccessory
    })
  }

  /**
   * Get a specific accessory by UUID (Plugin API)
   */
  getAccessory(uuid: string): MatterAccessory | undefined {
    const accessory = this.accessories.get(uuid)
    if (!accessory) {
      return undefined
    }

    // Return copy without internal fields
    // eslint-disable-next-line unused-imports/no-unused-vars
    const { endpoint, registered, ...publicAccessory } = accessory
    return publicAccessory
  }

  /**
   * Stop the Matter server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      log.debug('Matter server is not running')
      return
    }

    this.isRunning = false

    try {
      // Save accessory cache before shutting down (BEFORE clearing accessories!)
      if (this.accessoryCache && this.accessories.size > 0) {
        await this.accessoryCache.save(this.accessories)
        log.debug('Saved accessory cache before shutdown')
      }

      // Stop server (this will close all child endpoints automatically)
      // Note: We don't manually close endpoints here because they're part of the ServerNode
      // hierarchy and will be closed by serverNode.close()
      if (this.serverNode) {
        await this.serverNode.close()
        log.debug('ServerNode closed (all endpoints cleaned up)')
      }

      // Clear accessories map after server is stopped
      this.accessories.clear()

      await this.cleanup()
      log.info('Matter server stopped')
    } catch (error) {
      log.error('Error stopping Matter server:', error)
      await errorHandler.handleError(error as Error, 'server-stop')
      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Cleanup resources
   */
  private async cleanup(): Promise<void> {
    // Remove signal handlers
    if (this.shutdownHandler) {
      process.off('SIGINT', this.shutdownHandler)
      process.off('SIGTERM', this.shutdownHandler)
      this.shutdownHandler = null
    }

    // Run all cleanup handlers
    for (const handler of this.cleanupHandlers) {
      try {
        await handler()
      } catch (error) {
        log.debug('Error during cleanup handler:', error)
      }
    }
    this.cleanupHandlers = []

    // Clear references
    this.serverNode = null
    this.aggregator = null
    this.isRunning = false
    this.commissioningInfo = {}
  }

  /**
   * Get fabric information for commissioned controllers
   *
   * Returns information about each paired controller (fabric) including:
   * - fabricIndex: Unique identifier for the fabric
   * - fabricId: 64-bit fabric identifier
   * - nodeId: Node identifier within the fabric
   * - rootVendorId: Vendor ID of the root node
   * - label: Optional human-readable label
   *
   * @returns Array of fabric information objects, or empty array if no fabrics are commissioned
   * @example
   * ```typescript
   * const fabrics = matterServer.getFabricInfo()
   * console.log(`Commissioned to ${fabrics.length} controller(s)`)
   * fabrics.forEach(fabric => {
   *   console.log(`  Fabric ${fabric.fabricIndex}: ${fabric.label || 'Unnamed'}`)
   * })
   * ```
   */
  getFabricInfo(): Array<{
    fabricIndex: number
    fabricId: string
    nodeId: string
    rootVendorId: number
    label?: string
  }> {
    try {
      if (!this.storageManager) {
        return []
      }

      // Fabric data is stored in the main storage file (uniqueId namespace)
      // with the key "fabrics.fabrics"
      // Note: We can read this directly from storage even before serverNode is initialized
      const storage = this.storageManager.getStorage(this.config.uniqueId)
      const fabricsData = storage.get(['fabrics'], 'fabrics') as any[] | undefined

      if (Array.isArray(fabricsData) && fabricsData.length > 0) {
        // Map the fabric data to our interface
        return fabricsData.map(fabric => ({
          fabricIndex: fabric.fabricIndex || 0,
          fabricId: fabric.fabricId?.value?.toString() || '',
          nodeId: fabric.nodeId?.value?.toString() || '',
          rootVendorId: fabric.rootVendorId || 0,
          label: fabric.label || '',
        }))
      }

      return []
    } catch (error) {
      log.debug('Failed to get fabric info from storage:', error)
      return []
    }
  }

  /**
   * Check if the server is commissioned
   */
  isCommissioned(): boolean {
    try {
      if (!this.storageManager) {
        return false
      }

      // Commissioned status is stored in the main storage file (uniqueId namespace)
      // at key "root.commissioning.commissioned"
      const storage = this.storageManager.getStorage(this.config.uniqueId)
      const commissioned = storage.get(['root', 'commissioning'], 'commissioned') as boolean | undefined

      if (commissioned === true) {
        return true
      }

      // Fallback to checking fabric count if commissioned flag not found
      const fabrics = this.getFabricInfo()
      return fabrics.length > 0
    } catch (error) {
      log.debug('Failed to check commissioned status from storage:', error)
      return false
    }
  }

  /**
   * Get the number of commissioned fabrics
   */
  getCommissionedFabricCount(): number {
    return this.getFabricInfo().length
  }

  /**
   * Get server status information
   */
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
      serialNumber: this.serialNumber,
    }
  }

  /**
   * Get commissioning information
   */
  getCommissioningInfo(): {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    passcode?: number
    discriminator?: number
    commissioned: boolean
  } {
    return {
      ...this.commissioningInfo,
      serialNumber: this.serialNumber,
      passcode: this.passcode,
      discriminator: this.discriminator,
      commissioned: this.isCommissioned(),
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): Array<{ entries: number, namespace: string, path: string }> | null {
    if (!this.storageManager) {
      return null
    }
    return this.storageManager.getAllStats()
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning
  }

  /**
   * Get Matter device types available for plugin use
   */
  getDeviceTypes(): typeof deviceTypes {
    return deviceTypes
  }

  /**
   * Get Matter clusters available for plugin use
   */
  getClusters(): typeof clusters {
    return clusters
  }

  /**
   * Remove a specific fabric (controller) from the bridge
   * This decommissions a single controller while leaving others intact
   *
   * @param fabricIndex - The fabric index to remove
   * @returns Promise that resolves when the fabric is removed
   */
  async removeFabric(fabricIndex: number): Promise<void> {
    if (!this.serverNode) {
      throw new MatterDeviceError('Matter server not started')
    }

    try {
      log.info(`Removing fabric ${fabricIndex}...`)

      // Access the FabricManager from the server node
      // Note: Matter.js ServerNode types don't expose this properly, needs runtime check
      interface ServerNodeWithFabrics {
        state?: {
          commissioning?: {
            removeFabric?: (fabricIndex: number) => Promise<void>
          }
        }
      }
      const serverState = this.serverNode as unknown as ServerNodeWithFabrics
      const removeFabric = serverState?.state?.commissioning?.removeFabric

      if (typeof removeFabric !== 'function') {
        throw new MatterDeviceError('Fabric removal not supported by Matter.js version')
      }

      // Remove the fabric
      await removeFabric(fabricIndex)

      log.info(`Fabric ${fabricIndex} removed successfully`)

      // The fabric monitoring will detect this change and emit the appropriate events
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.error(`Failed to remove fabric ${fabricIndex}:`, error)
      throw new MatterDeviceError(`Failed to remove fabric: ${errorMessage}`, {
        originalError: error instanceof Error ? error : undefined,
      })
    }
  }

  /**
   * Check if a specific fabric exists
   */
  hasFabric(fabricIndex: number): boolean {
    const fabrics = this.getFabricInfo()
    return fabrics.some(f => f.fabricIndex === fabricIndex)
  }

  /**
   * Notify controllers that the parts list has changed
   * This triggers controllers (like Home app) to re-read the device list
   * and discover new or removed accessories without needing to re-pair
   */
  private async notifyPartsListChanged(): Promise<void> {
    if (!this.aggregator || !this.isCommissioned()) {
      // No controllers connected, skip notification
      return
    }

    try {
      // Access the aggregator's descriptor cluster state
      // The partsList is automatically updated by Matter.js when endpoints are added/removed
      // We just need to ensure controllers are notified of the change
      const aggregatorState = this.aggregator as any

      if (aggregatorState.state?.descriptor) {
        // Get current parts list (endpoint numbers of all children)
        const partsList = aggregatorState.state.descriptor.partsList || []

        if (this.config.debugModeEnabled) {
          log.debug(`Parts list changed: ${partsList.length} devices (endpoints: ${partsList.join(', ')})`)
        }

        // Trigger a state update event to notify subscribed controllers
        // By setting the partsList to itself, we trigger the change notification
        await this.aggregator.set({
          descriptor: {
            partsList,
          },
        } as any)

        log.info(`Notified controllers of parts list change (${this.accessories.size} devices)`)
      }
    } catch (error: unknown) {
      // Non-fatal error - log but don't throw
      const errorMessage = error instanceof Error ? error.message : String(error)
      log.warn(`Failed to notify controllers of parts list change: ${errorMessage}`)
    }
  }
}
