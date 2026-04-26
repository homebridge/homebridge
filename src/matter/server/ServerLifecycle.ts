/**
 * Server Lifecycle Manager
 *
 * Handles start(), stop(), cleanup(), waitForServerReady(),
 * runServer(), createServerNodeWithRecovery(), and storage setup.
 */

import type { VariableService } from '@matter/general'
import type { ServerNode } from '@matter/main'

import type { MatterAccessoryCache } from '../accessoryCache.js'
import type { MatterServerConfig } from '../sharedTypes.js'
import type { CommissioningDeps, CommissioningManager } from './CommissioningManager.js'
import type { FabricManager } from './FabricManager.js'

import { constants } from 'node:fs'
import { access, mkdir, rm, stat } from 'node:fs/promises'
import { homedir, release } from 'node:os'
import { join, normalize, resolve } from 'node:path'
import process from 'node:process'

import { Filesystem } from '@matter/general'
import {
  Endpoint,
  Environment,
  ServerNode as MatterServerNode,
  VendorId,
} from '@matter/main'
import { AggregatorEndpoint as AggregatorEndpointType } from '@matter/main/endpoints'
import { NodeJsFilesystem } from '@matter/nodejs'

import { DEFAULT_BRIDGE_DEFAULTS } from '../../bridgeService.js'
import { Logger } from '../../logger.js'
import getVersion from '../../version.js'
import { errorHandler } from '../errorHandler.js'
import { MatterDeviceError } from '../types.js'
import { stripVendorFromLabel } from '../utils.js'
import {
  SERVER_INIT_DELAY_MS,
  SERVER_READY_POLL_INTERVAL_MS,
  SERVER_READY_TIMEOUT_MS,
} from './ServerConfig.js'

const log = Logger.withPrefix('Matter/Server')

export interface ServerLifecycleDeps {
  config: MatterServerConfig
  commissioningManager: CommissioningManager
  fabricManager: FabricManager
  getCommissioningDeps: () => CommissioningDeps
  getAccessoryCache: () => MatterAccessoryCache | null
  setAccessoryCache: (cache: MatterAccessoryCache) => void
  setServerNode: (node: ServerNode | null) => void
  getServerNode: () => ServerNode | null
  setAggregator: (agg: Endpoint<typeof AggregatorEndpointType> | null) => void
  getAggregator: () => Endpoint<typeof AggregatorEndpointType> | null
  setIsRunning: (running: boolean) => void
  getIsRunning: () => boolean
  cleanupHandlers: Array<() => void | Promise<void>>
  shutdownHandler: (() => Promise<void>) | null
  setShutdownHandler: (handler: (() => Promise<void>) | null) => void
  onStop: () => Promise<void>
}

export class ServerLifecycle {
  public matterStoragePath?: string

