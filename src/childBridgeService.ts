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
import type { FabricInfo, MatterConfig } from './matter/index.js'
import type { ChildBridgeMatterStatusInfo, MatterControlRequest } from './matter/ipc-types.js'
import type { AccessoryInfo } from './matter/managerTypes.js'
import type { Plugin } from './plugin.js'
import type { HomebridgeOptions } from './server.js'

import { fork } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import fs from 'fs-extra'

import { PluginType } from './api.js'
import { validateHapConfig } from './bridgeService.js'
import { IpcOutgoingEvent } from './ipcService.js'
import { Logger } from './logger.js'
import { shouldStartMatterServer, stripMatterExternalsOnlyForAccessory, validateMatterExternalsOnly } from './matter/config.js'
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
   * Sent from the child process once the bridge has been started: its
   * accessories are loaded and the HAP publish has been asked for. The bridge
   * may not be advertised on the network yet at that moment.
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
   *
   * accessoryAdded and accessoryRemoved are sent by the Matter server itself
   * (matter/server/AccessoryManager.ts) with IpcOutgoingEvent.MATTER_EVENT,
   * the id the main process uses towards the UI. In a child bridge that only
   * reaches this handler because the two ids are the same string: keep
   * them equal.
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
   * The child bridge is online and has published its accessory
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

/**
 * Every message the main process and a child bridge process send each other,
 * with the data that goes with its id.
 */
export type ChildProcessMessage
  = | {
    id: ChildProcessMessageEventType.READY
      | ChildProcessMessageEventType.START
      | ChildProcessMessageEventType.ONLINE
      | ChildProcessMessageEventType.START_MATTER_MONITORING
      | ChildProcessMessageEventType.STOP_MATTER_MONITORING
      | ChildProcessMessageEventType.GET_MATTER_ACCESSORIES
    data?: undefined
  }
  | { id: ChildProcessMessageEventType.LOAD, data: ChildProcessLoadEventData }
  | { id: ChildProcessMessageEventType.LOADED, data: ChildProcessPluginLoadedEventData }
  | { id: ChildProcessMessageEventType.PORT_REQUEST, data: ChildProcessPortRequestEventData }
  | { id: ChildProcessMessageEventType.PORT_ALLOCATED, data: ChildProcessPortAllocatedEventData }
  | { id: ChildProcessMessageEventType.STATUS_UPDATE, data: ChildBridgePairedStatusEventData }
  | { id: ChildProcessMessageEventType.RELEASE_MATTER_PORT, data?: { uniqueId?: string } }
  | { id: ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO, data: { uuid: string, correlationId?: string } }
  | { id: ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL, data: MatterControlRequest }
  | { id: ChildProcessMessageEventType.MATTER_EVENT, data: MatterEvent }

/**
 * What a child bridge answers to a request for its Matter accessories.
 */
export interface ChildBridgeMatterAccessories {
  accessories: AccessoryInfo[]
  bridgeUsername: string
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
  matter?: ChildBridgeMatterStatusInfo
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
  matterFabricCount?: number
  matterFabrics?: FabricInfo[]
  /**
   * True when Matter is configured for the child bridge but its server did
   * not start (for example its port is in use). The reason is in the log.
   */
  matterStartFailed?: boolean
}

/**
 * Manages the child processes of platforms/accessories being exposed as separate forked bridges.
 * A child bridge runs a single platform or accessory.
 */
export class ChildBridgeService {
  private child?: ChildProcess
  private args: string[] = []
  private forkOptions: ForkOptions = {}
  private shuttingDown = false
  private lastBridgeStatus: ChildBridgeStatus = ChildBridgeStatus.PENDING
  private pairedStatus: boolean | null = null
  private manuallyStopped = false
  private setupUri: string | null = null
  private matterCommissioningInfo?: ChildBridgeMatterStatusInfo

  private pluginConfig: Array<PlatformConfig | AccessoryConfig> = []
  private log: Logging
  private displayName?: string
  private restartCount = 0
  private readonly maxRestarts = 4
  private scheduledRestartTimeout?: ReturnType<typeof setTimeout>
  // Wall-clock time (ms) the current child last reported ONLINE, or undefined
  // if it has not come up yet. Used to tell a healthy bridge that hit a
  // transient fault apart from a tight crash loop — see handleProcessClose.
  private childOnlineSince?: number
  // A child that stayed up at least this long before an unexpected exit is
  // treated as "unlucky" rather than "broken": its restart count is reset so
  // an occasional transient crash on a long-lived bridge never accumulates
  // toward a permanent shutdown. 5 minutes is comfortably longer than any
  // normal startup and shorter than real uptime, so a crash loop (which dies
  // within seconds) never qualifies.
  private readonly stableRunResetMs = 5 * 60 * 1000

