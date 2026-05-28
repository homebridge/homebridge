import type { MacAddress } from '@homebridge/hap-nodejs'
import type { ChildProcess, ForkOptions } from 'node:child_process'

import type { HomebridgeAPI } from './api.js'
import type {
  AccessoryConfig,
  BridgeConfiguration,
  BridgeHapConfig,
  BridgeOptions,
  HomebridgeConfig,
  PlatformConfig,
} from './bridgeService.js'
import type { ExternalPortService } from './externalPortService.js'
import type { IpcService, MatterEvent } from './ipcService.js'
import type { Logging } from './logger.js'
import type { MatterConfig } from './matter/index.js'
import type { Plugin } from './plugin.js'
import type { HomebridgeOptions } from './server.js'

import { fork } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import fs from 'fs-extra'

import { PluginType } from './api.js'
import { IpcOutgoingEvent } from './ipcService.js'
import { Logger } from './logger.js'
import { User } from './user.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const COLON_RE = /:/g

// eslint-disable-next-line no-restricted-syntax
export const enum ChildProcessMessageEventType {
  /**
   * Sent from the child process when it is ready to accept config
   */
  READY = 'ready',

  /**
   * Sent to the child process with a ChildProcessLoadEventData payload
   */
  LOAD = 'load',

  /**
   * Sent from the child process once it has loaded the plugin
   */
  LOADED = 'loaded',

  /**
   * Sent to the child process telling it to start
   */
  START = 'start',

  /**
   * Sent from the child process when the bridge is online
   */
  ONLINE = 'online',

  /**
   * Sent from the child when it wants to request port allocation for an external accessory
   */
  PORT_REQUEST = 'portRequest',

  /**
   * Sent from the parent with the port allocation response
   */
  PORT_ALLOCATED = 'portAllocated',

  /**
   * Sent from the child to update its current status
   */
  STATUS_UPDATE = 'status',

  /**
   * Sent to the child to start Matter monitoring
   */
  START_MATTER_MONITORING = 'startMatterMonitoring',

  /**
   * Sent to the child to stop Matter monitoring
   */
  STOP_MATTER_MONITORING = 'stopMatterMonitoring',

  /**
   * Sent to the child to get Matter accessories
   */
  GET_MATTER_ACCESSORIES = 'getMatterAccessories',

  /**
   * Sent to the child to get specific Matter accessory info
   */
  GET_MATTER_ACCESSORY_INFO = 'getMatterAccessoryInfo',

  /**
   * Sent to the child to control a Matter accessory
   */
  MATTER_ACCESSORY_CONTROL = 'matterAccessoryControl',

  /**
   * Sent from the child when it wants to release a previously allocated
   * Matter port back to the parent's allocator pool. Fire-and-forget; no
   * acknowledgement is sent.
   */
  RELEASE_MATTER_PORT = 'releaseMatterPort',

  /**
   * Unified Matter event from child process
   * Includes: accessoriesData, accessoryInfoData, accessoryControlResponse,
   * accessoryUpdate, accessoryAdded, accessoryRemoved
   */
  MATTER_EVENT = 'matterEvent',
}

// eslint-disable-next-line no-restricted-syntax
export const enum ChildBridgeStatus {
  /**
   * When the child bridge is loading, or restarting
   */
  PENDING = 'pending',

  /**
   * The child bridge is online and has published it's accessory
   */
  OK = 'ok',

  /**
   * The bridge is shutting down, or the process ended unexpectedly
   */
  DOWN = 'down',
}

export interface ChildProcessMessageEvent<T> {
  id: ChildProcessMessageEventType
  data?: T
}

export interface ChildProcessLoadEventData {
  type: PluginType
  identifier: string
  pluginPath: string
  pluginConfig: Array<PlatformConfig | AccessoryConfig>
  bridgeConfig: BridgeConfiguration
  homebridgeConfig: HomebridgeConfig
  bridgeOptions: BridgeOptions
}

