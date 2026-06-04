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
  // A getter (not a snapshot value) so reads always see the current handler.
  // start() registers the handler partway through via setShutdownHandler; if
  // this were a value copied when the deps object was built, a cleanup() call
  // inside the same failed start() would read the stale null and never detach
  // the SIGINT/SIGTERM listeners. Mirrors getServerNode/getAggregator.
  getShutdownHandler: () => (() => Promise<void>) | null
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
      // If we created a ServerNode before failing (e.g. commissioning setup
      // or aggregator creation threw), close it so its internal storage
      // adapters and observables are torn down rather than left for GC.
      // Previously `cleanup()` only nulled the reference, which left those
      // matter.js-internal resources hanging until the process exited.
      // close() can itself throw on a half-built node — swallow that and
      // let cleanup() run regardless, since we're already in the error
      // path and want to fall through to the caller's catch with the
      // original error.
      const partialNode = deps.getServerNode()
      let nodeMayStillBeBound = false
      if (partialNode) {
        try {
          await partialNode.close()
        } catch (closeError) {
          nodeMayStillBeBound = true
          log.debug('Failed to close half-built ServerNode during start error path:', closeError)
          // Signal to callers (e.g. the external accessory publisher) that the
          // half-built node may still hold its port bound. Without this flag a
          // caller treats any start() failure as "port never bound, safe to
          // release", and the allocator could hand the same port to a later
          // accessory and hit EADDRINUSE. Annotating the rethrown error keeps
          // the original error type/stack intact while carrying the signal.
          if (error !== null && typeof error === 'object') {
            (error as { portMayStillBeBound?: boolean }).portMayStillBeBound = true
          }
        }
      }
      // When close() failed the node may still be bound to its port (the caller
      // keeps the port reserved via portMayStillBeBound). Preserve the ServerNode
      // reference and — if a shutdown handler was already registered — keep it,
      // so the orphaned node retains a retry handle and a graceful-shutdown hook
      // on process exit. cleanup() honours preserveNodeReference for both. This
      // mirrors stop()'s close-failure path; dropping them here would strand a
      // still-bound node with no way to address or tear it down.
      await this.cleanup(deps, { preserveNodeReference: nodeMayStillBeBound })
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
   * Stop the Matter server.
   *
   * External-accessory mode runs `start()` (which registers SIGINT/SIGTERM
   * handlers and creates the ServerNode) but defers `runServer()` until
   * after accessory registration — between those two steps `isRunning` is
   * still false. A check of just `isRunning` would skip cleanup and leave
   * the process handlers + half-initialised server node leaked when a
   * publish failure called `stop()` in its catch block. Tear down any
   * resources we actually allocated, regardless of `isRunning`.
   */
  async stop(deps: ServerLifecycleDeps, accessories: Map<string, any>): Promise<void> {
    const isRunning = deps.getIsRunning()
    const serverNode = deps.getServerNode()
    const hasShutdownHandler = deps.getShutdownHandler() != null

    if (!isRunning && !serverNode && !hasShutdownHandler) {
      log.debug('Matter server is not running and has no resources to clean up')
      return
    }

    deps.setIsRunning(false)

    // Capture (don't immediately throw) a close() failure so we can still
    // run cleanupHandlers, then surface it to the caller. Callers (e.g.
    // publishExternalMatterAccessory) gate port release on stop() resolving
    // cleanly — if close() failed, the matter.js server may still be bound to
    // the port and the caller must see the rejection so it keeps the port
    // reserved. The SIGINT/SIGTERM handler is deliberately left registered in
    // that case (see cleanup) so the still-bound node keeps a shutdown hook.
    let closeError: unknown

    try {
      // Persist the accessory cache only if we actually reached the running
      // state — an init-but-never-ran external server has no meaningful
      // state to save.
      if (isRunning) {
        const cache = deps.getAccessoryCache()
        if (cache && accessories.size > 0) {
          await cache.save(accessories)
          log.debug('Saved accessory cache before shutdown')
        }
      }

      if (serverNode) {
        try {
          await serverNode.close()
          log.debug('ServerNode closed (all endpoints cleaned up)')
        } catch (err) {
          closeError = err
          log.debug('Failed to close ServerNode (port may still be bound):', err)
        }
      }

      // Only drop the in-memory accessory state once the node has actually
      // closed. When close() fails we preserve the serverNode (below) so the
      // caller can retry stop(); clearing the map now would strand that retry
      // with no accessory state behind the still-alive node.
      if (!closeError) {
        // A debounced cache save may still be armed from accessory
        // registration (requestSave). It captured this same map by reference,
        // so if it fired after the clear() below it would persist an empty map
        // and wipe the external accessory's cache. Cancel it first — this must
        // happen regardless of isRunning, because an init-but-never-ran
        // external server still armed saves during registration yet skipped
        // the isRunning-gated save above.
        deps.getAccessoryCache()?.cancelPendingSave()
        accessories.clear()
      }

      // Always run cleanup so the cleanupHandlers fire even when close()
      // failed. When close() failed we hold onto the serverNode reference (and
      // keep the SIGINT/SIGTERM handler registered) so the still-bound node
      // keeps a graceful-shutdown hook and a caller could retry stop() —
      // otherwise cleanup would null it out and a retry would see no node and
      // silently no-op, stranding a potentially still-bound matter.js server
      // with no handle to close it.
      await this.cleanup(deps, { preserveNodeReference: closeError !== undefined })
      if (closeError) {
        // Surface the close failure now that cleanup has run. The caller's
        // catch sees the rejection and decides what to do about the port.
        throw closeError
      }
      log.info(isRunning ? 'Matter server stopped' : 'Matter server cleaned up (initialised but never ran)')
    } catch (error) {
      log.error('Error stopping Matter server:', error)
      await errorHandler.handleError(error as Error, 'server-stop')
      throw error
    } finally {
      deps.setIsRunning(false)
    }
  }

  /**
   * Cleanup resources.
   *
   * `preserveNodeReference` is set by stop() when `serverNode.close()` failed —
   * matter.js may still be holding the port, and dropping the reference would
   * leave no way to retry the close. In that case the SIGINT/SIGTERM shutdown
   * handler is also kept registered: the sole caller
   * (ExternalMatterAccessoryPublisher) never retries stop(), so removing the
   * handler would leave the still-bound node with no graceful-shutdown hook
   * for the rest of the process lifetime. The cleanupHandlers are always run
   * because they are independent of the node reference.
   */
  async cleanup(
    deps: ServerLifecycleDeps,
    options: { preserveNodeReference?: boolean } = {},
  ): Promise<void> {
    // Keep the shutdown handler registered when we are preserving a node whose
    // close() failed, so that orphaned (still port-bound) node is still torn
    // down on process exit. Otherwise remove it as normal.
    const shutdownHandler = deps.getShutdownHandler()
    if (shutdownHandler && !options.preserveNodeReference) {
      process.off('SIGINT', shutdownHandler)
      process.off('SIGTERM', shutdownHandler)
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

    if (!options.preserveNodeReference) {
      deps.setServerNode(null)
      deps.setAggregator(null)
    }
    deps.setIsRunning(false)
  }
}