  // Matter accessories pending response callback. Concurrent callers of
  // requestMatterAccessories share the same in-flight promise (see
  // matterAccessoriesPromise) so this resolver only needs to settle once.
  private matterAccessoriesResolve?: (data: ChildBridgeMatterAccessories | undefined) => void

  // In-flight requestMatterAccessories promise. Cached so that a second
  // caller arriving while the first is pending shares the same response
  // rather than racing for the single resolver slot — without this, the
  // first caller's `accessoriesData` would be lost to a `undefined`
  // short-circuit and its `handleGetMatterAccessories` would emit an
  // accessoriesData event missing this child's accessories.
  private matterAccessoriesPromise?: Promise<ChildBridgeMatterAccessories | undefined>

  // Callback for external Matter bridge registration
  public onExternalBridgeRegistered?: (externalBridgeUsername: string, ownerUsername: string) => void

  // Callback fired when the child sends an accessoryInfoData response, so the
  // parent server can cancel its pending fallback timer for that lookup before
  // it fires a spurious "Timed out" event at the UI.
  public onAccessoryInfoResponse?: (uuid: string, correlationId?: string) => void

  public onAccessoryControlResponse?: (correlationId: string) => void

  // Asks the parent server whether the UI has Matter state monitoring
  // switched on, so the ONLINE handler can re-arm a child that (re)started
  // after the one-shot enable broadcast.
  public isMatterMonitoringActive?: () => boolean

  // Set when the user asked for a restart, so the exit that follows is not
  // counted as a crash by handleProcessClose().
  private restartRequested = false

  // Whether _onApiShutdown is attached to the api right now. A manual stop
  // removes it, and a later start has to put it back.
  private shutdownListenerAttached = false

  // Stored shutdown listener so it can be removed in teardown(),
  // matching the pattern used by MatterBridgeManager (#3915).
  private readonly _onApiShutdown = (): void => {
    this.shuttingDown = true
    // A restart that was waiting out its back-off is not going to happen.
    if (this.scheduledRestartTimeout) {
      clearTimeout(this.scheduledRestartTimeout)
      this.scheduledRestartTimeout = undefined
    }
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
    this.attachShutdownListener()
  }

