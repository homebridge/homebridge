/**
 * Matter Port Allocator
 *
 * Handles allocation of Matter protocol ports for the main bridge and external accessories.
 */

import type { ExternalPortsConfiguration } from '../externalPortService.js'

import { Logger } from '../logger.js'

const log = Logger.withPrefix('Matter/PortAllocator')

/**
 * Allocates Matter ports from the user-defined `config.matterPorts` option.
 * Separate from HAP port allocation to avoid conflicts.
 */
export class MatterPortAllocator {
  private allocatedPorts: Map<string, number | undefined> = new Map()
  private readonly configuredPorts: Set<number> = new Set()

  constructor(
    private matterPorts?: ExternalPortsConfiguration,
    configuredMatterPorts?: number[],
  ) {
    if (configuredMatterPorts) {
      this.configuredPorts = new Set(configuredMatterPorts)
    }
  }

  /**
   * Returns the next available Matter port in the Matter port config.
   * If Matter ports are not configured, falls back to range 5530-5541.
   * If the port range has been exhausted it will return undefined.
   *
   * @param uuid - Unique identifier for the Matter accessory (can be accessory UUID or other unique string)
   */
  public async requestPort(uuid: string): Promise<number | undefined> {
    // Check to see if this accessory has already requested a Matter port
    const existingPortAllocation = this.allocatedPorts.get(uuid)
    if (existingPortAllocation !== undefined) {
      return existingPortAllocation
    }

    // Get the next unused Matter port
    const port = this.getNextFreePort()
    // Only record an allocation when we actually obtained a port. When the
    // range is exhausted getNextFreePort() returns undefined — storing a
    // uuid->undefined entry would leave a dead key that never releases and
    // inflates getStats().allocatedCount with a port that was never claimed.
    if (port !== undefined) {
      this.allocatedPorts.set(uuid, port)
    }
    return port
  }

  /**
   * Get the next free Matter port from the configured range
   */
  private getNextFreePort(): number | undefined {
    // Fallback to default range 5530-5541, avoiding already allocated ports
    const rangeStart = this.matterPorts?.start || 5530
    const rangeEnd = this.matterPorts?.end || 5541

    if (rangeStart > rangeEnd) {
      log.error(`Invalid Matter port range: start (${rangeStart}) is greater than end (${rangeEnd}).`)
      return undefined
    }

    const allocatedPortValues = new Set([
      ...this.configuredPorts,
      ...[...this.allocatedPorts.values()].filter((p): p is number => p !== undefined),
    ])

    // Find first unallocated port in preferred range
    for (let port = rangeStart; port <= rangeEnd; port += 1) {
      if (!allocatedPortValues.has(port)) {
        return port
      }
    }

    // Preferred range exhausted - find any available port above the range
    log.warn(`Matter port range ${rangeStart}-${rangeEnd} exhausted, allocating from extended range.`)
    for (let port = rangeEnd + 1; port <= 65535; port += 1) {
      if (!allocatedPortValues.has(port)) {
        return port
      }
    }

    log.error('No available ports remaining for Matter allocation.')
    return undefined
  }

  /**
   * Release a previously allocated port back into the pool. Called when an
   * external Matter accessory is unregistered or its publish fails — without
   * this, allocations accumulate forever and the pool eventually exhausts on
   * a long-running install that adds and removes accessories.
   *
   * @param uuid - Same key originally passed to requestPort
   * @returns true if a port was released, false if no allocation existed
   */
  public releasePort(uuid: string): boolean {
    return this.allocatedPorts.delete(uuid)
  }

  /**
   * Get statistics about port allocation
   */
  public getStats(): { allocatedCount: number, configuredPortsCount: number } {
    return {
      allocatedCount: this.allocatedPorts.size,
      configuredPortsCount: this.configuredPorts.size,
    }
  }
}
