import type { MacAddress } from 'hap-nodejs'

import type { ChildBridgeFork } from './childBridgeFork.js'

import { Logger } from './logger.js'

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
  private allocatedMatterPorts: Map<string, number | undefined> = new Map()
  private readonly configuredMatterPorts: Set<number> = new Set()

  constructor(
    private externalPorts?: ExternalPortsConfiguration,
    private matterPorts?: ExternalPortsConfiguration,
    configuredMatterPorts?: number[],
  ) {
    if (configuredMatterPorts) {
      this.configuredMatterPorts = new Set(configuredMatterPorts)
    }
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
   * If Matter ports are not configured, falls back to range 5530-5541.
   * If the port range has been exhausted it will return undefined.
   *
   * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
   */
  public async requestMatterPort(uuid: string): Promise<number | undefined> {
    // Check to see if this accessory has already requested a Matter port
    const existingPortAllocation = this.allocatedMatterPorts.get(uuid)
    if (existingPortAllocation) {
      return existingPortAllocation
    }

    // Get the next unused Matter port
    const port = this.getNextFreeMatterPort()
    this.allocatedMatterPorts.set(uuid, port)
    return port
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

  private getNextFreeMatterPort(): number | undefined {
    // Fallback to default range 5530-5541, avoiding already allocated ports
    const rangeStart = this.matterPorts?.start || 5530
    const rangeEnd = this.matterPorts?.end || 5541
    const allocatedPortValues = new Set([
      ...this.configuredMatterPorts,
      ...Array.from(this.allocatedMatterPorts.values()).filter((p): p is number => p !== undefined),
    ])

    // Find first unallocated port in range 5530-5541
    for (let port = rangeStart; port <= rangeEnd; port += 1) {
      if (!allocatedPortValues.has(port)) {
        return port
      }
    }

    throw new Error(`No available Matter ports in range ${rangeStart}-${rangeEnd}. All ports are already allocated.`)
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
}
