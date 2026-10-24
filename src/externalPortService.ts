import type { MacAddress } from '@homebridge/hap-nodejs'

import type { HomebridgeConfig } from './bridgeService.js'
import type { ChildBridgeFork } from './childBridgeFork.js'

import { Logger } from './logger.js'
import { MatterPortAllocator } from './matter/MatterPortAllocator.js'

export interface ExternalPortsConfiguration {
  start: number
  end: number
}

/**
 * Collect the HAP ports the config gives to the main bridge and to each child
 * bridge. A child bridge port inside `ports` is easy to end up with (older UI
 * versions picked them from there), and handing the same port to an external
 * accessory makes whichever binds second fail with EADDRINUSE.
 * @param config - the Homebridge config
 */
export function collectConfiguredHapPorts(config: HomebridgeConfig): number[] {
  return [
    config.bridge.port,
    ...config.platforms.map(platform => platform._bridge?.port),
    ...config.accessories.map(accessory => accessory._bridge?.port),
  ].filter((port): port is number => typeof port === 'number')
}

/**
 * Allocates ports from the user defined `config.ports` and `config.matterPorts` options
 * This service is used to allocate ports for external accessories on the main bridge, and child bridges.
 * HAP ports and Matter ports are managed separately with their own ranges.
 */
export class ExternalPortService {
  private nextExternalPort?: number
  private allocatedPorts: Map<MacAddress, number | undefined> = new Map()
  private readonly matterPortAllocator: MatterPortAllocator
  private readonly configuredHapPorts: Set<number>

  constructor(
    private externalPorts?: ExternalPortsConfiguration,
    matterPorts?: ExternalPortsConfiguration,
    configuredMatterPorts?: number[],
    configuredHapPorts?: number[],
  ) {
    // Bridge ports from the config, which external accessories must not be given
    this.configuredHapPorts = new Set(configuredHapPorts)

    // Delegate Matter port allocation to specialized allocator
    this.matterPortAllocator = new MatterPortAllocator(matterPorts, configuredMatterPorts)
  }

  /**
   * Returns the next available HAP port in the external port config.
   * If the external port is not configured by the user it will return undefined.
   * If the port range has been exhausted it will return undefined.
   */
  public async requestPort(username: MacAddress): Promise<number | undefined> {
    // check to see if this device has already requested an external port
    const existingPortAllocation = this.allocatedPorts.get(username)
    if (existingPortAllocation) {
      return existingPortAllocation
    }

    // get the next unused port
    const port = this.getNextFreePort()
    this.allocatedPorts.set(username, port)
    return port
  }

  /**
   * Returns the next available Matter port in the Matter port config.
   * Delegates to MatterPortAllocator to keep Matter code in Matter module.
   *
   * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
   */
  public async requestMatterPort(uuid: string): Promise<number | undefined> {
    return await this.matterPortAllocator.requestPort(uuid)
  }

  /**
   * Release a Matter port previously obtained via {@link requestMatterPort}.
   * Call when an external Matter accessory is unregistered or fails to
   * publish — otherwise the pool accumulates dead allocations and
   * eventually exhausts on long-running installs.
   */
  public releaseMatterPort(uuid: string): boolean {
    return this.matterPortAllocator.releasePort(uuid)
  }

  private getNextFreePort(): number | undefined {
    if (!this.externalPorts) {
      return undefined
    }

    // Step past any port a bridge is configured to use
    do {
      this.nextExternalPort = this.nextExternalPort === undefined
        ? this.externalPorts.start
        : this.nextExternalPort + 1
    } while (this.nextExternalPort <= this.externalPorts.end && this.configuredHapPorts.has(this.nextExternalPort))

    if (this.nextExternalPort <= this.externalPorts.end) {
      return this.nextExternalPort
    }

    Logger.internal.warn('External HAP port pool ran out of ports. Falling back to random port assignment.')

    return undefined
  }
}

/**
 * This is the child bridge version of the port allocation service.
 * It requests free ports from the main bridge's port service via IPC.
 */
export class ChildBridgeExternalPortService extends ExternalPortService {
  constructor(
    private childBridge: ChildBridgeFork,
  ) {
    super()
  }

  public async requestPort(username: MacAddress): Promise<number | undefined> {
    return await this.childBridge.requestExternalPort(username)
  }

  public async requestMatterPort(uniqueId: string): Promise<number | undefined> {
    // For child bridges, request Matter port from parent via IPC
    return await this.childBridge.requestMatterPort(uniqueId)
  }

  public override releaseMatterPort(uniqueId: string): boolean {
    // Child-side ports live in the parent process's allocator. Forward
    // the release over IPC so the parent reclaims the slot — releasing
    // locally would touch the (unused) child-side allocator instead.
    this.childBridge.releaseMatterPort(uniqueId)
    return true
  }
}