  /**
   * Create ServerNode with automatic recovery from corrupted storage
   */
  async createServerNodeWithRecovery(
    nodeOptions: Parameters<typeof MatterServerNode.create>[0],
    sanitizedId: string,
  ): Promise<ServerNode> {
    try {
      return await MatterServerNode.create(nodeOptions)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : ''
      const causeMessage = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
      const isStorageError = errorMessage.includes('Invalid public key encoding')
        || errorMessage.includes('FabricManager unavailable')
        || errorMessage.includes('key-input')
        || causeMessage.includes('Invalid public key encoding')

      if (!isStorageError) {
        throw error
      }

      log.warn('Detected corrupted Matter storage, attempting automatic recovery...')

      const environment = Environment.default
      const filesystem = environment.get(Filesystem)
      const storageLocation = filesystem.path

      if (!storageLocation) {
        throw new Error('Storage location not set, cannot recover from corrupted storage')
      }

      const serverNodeStorePath = join(storageLocation, sanitizedId)
      const serverNodeStoreJsonFile = `${serverNodeStorePath}.json`

      try {
        let removedSomething = false

        // Delete the ServerNodeStore subdirectory
        try {
          await stat(serverNodeStorePath)
          log.info(`Removing corrupted ServerNodeStore directory: ${serverNodeStorePath}`)
          await rm(serverNodeStorePath, { recursive: true, force: true })
          removedSomething = true
        } catch (err: unknown) {
          const code = err instanceof Error && 'code' in err ? (err as any).code : undefined
          if (code !== 'ENOENT') {
            throw err
          }
        }

        // Delete the ServerNodeStore JSON file
        try {
          await stat(serverNodeStoreJsonFile)
          log.info(`Removing corrupted ServerNodeStore JSON file: ${serverNodeStoreJsonFile}`)
          await rm(serverNodeStoreJsonFile, { force: true })
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

        const serverNode = await MatterServerNode.create(nodeOptions)
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
   * Set up and validate storage
   */
  async setupStorage(config: MatterServerConfig): Promise<MatterAccessoryCache> {
    if (!config.storagePath) {
      throw new Error('Storage path is required for Matter server')
    }

    const storagePath = resolve(config.storagePath)
    const normalizedPath = normalize(storagePath)

    // Ensure path is within allowed directories
    const allowedBasePaths = [
      resolve(homedir(), '.homebridge'),
      resolve(process.cwd()),
      '/var/lib/homebridge',
    ]

    const isAllowed = allowedBasePaths.some(basePath =>
      normalizedPath.startsWith(basePath),
    )

    if (!isAllowed || normalizedPath.includes('..')) {
      throw new Error(`Storage path not allowed: ${normalizedPath}. Must be within homebridge directories.`)
    }

    // Ensure the storage directory exists with proper permissions
    try {
      await mkdir(normalizedPath, { recursive: true })
      await access(normalizedPath, constants.R_OK | constants.W_OK)
    } catch (error) {
      throw new Error(`Storage path not accessible: ${error}`)
    }

    // Create bridge-specific storage directory
    const bridgeId = config.uniqueId || 'default'
    this.matterStoragePath = join(normalizedPath, bridgeId)
    await mkdir(this.matterStoragePath, { recursive: true })

    // Configure environment to use native matter.js storage
    const environment = Environment.default
    environment.set(Filesystem, new NodeJsFilesystem(this.matterStoragePath))

    // Create accessory cache
    const { MatterAccessoryCache } = await import('../accessoryCache.js')
    const cache = new MatterAccessoryCache(normalizedPath, bridgeId)

    log.info(`Matter storage initialized at: ${this.matterStoragePath}`)

    return cache
  }

  /**
   * Start the Matter server
   */
  async start(deps: ServerLifecycleDeps): Promise<void> {
    if (deps.getIsRunning()) {
      log.warn('Matter server is already running')
      return
    }

    try {
      log.info('Starting Matter.js server...')

      // Set up storage
      const cache = await this.setupStorage(deps.config)
      deps.setAccessoryCache(cache)

      // Load or generate commissioning credentials
      await deps.commissioningManager.loadOrGenerateCredentials(this.matterStoragePath!)

      log.info(`Configuration: Port=${deps.config.port}, Passcode=${deps.commissioningManager.passcode}, Discriminator=${deps.commissioningManager.discriminator}`)

      const commissioningOptions = {
        passcode: deps.commissioningManager.passcode,
        discriminator: deps.commissioningManager.discriminator,
      }

      log.info(`Using commissioning credentials: passcode=${deps.commissioningManager.passcode}, discriminator=${deps.commissioningManager.discriminator}`)

      const displayName = deps.config.displayName || 'Matter Device'

      const sanitizedId = deps.config.uniqueId!

      const nodeOptions: Parameters<typeof MatterServerNode.create>[0] = {
        id: sanitizedId,
        network: {
          port: deps.config.port,
          ipv4: true,
        },
        commissioning: commissioningOptions,
        basicInformation: {
          nodeLabel: displayName.slice(0, 32),
          vendorId: VendorId(deps.commissioningManager.vendorId),
          vendorName: DEFAULT_BRIDGE_DEFAULTS.vendorName,
          productId: deps.commissioningManager.productId,
          productName: displayName.slice(0, 32),
          // productLabel SHALL NOT include the vendor name per the Matter spec.
          // Fall back to "Bridge" when the display name is exactly the vendor.
          productLabel: (stripVendorFromLabel(displayName, DEFAULT_BRIDGE_DEFAULTS.vendorName) || 'Bridge').slice(0, 64),
          serialNumber: deps.config.serialNumber || deps.config.uniqueId,
          hardwareVersion: 1,
          hardwareVersionString: release(),
          softwareVersion: 1,
          softwareVersionString: deps.config.firmwareRevision || getVersion(),
          reachable: true,
        },
      }

      if (!deps.config.externalAccessory) {
        nodeOptions.productDescription = {
          name: displayName,
          deviceType: AggregatorEndpointType.deviceType,
        }
      }

      // Determine the mDNS network interface to use.  MdnsService reads
      // 'mdns.networkInterface' at construction time (inside createServerNodeWithRecovery),
      // so this value MUST be set before calling createServerNodeWithRecovery().
      //
      // 'network.interface' (Matter UDP transport) is intentionally set AFTER ServerNode
      // creation because Behaviors.defaultsFor('network') reads the full 'network' env
      // subtree during construction and the ValueCaster rejects the unknown 'interface' key.
      // ServerNetworkRuntime reads it lazily at run() time, so setting it post-creation is fine.

      // Clear any previously set values from a prior server instance. Environment.default is
      // a singleton shared across all server instances in the process.
      // VariableService.get() returns a direct reference to the internal vars object, so
      // deleting the key here mutates the stored value without needing a private API.
      const networkVars = Environment.default.vars.get<VariableService.Map>('network')
      if (typeof networkVars === 'object' && networkVars !== null && 'interface' in networkVars) {
        delete networkVars.interface
        log.debug('Cleared network.interface from environment before ServerNode creation')
      }
      const mdnsVars = Environment.default.vars.get<VariableService.Map>('mdns')
      if (typeof mdnsVars === 'object' && mdnsVars !== null && 'networkInterface' in mdnsVars) {
        delete mdnsVars.networkInterface
        log.debug('Cleared mdns.networkInterface from environment before ServerNode creation')
      }

      // Set mdns.networkInterface BEFORE creating the ServerNode.
      if (deps.config.networkInterfaces && deps.config.networkInterfaces.length > 0) {
        // Use the interface from bridge.bind — same interface Homebridge's HAP stack uses.
        // matter.js only accepts a single string for mdns.networkInterface.
        const [primary, ...rest] = deps.config.networkInterfaces
        Environment.default.vars.set('mdns.networkInterface', primary)
        if (rest.length === 0) {
          log.info(`Configured Matter mDNS to bind to interface: ${primary}`)
        } else {
          log.info(`Configured Matter mDNS to bind to interface: ${primary} (matter.js only supports a single mDNS interface; the other interfaces in bridge.bind — ${rest.join(', ')} — are unused for mDNS).`)
        }
      } else {
        // No bridge.bind configured — Matter mDNS will listen on all interfaces, consistent
        // with Homebridge's own HAP/ciao mDNS behaviour when bind is unset.
        log.warn('bridge.bind is not set. Matter mDNS will listen on all network interfaces, which increases CPU usage. Set bridge.bind in your Homebridge config to restrict it to a single interface.')
      }

      const serverNode = await this.createServerNodeWithRecovery(nodeOptions, sanitizedId)
      deps.setServerNode(serverNode)

      // Configure network.interface for the Matter UDP transport after ServerNode creation.
      // (See comment above for why this must be post-creation.)
      if (deps.config.networkInterfaces && deps.config.networkInterfaces.length > 0) {
        const interfaceConfig: Record<string, { type: number }> = {}
        for (const interfaceName of deps.config.networkInterfaces) {
          interfaceConfig[interfaceName] = { type: 2 }
        }
        Environment.default.vars.set('network.interface', interfaceConfig)
      }

      // Set up commissioning event listeners. Register a matching cleanup
      // handler so the matter.js Observable observers (which capture deps and
      // the manager) are released on stop().
      deps.commissioningManager.setupCommissioningEventListeners(deps.getCommissioningDeps())
      deps.cleanupHandlers.push(() => {
        deps.commissioningManager.teardownCommissioningEventListeners(deps.getServerNode())
      })

      // Create aggregator endpoint for bridge pattern
      if (!deps.config.externalAccessory) {
        const aggregator = new Endpoint(AggregatorEndpointType, {
          id: 'homebridge-aggregator',
        })
        await serverNode.add(aggregator)
        deps.setAggregator(aggregator)
        log.debug('Created aggregator endpoint for bridged mode')
      } else {
        log.debug('External accessory mode - skipping aggregator creation')
      }

      // Generate and display commissioning information
      await deps.commissioningManager.generateCommissioningInfo(deps.getCommissioningDeps())

      // Set up graceful shutdown handler
      const shutdownHandler = async () => {
        log.info('Shutting down Matter server...')
        await deps.onStop()
      }
      deps.setShutdownHandler(shutdownHandler)

      process.on('SIGINT', shutdownHandler)
      process.on('SIGTERM', shutdownHandler)

      if (!deps.config.externalAccessory) {
        await this.startServerNode(serverNode, deps)
      } else {
        log.debug('Deferred start mode - server prepared but not running yet (will start after device registration)')
      }
      log.info(`Matter server started successfully on port ${deps.config.port}`)
      log.info('Plugins can now register Matter accessories via the API')
    } catch (error) {
      log.error('Failed to start Matter server:', error)
      await this.cleanup(deps)
      throw error
    }
  }

  /**
   * Run the server after devices have been added (for external accessory mode)
   */
  async runServer(deps: ServerLifecycleDeps): Promise<void> {
    const serverNode = deps.getServerNode()
    if (!serverNode) {
      throw new MatterDeviceError('Server node not initialized - call start() first')
    }

    if (deps.getIsRunning()) {
      log.warn('Matter server is already running')
      return
    }

    if (!deps.config.externalAccessory) {
      throw new MatterDeviceError('runServer() should only be called when externalAccessory mode is enabled')
    }

    log.debug('Running deferred server with device(s) already attached')

    await this.startServerNode(serverNode, deps)
    log.info('Matter server is now running')
  }

  /**
   * Start the server node, wait for it to be ready, load cache, and update commissioning info.
   * Shared by both start() (non-external mode) and runServer() (deferred external mode).
   */
  private async startServerNode(serverNode: ServerNode, deps: ServerLifecycleDeps): Promise<void> {
    serverNode.run().then(
      () => {
        log.info('Matter server stopped normally')
      },
      (error) => {
        log.error('Matter server stopped with error:', error)
        errorHandler.handleError(error, 'server-runtime')
      },
    )

    await this.waitForServerReady(deps)

    const cache = deps.getAccessoryCache()
    if (cache) {
      const loaded = await cache.load()
      log.debug(`Matter cache loaded: ${loaded.size} accessories`)
    } else {
      log.debug('No accessory cache available')
    }

    deps.commissioningManager.updateCommissioningFile(deps.getCommissioningDeps()).catch((error) => {
      log.warn('Failed to update commissioning file on startup:', error)
    })

    deps.setIsRunning(true)
  }

  /**
   * Wait for the server to be ready
   */
  async waitForServerReady(deps: ServerLifecycleDeps, maxWaitTime = SERVER_READY_TIMEOUT_MS): Promise<void> {
    const startTime = Date.now()

    while (!deps.getServerNode() || (!deps.config.externalAccessory && !deps.getAggregator())) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error('Server failed to become ready within timeout')
      }
      await new Promise(resolve => setTimeout(resolve, SERVER_READY_POLL_INTERVAL_MS))
    }

    await new Promise(resolve => setTimeout(resolve, SERVER_INIT_DELAY_MS))
  }

  /**
   * Stop the Matter server
   */
  async stop(deps: ServerLifecycleDeps, accessories: Map<string, any>): Promise<void> {
    if (!deps.getIsRunning()) {
      log.debug('Matter server is not running')
      return
    }

    deps.setIsRunning(false)

    try {
      // Save accessory cache before shutting down
      const cache = deps.getAccessoryCache()
      if (cache && accessories.size > 0) {
        await cache.save(accessories)
        log.debug('Saved accessory cache before shutdown')
      }

      const serverNode = deps.getServerNode()
      if (serverNode) {
        await serverNode.close()
        log.debug('ServerNode closed (all endpoints cleaned up)')
      }

      accessories.clear()

      await this.cleanup(deps)
      log.info('Matter server stopped')
    } catch (error) {
      log.error('Error stopping Matter server:', error)
      await errorHandler.handleError(error as Error, 'server-stop')
      throw error
    } finally {
      deps.setIsRunning(false)
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(deps: ServerLifecycleDeps): Promise<void> {
    if (deps.shutdownHandler) {
      process.off('SIGINT', deps.shutdownHandler)
      process.off('SIGTERM', deps.shutdownHandler)
      deps.setShutdownHandler(null)
    }

    for (const handler of deps.cleanupHandlers) {
      try {
        await handler()
      } catch (error) {
        log.debug('Error during cleanup handler:', error)
      }
    }
    deps.cleanupHandlers.length = 0

    deps.setServerNode(null)
    deps.setAggregator(null)
    deps.setIsRunning(false)
  }
}