  /**
   * Listen for the Homebridge shutdown, so the child process is told to stop.
   * Does nothing when the listener is already attached.
   */
  private attachShutdownListener(): void {
    if (this.shutdownListenerAttached) {
      return
    }
    this.shutdownListenerAttached = true
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
   * Returns a promise that resolves when the child responds, or undefined on
   * timeout, or undefined at once when the child process is not running.
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
  public requestMatterAccessories(timeoutMs = 500): Promise<ChildBridgeMatterAccessories | undefined> {
    if (this.matterAccessoriesPromise) {
      return this.matterAccessoriesPromise
    }

    // A child that is stopped, restarting, or waiting to be restarted cannot
    // answer. The request used to be dropped and the caller waited out the
    // timeout, so one such child held up every accessories list for the UI.
    if (!this.child?.connected) {
      return Promise.resolve(undefined)
    }

    this.matterAccessoriesPromise = new Promise((resolve) => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const settle = (data: ChildBridgeMatterAccessories | undefined) => {
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
  public getMatterAccessoryInfo(uuid: string, correlationId?: string): void {
    // The child echoes the correlationId on its accessoryInfoData reply: the
    // UI drops a reply that does not carry the id of its request.
    this.sendMessage(ChildProcessMessageEventType.GET_MATTER_ACCESSORY_INFO, { uuid, correlationId })
  }

  /**
   * Control a Matter accessory on this child bridge
   *
   * @returns false when the request could not be sent, because the child
   * process is not running (stopped, restarting, or waiting to be restarted)
   */
  public controlMatterAccessory(data: MatterControlRequest): boolean {
    // The correlationId (when the UI sent one) rides through to the child,
    // whose message handler echoes it on its accessoryControlResponse - that
    // is what lets the UI match the response to its pending request.
    return this.sendMessage(ChildProcessMessageEventType.MATTER_ACCESSORY_CONTROL, data)
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
    // What the last process reported is not true of the new one: it may have
    // been started with Matter (or HAP) taken out of its config. The new
    // process sends its own status once it is up.
    this.pairedStatus = null
    this.setupUri = null
    this.matterCommissioningInfo = undefined

    this.bridgeStatus = ChildBridgeStatus.PENDING
    // A freshly (re)started process has not reported ONLINE yet.
    this.childOnlineSince = undefined

    this.child = fork(resolve(__dirname, 'childBridgeFork.js'), this.args, this.forkOptions)

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
    this.child.on('message', (message: ChildProcessMessage) => {
      if (!message || typeof message !== 'object' || !message.id) {
        return
      }

      switch (message.id) {
        case ChildProcessMessageEventType.READY: {
          this.log(`Child bridge starting${this.child?.pid
            ? ` (pid ${this.child.pid})`
            : ''}...`)
          this.loadPlugin()
          break
        }
        case ChildProcessMessageEventType.LOADED: {
          const version = message.data.version
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
          this.childOnlineSince = Date.now()
          // Re-arm Matter state monitoring on every (re)start. The UI's
          // enable is a one-shot broadcast to the children running at that
          // moment - a child still starting misses it (sendMessage drops the
          // message when the process isn't connected, and the child drops it
          // before its Matter server exists), and a child restarting later
          // comes back with monitoring off - either way its accessoryUpdate
          // events for the UI silently stop. ONLINE is sent after the
          // child's Matter setup completes, so the enable lands here.
          if (this.isMatterMonitoringActive?.()) {
            this.startMatterMonitoring()
          }
          break
        }
        case ChildProcessMessageEventType.PORT_REQUEST: {
          void this.handlePortRequest(message.data)
          break
        }
        case ChildProcessMessageEventType.RELEASE_MATTER_PORT: {
          if (message.data?.uniqueId) {
            this.externalPortService.releaseMatterPort(message.data.uniqueId)
          }
          break
        }
        case ChildProcessMessageEventType.STATUS_UPDATE: {
          // Handle unified status update with HAP and Matter info
          const statusData = message.data

          // Update HAP status
          this.pairedStatus = statusData.paired
          this.setupUri = statusData.setupUri

          // Update Matter commissioning info. A status with no Matter part
          // means the child has no Matter server now, so the old details go.
          this.matterCommissioningInfo = statusData.matter
            ? {
                qrCode: statusData.matter.qrCode,
                manualPairingCode: statusData.matter.manualPairingCode,
                serialNumber: statusData.matter.serialNumber,
                commissioned: statusData.matter.commissioned || false,
                deviceCount: statusData.matter.deviceCount,
                fabricCount: statusData.matter.fabricCount,
                fabrics: statusData.matter.fabrics,
                ...(statusData.matter.startFailed && { startFailed: true }),
              }
            : undefined

          // Send unified status update
          this.sendStatusUpdate()
          break
        }
        case ChildProcessMessageEventType.MATTER_EVENT: {
          // Handle unified Matter event
          const matterEvent = message.data

          // Special handling for accessoriesData - resolve pending request
          if (matterEvent.type === 'accessoriesData') {
            this.matterAccessoriesResolve?.(matterEvent.data as ChildBridgeMatterAccessories)
          } else if (matterEvent.type === 'externalBridgeRegistration') {
            // Handle external bridge registration - register directly with callback
            const data = matterEvent.data as { externalBridgeUsername: string }
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
                this.onAccessoryInfoResponse(uuid, matterEvent.correlationId)
              }
            }
            // Same for a control response: this child owns the accessory, so
            // cancel the parent's "no child claimed it" fallback before the
            // response is forwarded.
            if (matterEvent.type === 'accessoryControlResponse' && this.onAccessoryControlResponse) {
              if (matterEvent.correlationId) {
                this.onAccessoryControlResponse(matterEvent.correlationId)
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

    if (this.shuttingDown) {
      return
    }

    // A restart the user asked for is not a crash: start again straight away
    // and do not count it toward maxRestarts.
    if (this.restartRequested) {
      this.restartRequested = false
      this.restartCount = 0
      this.childOnlineSince = undefined
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.startChildProcess()
      return
    }

    // A child that ran stably for a while before dying is "unlucky", not
    // "broken": reset the restart cap so an occasional transient crash on a
    // long-lived bridge doesn't slowly accumulate toward a permanent shutdown.
    // Only a genuinely stable run counts — the child must have reached ONLINE
    // and stayed up past stableRunResetMs. A tight crash loop dies well before
    // the threshold and so keeps counting toward maxRestarts.
    if (this.childOnlineSince !== undefined && Date.now() - this.childOnlineSince >= this.stableRunResetMs) {
      this.restartCount = 0
    }
    this.childOnlineSince = undefined

    // Apply the restart cap to *every* unexpected exit, not just code=1.
    // Previously the "non-plugin-crash" path reset restartCount to 0 and
    // restarted immediately, so a process repeatedly killed by SIGSEGV /
    // SIGABRT would produce an unbounded restart loop, defeating the cap.
    if (this.restartCount >= this.maxRestarts) {
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.manuallyStopped = true
      this.log.error(`Child bridge will no longer restart after failing ${this.maxRestarts + 1} times, you will need to manually start this child bridge from the Homebridge UI.`)
      return
    }

    this.restartCount += 1

    if (isLikelyPluginCrash) {
      // Plugin crashes are usually caused by mistakes that won't fix themselves;
      // back off so we don't burn CPU thrashing.
      this.bridgeStatus = ChildBridgeStatus.PENDING
      const delay = this.restartCount * 10 // first attempt after 10 seconds, second after 20 seconds, etc.
      this.log(`Child bridge will automatically restart in ${delay} seconds (restart attempt ${this.restartCount} of ${this.maxRestarts}).`)
      this.scheduledRestartTimeout = setTimeout(() => {
        this.scheduledRestartTimeout = undefined
        if (!this.shuttingDown && !this.manuallyStopped) {
          this.startChildProcess()
        }
      }, delay * 1000)
      // Homebridge does not stay up just to restart a child bridge.
      this.scheduledRestartTimeout.unref()
    } else {
      // Signal-based or non-1 exit codes: restart immediately, but the cap
      // above still applies, so we won't loop forever on a hard crash.
      this.bridgeStatus = ChildBridgeStatus.DOWN
      this.startChildProcess()
    }
  }

  /**
   * Helper function to send a message to the child process
   * @param type
   * @param data
   * @returns whether the message was sent: it is dropped when the child is not connected
   */
  private sendMessage<T = unknown>(type: ChildProcessMessageEventType, data?: T): boolean {
    if (this.child && this.child.connected) {
      this.child.send({
        id: type,
        data,
      })
      return true
    }
    return false
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
    this.forkOptions = {
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
    // Only release the api shutdown listener when the service itself is going
    // away (manual stop or parent shutdown). `restartChildBridge` also calls
    // teardown(), but the service stays alive across a restart — dropping the
    // listener there orphans the new child from the parent's shutdown signal.
    if ((this.shuttingDown || this.manuallyStopped) && this.shutdownListenerAttached) {
      this.shutdownListenerAttached = false
      this.api.removeListener('shutdown', this._onApiShutdown)
      this.api.setMaxListeners(Math.max(0, this.api.getMaxListeners() - 1))
    }

    if (this.child && this.child.connected) {
      this.bridgeStatus = ChildBridgeStatus.DOWN
      const child = this.child
      child.kill('SIGTERM')
      // If the child has not exited within 10s, escalate to SIGKILL.
      // Nothing clears this timer. In the normal-exit path it does nothing
      // when it fires, because child.connected is false by then.
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
    } else if (this.scheduledRestartTimeout) {
      // The process crashed and is waiting to be started again. There is
      // nothing to stop, so start it now: before, the log said "restarting"
      // and the user still sat through the rest of the 10 to 40 second wait.
      clearTimeout(this.scheduledRestartTimeout)
      this.scheduledRestartTimeout = undefined
      this.log.warn('Child bridge restarting...')
      this.restartCount = 0
      void this.refreshConfig()
      this.startChildProcess()
    } else {
      this.log.warn('Child bridge restarting...')
      void this.refreshConfig()
      this.restartRequested = !!this.child?.connected
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
      this.attachShutdownListener()
      this.startChildProcess()
      this.shuttingDown = false
      this.manuallyStopped = false
    } else {
      this.log.warn('Child bridge cannot be started, it is still running or was not manually stopped.')
    }
  }

  /**
   * Whether a `_bridge.username` read from config.json is this child bridge's.
   * The username in memory is upper case (it is normalised at start-up), while
   * the file keeps the user's own spelling.
   */
  private isOwnUsername(username: unknown): boolean {
    return typeof username === 'string' && username.toUpperCase() === this.bridgeConfig.username.toUpperCase()
  }

  /**
   * Take the `_bridge` block read again from config.json as this child
   * bridge's config. The username stays the one already in use: it is this
   * bridge's identity, and the file may spell it in lower case.
   *
   * The block gets the checks a full start gives it. Before, a `_bridge` block
   * changed in the UI was used unchecked after a child bridge restart: a wrong
   * `hap` block, or a Matter port another bridge already has.
   */
  private async useRefreshedBridgeConfig(homebridgeConfig: HomebridgeConfig): Promise<void> {
    const config = this.pluginConfig[0]
    const bridgeConfig = config?._bridge
    if (!bridgeConfig) {
      return
    }

    const bridgeLabel = `${this.type} "${this.identifier}" child bridge`

    try {
      validateHapConfig(bridgeConfig, { bridgeLabel, isAccessoryPlugin: this.type === PluginType.ACCESSORY })
    } catch (error: unknown) {
      this.log.error(`${error instanceof Error
        ? error.message
        : String(error)} Using the bridge settings the child bridge started with.`)
      return
    }

    if (bridgeConfig.matter) {
      if (this.type === PluginType.ACCESSORY) {
        stripMatterExternalsOnlyForAccessory(bridgeConfig.matter, bridgeLabel)
      } else {
        validateMatterExternalsOnly(bridgeConfig.matter, bridgeLabel)
      }

      // Same rule as a full start: a block that starts no server keeps its
      // settings as they are, and one that is not valid is dropped.
      if (shouldStartMatterServer(bridgeConfig.matter)) {
        const { MatterConfigValidator } = await import('./matter/configValidator.js')
        const validation = MatterConfigValidator.validateChildMatterConfig(config, this.type === PluginType.ACCESSORY
          ? 'accessory'
          : 'platform', this.identifier)
        const port = bridgeConfig.matter.port

        if (!validation.isValid) {
          this.log.error('The Matter configuration of this child bridge is invalid. Matter will not be enabled for it.')
          delete bridgeConfig.matter
        } else if (port && this.isMatterPortOfAnotherBridge(homebridgeConfig, port)) {
          this.log.error(`Matter port ${port} is already used by another bridge in your config.json. Matter will not be enabled for this child bridge.`)
          delete bridgeConfig.matter
        } else if (port) {
          // A port set since Homebridge started is not known to the allocator
          // yet: no other bridge or external accessory may be given it.
          this.externalPortService.reserveMatterPort(port)
        }
      }
    }

    bridgeConfig.username = this.bridgeConfig.username
    this.bridgeConfig = bridgeConfig
  }

  /**
   * Whether the main bridge or another child bridge in config.json has this
   * Matter port, and will start a Matter server on it.
   */
  private isMatterPortOfAnotherBridge(homebridgeConfig: HomebridgeConfig, port: number): boolean {
    const mainMatter = homebridgeConfig.bridge?.matter
    if (mainMatter?.port === port && shouldStartMatterServer(mainMatter)) {
      return true
    }

    return [
      ...(homebridgeConfig.platforms ?? []),
      ...(homebridgeConfig.accessories ?? []),
    ].some((entry) => {
      const bridge = entry._bridge
      return !!bridge && !this.isOwnUsername(bridge.username) && bridge.matter?.port === port && shouldStartMatterServer(bridge.matter)
    })
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
        const config = (homebridgeConfig.platforms ?? []).filter(x => x.platform === this.identifier && this.isOwnUsername(x._bridge?.username))
        if (config.length) {
          this.pluginConfig = config
          await this.useRefreshedBridgeConfig(homebridgeConfig)
        } else {
          this.log.warn('Platform config could not be found, using existing config.')
        }
      } else if (this.type === PluginType.ACCESSORY) {
        const config = (homebridgeConfig.accessories ?? []).filter(x => x.accessory === this.identifier && this.isOwnUsername(x._bridge?.username))
        if (config.length) {
          this.pluginConfig = config
          await this.useRefreshedBridgeConfig(homebridgeConfig)
        } else {
          this.log.warn('Accessory config could not be found, using existing config.')
        }
      }
    } catch (error: unknown) {
      this.log.error('Failed to refresh plugin config:', error instanceof Error
        ? error.message
        : error)
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
      matterFabricCount: this.matterCommissioningInfo?.fabricCount,
      matterFabrics: this.matterCommissioningInfo?.fabrics,
      ...(this.matterCommissioningInfo?.startFailed && { matterStartFailed: true }),
    }
  }
}
