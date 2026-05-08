import type { MacAddress } from '@homebridge/hap-nodejs'

import type { ChildBridgeFork } from './childBridgeFork.js'

import { Logger } from './logger.js'
import { MatterPortAllocator } from './matter/MatterPortAllocator.js'

export interface ExternalPortsConfiguration {
  start: number
  end: number
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

  constructor(
    private externalPorts?: ExternalPortsConfiguration,
    matterPorts?: ExternalPortsConfiguration,
    configuredMatterPorts?: number[],
  ) {
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

    if (this.nextExternalPort === undefined) {
      this.nextExternalPort = this.externalPorts.start
      return this.nextExternalPort
    }

    this.nextExternalPort++

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
