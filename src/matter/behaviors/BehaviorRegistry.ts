/**
 * Behavior Registry
 *
 * Manages handler registration and accessory state without global mutable state.
 * This replaces the global Maps in matterBehaviors.ts.
 */

import type { InternalMatterAccessory } from '../types.js'

import { Logger } from '../../logger.js'

const log = Logger.withPrefix('Matter/Behaviors')

/**
 * Handler function signature
 */
export type MatterCommandHandler = (...args: any[]) => void | Promise<void>

/**
 * Accessory map type
 */
export type MatterAccessoryMap = Map<string, InternalMatterAccessory>

/**
 * Registry for behavior handlers and accessory state
 * Replaces global state with a proper class instance
 */
export class BehaviorRegistry {
  // Handler storage: endpointId -> clusterName -> commandName -> handler
  private handlers = new Map<string, Map<string, Map<string, MatterCommandHandler>>>()

  // Part endpoint mapping: endpointId -> { parentUuid, partId }
  private partEndpoints = new Map<string, { parentUuid: string, partId: string }>()

  // Reference to accessories map (not owned by registry)
  private accessoriesMap: MatterAccessoryMap

  constructor(accessoriesMap: MatterAccessoryMap) {
    this.accessoriesMap = accessoriesMap
  }

  /**
   * Register a command handler for an endpoint
   */
  registerHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
    handler: MatterCommandHandler,
  ): void {
    if (!this.handlers.has(endpointId)) {
      this.handlers.set(endpointId, new Map())
    }

    const endpointHandlers = this.handlers.get(endpointId)!
    if (!endpointHandlers.has(clusterName)) {
      endpointHandlers.set(clusterName, new Map())
    }

    const clusterHandlers = endpointHandlers.get(clusterName)!
    clusterHandlers.set(commandName, handler)

    log.debug(`Registered handler: ${endpointId}.${clusterName}.${commandName}`)
  }

  /**
   * Get a registered handler
   */
  getHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
  ): MatterCommandHandler | undefined {
    return this.handlers.get(endpointId)?.get(clusterName)?.get(commandName)
  }

  /**
   * Execute a handler if it exists
   */
  async executeHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
    ...args: any[]
  ): Promise<boolean> {
    const handler = this.getHandler(endpointId, clusterName, commandName)
    if (!handler) {
      return false
    }

    try {
      await handler(...args)
      return true
    } catch (error) {
      log.error(`Handler error for ${endpointId}.${clusterName}.${commandName}:`, error)
      throw error
    }
  }

  /**
   * Register a part endpoint mapping
   */
  registerPartEndpoint(endpointId: string, parentUuid: string, partId: string): void {
    this.partEndpoints.set(endpointId, { parentUuid, partId })
    log.debug(`Registered part endpoint: ${endpointId} -> ${parentUuid}.${partId}`)
  }

  /**
   * Get part endpoint info
   */
  getPartEndpointInfo(endpointId: string): { parentUuid: string, partId: string } | undefined {
    return this.partEndpoints.get(endpointId)
  }

  /**
   * Sync cluster state to cache
   * Updates the accessory's cached cluster state when values change
   */
  syncStateToCache(
    endpointId: string,
    clusterName: string,
    attributes: Record<string, unknown>,
  ): void {
    // Check if this is a part endpoint
    const partInfo = this.partEndpoints.get(endpointId)

    if (partInfo) {
      // Update part cluster state
      const accessory = this.accessoriesMap.get(partInfo.parentUuid)
      if (!accessory?._parts) {
        return
      }

      const part = accessory._parts.find(p => p.id === partInfo.partId)
      if (!part?.clusters) {
        return
      }

      if (!part.clusters[clusterName]) {
        part.clusters[clusterName] = {}
      }

      part.clusters[clusterName] = {
        ...part.clusters[clusterName],
        ...attributes,
      }

      log.debug(`Synced ${clusterName} state to cache for part ${partInfo.partId}:`, attributes)
    } else {
      // Update main accessory cluster state
      const accessory = this.accessoriesMap.get(endpointId)
      if (!accessory?.clusters) {
        return
      }

      if (!accessory.clusters[clusterName]) {
        accessory.clusters[clusterName] = {}
      }

      accessory.clusters[clusterName] = {
        ...accessory.clusters[clusterName],
        ...attributes,
      }

      log.debug(`Synced ${clusterName} state to cache for ${endpointId}:`, attributes)
    }
  }

  /**
   * Clear all handlers (for cleanup)
   */
  clear(): void {
    this.handlers.clear()
    this.partEndpoints.clear()
  }

  /**
   * Get statistics
   */
  getStats(): { handlerCount: number, partCount: number } {
    let handlerCount = 0
    for (const endpointHandlers of this.handlers.values()) {
      for (const clusterHandlers of endpointHandlers.values()) {
        handlerCount += clusterHandlers.size
      }
    }

    return {
      handlerCount,
      partCount: this.partEndpoints.size,
    }
  }
}