export interface ChildProcessPluginLoadedEventData {
  version: string
}

export interface ChildProcessPortRequestEventData {
  username: MacAddress
  portType?: 'hap' | 'matter' // Defaults to 'hap' for backwards compatibility
}

export interface ChildProcessPortAllocatedEventData {
  username: MacAddress
  port?: number
}

export interface ChildBridgePairedStatusEventData {
  paired: boolean | null
  setupUri: string | null
  matter?: {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    commissioned: boolean
    deviceCount: number
  }
}

/**
 * Child bridge metadata
 *
 * Contains all metadata for a child bridge, including HAP properties
 * like paired status, setupUri, and pin.
 *
 * When Matter is enabled (_bridge.matter is configured), this interface
 * also includes Matter commissioning information for unified status reporting.
 */
export interface ChildMetadata {
  status: ChildBridgeStatus
  paired?: boolean | null
  setupUri?: string | null
  username: MacAddress
  port?: number
  pin: string
  name: string
  plugin: string
  identifier: string
  manuallyStopped: boolean
  pid?: number
  hap?: BridgeHapConfig
  matterConfig?: MatterConfig
  matterIdentifier?: string
  matterSetupUri?: string
  matterPin?: string
  matterSerialNumber?: string
  matterCommissioned?: boolean
  matterDeviceCount?: number
}

