/**
 * Behavior Registry
 *
 * Manages handler registration and accessory state for a MatterServer instance.
 * Each MatterServer has its own BehaviorRegistry for isolated state management.
 */

import type { MatterServer } from '../server.js'
import type { InternalMatterAccessory, MatterHandlerContext } from '../types.js'

import { Logger } from '../../logger.js'

const log = Logger.withPrefix('Matter/Behaviors')

/**
 * Handler function signature
 * Matches the signature from types.ts to maintain compatibility with user-defined handlers
 */
export type MatterCommandHandler = (args?: unknown, context?: MatterHandlerContext) => void | Promise<void>

/**
 * Accessory map type
 */
export type MatterAccessoryMap = Map<string, InternalMatterAccessory>

/**
 * Registry for behavior handlers and accessory state.
 * Each MatterServer instance has its own BehaviorRegistry.
 */
export class BehaviorRegistry {
  // Handler storage: endpointId -> clusterName -> commandName -> handler
  private handlers = new Map<string, Map<string, Map<string, MatterCommandHandler>>>()

  // Part endpoint mapping: endpointId -> { parentUuid, partId }
  private partEndpoints = new Map<string, { parentUuid: string, partId: string }>()

  // Reference to accessories map (not owned by registry)
  private accessoriesMap: MatterAccessoryMap

  // Reference to MatterServer for state change notifications
  private server?: MatterServer

  constructor(accessoriesMap: MatterAccessoryMap, server?: MatterServer) {
    this.accessoriesMap = accessoriesMap
    this.server = server
  }

  /**
   * Set the MatterServer reference (called after server is created)
   */
  setServer(server: MatterServer): void {
    this.server = server
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
   *
   * @param endpointId - Endpoint identifier
   * @param clusterName - Cluster name
   * @param commandName - Command name
   * @param args - Optional arguments to pass to the handler
   * @param context - Optional context information
   * @returns True once the handler has run successfully
   * @throws Error if no handler is registered for the endpoint/cluster/command
   */
  async executeHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
    args?: unknown,
    context?: MatterHandlerContext,
  ): Promise<boolean> {
    const handler = this.getHandler(endpointId, clusterName, commandName)
    if (!handler) {
      throw new Error(`No handler registered for ${endpointId}.${clusterName}.${commandName}`)
    }

    try {
      await handler(args, context)
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

      // Notify server of state change (for UI updates)
      if (this.server) {
        this.server.notifyStateChange(partInfo.parentUuid, clusterName, attributes, partInfo.partId)
      }
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

      // Notify server of state change (for UI updates)
      if (this.server) {
        this.server.notifyStateChange(endpointId, clusterName, attributes)
      }
    }
  }

  /**
   * Drop every handler for the given endpoint (and any of its registered
   * parts) when the accessory unregisters. Without this the registry
   * accumulates entries for dead UUIDs across register/unregister cycles
   * — handlers retain plugin closures and prevent the accessory's resources
   * from being collected.
   */
  removeEndpoint(endpointId: string): string[] {
    // Track every endpoint id we drop (the accessory itself + any of its part
    // endpoints) so callers can mirror the same cleanup in other registries
    // (e.g. RegistryManager, which has no parent-aware sweep of its own).
    const removed: string[] = [endpointId]
    this.handlers.delete(endpointId)
    // Sweep any part endpoints whose parent matches the unregistering UUID,
    // and drop their handler tables too.
    for (const [partId, info] of this.partEndpoints) {
      if (info.parentUuid === endpointId || partId === endpointId) {
        this.partEndpoints.delete(partId)
        this.handlers.delete(partId)
        if (partId !== endpointId) {
          removed.push(partId)
        }
      }
    }
    return removed
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