/**
 * Manages the child processes of platforms/accessories being exposed as separate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export class ChildBridgeService {
  private child?: ChildProcess
  private args: string[] = []
  private processEnv: ForkOptions = {}
  private shuttingDown = false
  private lastBridgeStatus: ChildBridgeStatus = ChildBridgeStatus.PENDING
  private pairedStatus: boolean | null = null
  private manuallyStopped = false
  private setupUri: string | null = null
  private matterCommissioningInfo?: {
    qrCode?: string
    manualPairingCode?: string
    serialNumber?: string
    commissioned: boolean
    deviceCount?: number
  }

  private pluginConfig: Array<PlatformConfig | AccessoryConfig> = []
  private log: Logging
  private displayName?: string
  private restartCount = 0
  private readonly maxRestarts = 4
  private scheduledRestartTimeout?: ReturnType<typeof setTimeout>

  // Matter accessories pending response callback. Concurrent callers of
  // requestMatterAccessories share the same in-flight promise (see
  // matterAccessoriesPromise) so this resolver only needs to settle once.
  private matterAccessoriesResolve?: (data: { accessories: any[], bridgeUsername: string } | undefined) => void

  // In-flight requestMatterAccessories promise. Cached so that a second
  // caller arriving while the first is pending shares the same response
  // rather than racing for the single resolver slot — without this, the
  // first caller's `accessoriesData` would be lost to a `undefined`
  // short-circuit and its `handleGetMatterAccessories` would emit an
  // accessoriesData event missing this child's accessories.
  private matterAccessoriesPromise?: Promise<{ accessories: any[], bridgeUsername: string } | undefined>

  // Callback for external Matter bridge registration
  public onExternalBridgeRegistered?: (externalBridgeUsername: string, ownerUsername: string) => void

  // Callback fired when the child sends an accessoryInfoData response, so the
  // parent server can cancel its pending fallback timer for that uuid before
  // it fires a spurious "Timed out" event at the UI.
  public onAccessoryInfoResponse?: (uuid: string) => void

  // Stored shutdown listener so it can be removed in teardown(),
  // matching the pattern used by MatterBridgeManager (#3915).
  private readonly _onApiShutdown = (): void => {
    this.shuttingDown = true
    this.teardown()
  }

  constructor(
    public type: PluginType,
    public identifier: string,
    private plugin: Plugin,
    private bridgeConfig: BridgeConfiguration,
    private homebridgeConfig: HomebridgeConfig,
    private homebridgeOptions: HomebridgeOptions,
    private api: HomebridgeAPI,
    private ipcService: IpcService,
    private externalPortService: ExternalPortService,
  ) {
    this.log = Logger.withPrefix(this.plugin.getPluginIdentifier())
    this.api.on('shutdown', this._onApiShutdown)

    // make sure we don't hit the max listeners limit
    this.api.setMaxListeners(this.api.getMaxListeners() + 1)
  }

  /**
   * Start the child bridge service
   */
  public start(): void {
    this.setProcessFlags()
    this.setProcessEnv()
    this.startChildProcess()

    // set display name
    if (this.pluginConfig.length !== 1) {
      this.displayName = this.plugin.getPluginIdentifier()
    } else {
      this.displayName = this.pluginConfig[0]?.name || this.plugin.getPluginIdentifier()
    }

    // re-configured log with display name
    this.log = Logger.withPrefix(this.displayName)
  }

  /**
   * Add a config block to a child bridge.
   * Platform child bridges can only contain one config block.
   * @param config
   */
  public addConfig(config: PlatformConfig | AccessoryConfig): void {
    this.pluginConfig.push(config)
  }

  /**
   * Start Matter monitoring on this child bridge
   */
  public startMatterMonitoring(): void {
    this.sendMessage(ChildProcessMessageEventType.START_MATTER_MONITORING)
  }

  /**
   * Stop Matter monitoring on this child bridge
   */
  public stopMatterMonitoring(): void {
    this.sendMessage(ChildProcessMessageEventType.STOP_MATTER_MONITORING)
  }

  /**
   * Request Matter accessories from this child bridge.
   * Returns a promise that resolves when the child responds, or undefined on timeout.
   *
   * Concurrent callers share the same in-flight promise. Previously each
   * call registered its own resolver in `matterAccessoriesResolve`, and the
   * second caller would clobber the first — when the child's
   * `accessoriesData` arrived only the second caller would see it and the
   * first caller would either hang until its timer fired or (after the
   * stranding fix) short-circuit with `undefined`. Either way the first
   * caller's `handleGetMatterAccessories` would emit an `accessoriesData`
   * event missing this child's accessories. Coalescing lets both callers
   * resolve with the same data on a single response.
   */
  public requestMatterAccessories(timeoutMs = 500): Promise<{ accessories: any[], bridgeUsername: string } | undefined> {
    if (this.matterAccessoriesPromise) {
      return this.matterAccessoriesPromise
    }

    this.matterAccessoriesPromise = new Promise((resolve) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const settle = (data: { accessories: any[], bridgeUsername: string } | undefined) => {
        if (timeout) {
          clearTimeout(timeout)
        }
        // Only clear the slots if they still point at this in-flight call —
        // defensive against a future change introducing overlapping calls
        // before the previous one has settled.
        if (this.matterAccessoriesResolve === settle) {
          this.matterAccessoriesResolve = undefined
        }
        this.matterAccessoriesPromise = undefined
        resolve(data)
      }
      timeout = setTimeout(settle, timeoutMs, undefined)
      this.matterAccessoriesResolve = settle

      this.sendMessage(ChildProcessMessageEventType.GET_MATTER_ACCESSORIES)
    })
    return this.matterAccessoriesPromise
  }

  /**
   * Get specific Matter accessory info from this child bridge
   */
  public getMatterAccessoryInfo(uuid: string): void {
    this.sendMessage(ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO, { uuid })
  }

  /**
   * Control a Matter accessory on this child bridge
   */
  public controlMatterAccessory(data: { uuid: string, cluster: string, attributes: Record<string, unknown>, partId?: string }): void {
    this.sendMessage(ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL, data)
  }

  private get bridgeStatus(): ChildBridgeStatus {
    return this.lastBridgeStatus
  }

  private set bridgeStatus(value: ChildBridgeStatus) {
    this.lastBridgeStatus = value
    this.sendStatusUpdate()
  }

  /**
   * Start the child bridge process
   */
  private startChildProcess(): void {
    this.bridgeStatus = ChildBridgeStatus.PENDING

    this.child = fork(resolve(__dirname, 'childBridgeFork.js'), this.args, this.processEnv)

    this.child.stdout?.on('data', (data) => {
      process.stdout.write(data)
    })

    this.child.stderr?.on('data', (data) => {
      process.stderr.write(data)
    })

    this.child.on('error', (e) => {
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.log.error('Child bridge process error', e)
    })

    this.child.once('close', (code, signal) => {
      this.handleProcessClose(code, signal)
    })

    // handle incoming ipc messages from the child process
    this.child.on('message', (message: ChildProcessMessageEvent<unknown>) => {
      if (typeof message !== 'object' || !message.id) {
        return
      }

      switch (message.id) {
        case ChildProcessMessageEventType.READY: {
          this.log(`Child bridge starting${this.child?.pid ? ` (pid ${this.child.pid})` : ''}...`)
          this.loadPlugin()
          break
        }
        case ChildProcessMessageEventType.LOADED: {
          const version = (message.data as ChildProcessPluginLoadedEventData).version
          if (this.pluginConfig.length > 1) {
            this.log.success(`Child bridge started successfully with ${this.pluginConfig.length} accessories (plugin v${version}).`)
          } else {
            this.log.success(`Child bridge started successfully (plugin v${version}).`)
          }
          this.startBridge()
          break
        }
        case ChildProcessMessageEventType.ONLINE: {
          this.bridgeStatus = ChildBridgeStatus.OK
          break
        }
        case ChildProcessMessageEventType.PORT_REQUEST: {
          void this.handlePortRequest(message.data as ChildProcessPortRequestEventData)
          break
        }
        case ChildProcessMessageEventType.RELEASE_MATTER_PORT: {
          const data = message.data as { uniqueId?: string } | undefined
          if (data?.uniqueId) {
            this.externalPortService.releaseMatterPort(data.uniqueId)
          }
          break
        }
        case ChildProcessMessageEventType.STATUS_UPDATE: {
          // Handle unified status update with HAP and Matter info
          const statusData = message.data as ChildBridgePairedStatusEventData

          // Update HAP status
          this.pairedStatus = statusData.paired
          this.setupUri = statusData.setupUri

          // Update Matter commissioning info if included
          if (statusData.matter) {
            this.matterCommissioningInfo = {
              qrCode: statusData.matter.qrCode,
              manualPairingCode: statusData.matter.manualPairingCode,
              serialNumber: statusData.matter.serialNumber,
              commissioned: statusData.matter.commissioned || false,
              deviceCount: statusData.matter.deviceCount,
            }
          }

          // Send unified status update
          this.sendStatusUpdate()
          break
        }
        case ChildProcessMessageEventType.MATTER_EVENT: {
          // Handle unified Matter event
          const matterEvent = message.data as MatterEvent

          // Special handling for accessoriesData - resolve pending request
          if (matterEvent.type === 'accessoriesData') {
            this.matterAccessoriesResolve?.(matterEvent.data as any)
          } else if (matterEvent.type === 'externalBridgeRegistration') {
            // Handle external bridge registration - register directly with callback
            const data = matterEvent.data as any
            if (this.onExternalBridgeRegistered) {
              // Pass the child bridge username (not identifier) so it can be looked up in childBridges Map
              this.onExternalBridgeRegistered(data.externalBridgeUsername, this.bridgeConfig.username)
            }
          } else {
            // accessoryInfoData responses must cancel the parent's fallback
            // timer for that uuid before being forwarded — otherwise the UI
            // gets a stale "Timed out" event 2s after a successful response.
            if (matterEvent.type === 'accessoryInfoData' && this.onAccessoryInfoResponse) {
              const uuid = (matterEvent.data as { uuid?: string } | undefined)?.uuid
              if (uuid) {
                this.onAccessoryInfoResponse(uuid)
              }
            }
            // Forward all other Matter events to main process IPC
            this.ipcService.sendMessage(IpcOutgoingEvent.MATTER_EVENT, matterEvent)
          }
          break
        }
      }
    })
  }

  /**
   * Called when the child bridge process exits, if Homebridge is not shutting down, it will restart the process
   * @param code
   * @param signal
   */
  private handleProcessClose(code: number | null, signal: string | null): void {
    const isLikelyPluginCrash = code === 1 && signal === null
    this.log.warn(`Child bridge ended (code ${code}, signal ${signal}).${isLikelyPluginCrash
      ? ' The child bridge ended unexpectedly, which is normally due to the plugin not catching its errors properly. Please report this to the plugin developer by clicking on the'
      + ' \'Report An Issue\' option in the plugin menu dropdown from the Homebridge UI. If there are related logs shown above, please include them in your report.'
      : ''}`)

    if (isLikelyPluginCrash) {
      if (this.restartCount < this.maxRestarts) {
        this.bridgeStatus = ChildBridgeStatus.PENDING
        this.restartCount += 1
        const delay = this.restartCount * 10 // first attempt after 10 seconds, second after 20 seconds, etc.
        this.log(`Child bridge will automatically restart in ${delay} seconds (restart attempt ${this.restartCount} of ${this.maxRestarts}).`)
        this.scheduledRestartTimeout = setTimeout(() => {
          this.scheduledRestartTimeout = undefined
          if (!this.shuttingDown && !this.manuallyStopped) {
            this.startChildProcess()
          }
        }, delay * 1000)
      } else {
        this.bridgeStatus = ChildBridgeStatus.DOWN
        this.manuallyStopped = true
        this.log.error(`Child bridge will no longer restart after failing ${this.maxRestarts + 1} times, you will need to manually start this child bridge from the Homebridge UI.`)
      }
      return
    }

    if (!this.shuttingDown) {
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.restartCount = 0
      this.startChildProcess()
    }
  }

  /**
   * Helper function to send a message to the child process
   * @param type
   * @param data
   */
  private sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): void {
    if (this.child && this.child.connected) {
      this.child.send({
        id: type,
        data,
      })
    }
  }

  /**
   * Some plugins may make use of the homebridge process flags
   * These will be passed through to the forked process
   */
  private setProcessFlags(): void {
    if (this.bridgeConfig.debugModeEnabled) {
      this.args.push('-D')
    }

    if (this.homebridgeOptions.forceColourLogging) {
      this.args.push('-C')
    }

    if (this.homebridgeOptions.insecureAccess) {
      this.args.push('-I')
    }

    if (this.homebridgeOptions.noLogTimestamps) {
      this.args.push('-T')
    }

    if (this.homebridgeOptions.keepOrphanedCachedAccessories) {
      this.args.push('-K')
    }

    if (this.homebridgeOptions.customStoragePath) {
      this.args.push('-U', this.homebridgeOptions.customStoragePath)
    }

    if (this.homebridgeOptions.customPluginPath) {
      this.args.push('-P', this.homebridgeOptions.customPluginPath)
    }
  }

  /**
   * Set environment variables for the child process
   */
  private setProcessEnv(): void {
    this.processEnv = {
      env: {
        ...process.env,
        DEBUG: `${process.env.DEBUG || ''} ${this.bridgeConfig.env?.DEBUG || ''}`.trim(),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} ${this.bridgeConfig.env?.NODE_OPTIONS || ''}`.trim(),
      },
      silent: true,
    }
  }

  /**
   * Tell the child process to load the given plugin
   */
  private loadPlugin(): void {
    const bridgeConfig: BridgeConfiguration = {
      name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
      port: this.bridgeConfig.port,
      username: this.bridgeConfig.username,
      advertiser: this.homebridgeConfig.bridge.advertiser,
      pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
      bind: this.homebridgeConfig.bridge.bind,
      setupID: this.bridgeConfig.setupID,
      manufacturer: this.bridgeConfig.manufacturer || this.homebridgeConfig.bridge.manufacturer,
      model: this.bridgeConfig.model || this.homebridgeConfig.bridge.model,
      firmwareRevision: this.bridgeConfig.firmwareRevision || this.homebridgeConfig.bridge.firmwareRevision,
      serialNumber: this.bridgeConfig.serialNumber || this.bridgeConfig.username,
      hap: this.bridgeConfig.hap,
      matter: this.bridgeConfig.matter,
    }

    const bridgeOptions: BridgeOptions = {
      cachedAccessoriesDir: User.cachedAccessoryPath(),
      cachedAccessoriesItemName: `cachedAccessories.${this.bridgeConfig.username.replace(COLON_RE, '').toUpperCase()}`,
      externalAccessoriesItemName: `externalAccessories.${this.bridgeConfig.username.replace(COLON_RE, '').toUpperCase()}`,
    }

    // shallow copy the homebridge options to the bridge options object
    Object.assign(bridgeOptions, this.homebridgeOptions)

    // Override with child bridge specific settings
    if (this.bridgeConfig.debugModeEnabled !== undefined) {
      bridgeOptions.debugModeEnabled = this.bridgeConfig.debugModeEnabled
    }

    this.sendMessage<ChildProcessLoadEventData>(ChildProcessMessageEventType.LOAD, {
      type: this.type,
      identifier: this.identifier,
      pluginPath: this.plugin.getPluginPath(),
      pluginConfig: this.pluginConfig,
      bridgeConfig,
      bridgeOptions,
      homebridgeConfig: { // need to break this out to avoid a circular structure to JSON from other plugins modifying their config at runtime.
        bridge: this.homebridgeConfig.bridge,
        ports: this.homebridgeConfig.ports,
        disabledPlugins: [], // not used by child bridges
        accessories: [], // not used by child bridges
        platforms: [], // not used by child bridges
      },
    })
  }

  /**
   * Tell the child bridge to start broadcasting
   */
  private startBridge(): void {
    this.sendMessage(ChildProcessMessageEventType.START)
  }

  /**
   * Handle external port requests from child
   */
  private async handlePortRequest(request: ChildProcessPortRequestEventData) {
    let port: number | undefined

    if (request.portType === 'matter') {
      // Request from Matter port pool
      port = await this.externalPortService.requestMatterPort(request.username)
    } else {
      // Request from HAP port pool (default)
      port = await this.externalPortService.requestPort(request.username)
    }

    this.sendMessage<ChildProcessPortAllocatedEventData>(ChildProcessMessageEventType.PORT_ALLOCATED, {
      username: request.username,
      port,
    })
  }

  /**
   * Send sigterm to the child bridge, escalating to sigkill if the child
   * does not exit within 10 seconds.
   */
  private teardown(): void {
    // Remove the api shutdown listener so this service can be GC'd.
    this.api.removeListener('shutdown', this._onApiShutdown)
    this.api.setMaxListeners(Math.max(0, this.api.getMaxListeners() - 1))

    if (this.child && this.child.connected) {
      this.bridgeStatus = ChildBridgeStatus.DOWN
      const child = this.child
      child.kill('SIGTERM')
      // If the child has not exited within 10s, escalate to SIGKILL.
      // The 'close' handler will clear this in the normal-exit path because
      // child.connected becomes false before close fires.
      const sigkillTimer = setTimeout(() => {
        if (child.connected) {
          this.log.warn('Child bridge did not exit within 10s of SIGTERM; escalating to SIGKILL.')
          child.kill('SIGKILL')
        }
      }, 10000)
      sigkillTimer.unref()
    }
  }

  /**
   * Trigger sending child bridge metadata to the process parent via IPC
   */
  private sendStatusUpdate(): void {
    this.ipcService.sendMessage(IpcOutgoingEvent.CHILD_BRIDGE_STATUS_UPDATE, this.getMetadata())
  }

  /**
   * Restarts the child bridge process
   */
  public restartChildBridge(): void {
    if (this.manuallyStopped) {
      this.restartCount = 0
      this.startChildBridge()
    } else {
      this.log.warn('Child bridge restarting...')
      void this.refreshConfig()
      this.teardown()
    }
  }

  /**
   * Stops the child bridge, not starting it again
   */
  public stopChildBridge(): void {
    if (!this.shuttingDown) {
      this.log.warn('Child bridge stopping, will not restart.')
      this.shuttingDown = true
      this.manuallyStopped = true
      this.restartCount = 0
      if (this.scheduledRestartTimeout) {
        clearTimeout(this.scheduledRestartTimeout)
        this.scheduledRestartTimeout = undefined
      }
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.child?.removeAllListeners()
      this.teardown()
    } else {
      this.log.warn('Child bridge already shutting down or stopped.')
    }
  }

  /**
   * Starts the child bridge, only if it was manually stopped and is no longer running
   */
  public startChildBridge(): void {
    if (this.manuallyStopped && this.bridgeStatus === ChildBridgeStatus.DOWN && (!this.child || !this.child.connected)) {
      void this.refreshConfig()
      this.startChildProcess()
      this.shuttingDown = false
      this.manuallyStopped = false
    } else {
      this.log.warn('Child bridge cannot be started, it is still running or was not manually stopped.')
    }
  }

  /**
   * Read the config.json file from disk and refresh the plugin config block for just this plugin
   */
  public async refreshConfig(): Promise<void> {
    try {
      const homebridgeConfig: HomebridgeConfig = await fs.readJson(User.configPath())

      if (this.type === PluginType.PLATFORM) {
        // The on-disk config may be missing `platforms`/`accessories` entirely
        // (we're reading via fs.readJson, not loadConfig, so the defaults
        // don't apply). Coalesce to [] before filtering.
        const config = (homebridgeConfig.platforms ?? []).filter(x => x.platform === this.identifier && x._bridge?.username === this.bridgeConfig.username)
        if (config.length) {
          this.pluginConfig = config
          this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig
        } else {
          this.log.warn('Platform config could not be found, using existing config.')
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const config = (homebridgeConfig.accessories ?? []).filter(x => x.accessory === this.identifier && x._bridge?.username === this.bridgeConfig.username)
        if (config.length) {
          this.pluginConfig = config
          this.bridgeConfig = this.pluginConfig[0]._bridge || this.bridgeConfig
        } else {
          this.log.warn('Accessory config could not be found, using existing config.')
        }
      }
    } catch (error: any) {
      this.log.error('Failed to refresh plugin config:', error.message)
    }
  }

  /**
   * Returns metadata about this child bridge
   */
  public getMetadata(): ChildMetadata {
    return {
      status: this.bridgeStatus,
      paired: this.pairedStatus,
      setupUri: this.setupUri,
      username: this.bridgeConfig.username,
      port: this.bridgeConfig.port,
      pin: this.bridgeConfig.pin || this.homebridgeConfig.bridge.pin,
      name: this.bridgeConfig.name || this.displayName || this.plugin.getPluginIdentifier(),
      plugin: this.plugin.getPluginIdentifier(),
      identifier: this.identifier,
      pid: this.child?.pid,
      manuallyStopped: this.manuallyStopped,
      // hap is normalized to the object form by validateHapConfig before a
      // child bridge runs; coerce any legacy boolean defensively so
      // ChildMetadata stays object-shaped for consumers (e.g. the config UI).
      hap: typeof this.bridgeConfig.hap === 'boolean'
        ? { enabled: this.bridgeConfig.hap }
        : this.bridgeConfig.hap,
      matterConfig: this.bridgeConfig.matter,
      matterIdentifier: this.bridgeConfig.matter ? this.bridgeConfig.username : undefined,
      matterSetupUri: this.matterCommissioningInfo?.qrCode,
      matterPin: this.matterCommissioningInfo?.manualPairingCode,
      matterSerialNumber: this.matterCommissioningInfo?.serialNumber,
      matterCommissioned: this.matterCommissioningInfo?.commissioned,
      matterDeviceCount: this.matterCommissioningInfo?.deviceCount,
    }
  }
}
