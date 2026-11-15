/**
 * Behavior Registry
 *
 * Manages handler registration and accessory state for a MatterServer instance.
 * Each MatterServer has its own BehaviorRegistry for isolated state management.
 */

import type { MatterServer } from '../server.js'
import type { InternalMatterAccessory, MatterHandlerContext } from '../types.js'

import { Status, StatusResponseError } from '@matter/main/types'

import { Logger } from '../../logger.js'
import { MatterStatus } from '../errors.js'
import { runInHandlerScope } from './handlerScope.js'

const log = Logger.withPrefix('Matter/Behaviors')

/**
 * The Failure status executeHandler raises itself, when a plugin handler threw
 * something that is not a Matter status, or when there is no handler. A class
 * of its own so the few clusters that answer a failed handler with their own
 * status (keypad input, media playback) can tell it from a status the plugin
 * threw on purpose.
 */
export class HandlerFailure extends StatusResponseError {
  constructor(message: string) {
    super(message, Status.Failure)
  }
}

/**
 * A handler as the registry stores it: any command's handler, so the request
 * is not typed. The typed one a plugin writes is MatterCommandHandler in
 * types.ts (the same name, for a plugin's handler of one known command).
 */
export type MatterCommandHandler = (args?: unknown, context?: MatterHandlerContext) => unknown

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

  /** The commands already reported as having no handler, so each is said once. */
  private reportedMissing = new Set<string>()

  // Reference to accessories map (not owned by registry)
  private accessoriesMap: MatterAccessoryMap

  // Reference to MatterServer for state change notifications
  private server?: MatterServer

  constructor(accessoriesMap: MatterAccessoryMap, server?: MatterServer) {
    this.accessoriesMap = accessoriesMap
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
    let endpointHandlers = this.handlers.get(endpointId)
    if (!endpointHandlers) {
      endpointHandlers = new Map()
      this.handlers.set(endpointId, endpointHandlers)
    }

    let clusterHandlers = endpointHandlers.get(clusterName)
    if (!clusterHandlers) {
      clusterHandlers = new Map()
      endpointHandlers.set(clusterName, clusterHandlers)
    }

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
   * What a handler is told about where the command arrived: the accessory,
   * and the part when it was one of the accessory's parts.
   */
  private contextOf(endpointId: string): MatterHandlerContext {
    const part = this.partEndpoints.get(endpointId)
    return part
      ? { uuid: part.parentUuid, partId: part.partId }
      : { uuid: endpointId }
  }

  /**
   * Execute a handler if it exists
   *
   * @param endpointId - Endpoint identifier
   * @param clusterName - Cluster name
   * @param commandName - Command name
   * @param args - Optional arguments to pass to the handler
   * @param context - Passed to the handler in place of the endpoint's own context
   * @returns True once the handler has run successfully, false when the plugin has no handler for the command
   * @throws a Matter status error: the plugin's own, or Failure when the handler threw anything else
   */
  async executeHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
    args?: unknown,
    context?: MatterHandlerContext,
  ): Promise<boolean> {
    return (await this.runHandler(endpointId, clusterName, commandName, args, context)).handled
  }

  /**
   * Execute a handler if it exists, and also give back what it returned. For
   * the commands that answer with a status of their own (see
   * handlerResponse.ts); every other command uses executeHandler().
   *
   * @returns `handled` as executeHandler() returns it, and `response`: what the handler returned
   * @throws as executeHandler() does
   */
  async runHandler(
    endpointId: string,
    clusterName: string,
    commandName: string,
    args?: unknown,
    context?: MatterHandlerContext,
  ): Promise<{ handled: boolean, response?: unknown }> {
    const handler = this.getHandler(endpointId, clusterName, commandName)
    if (!handler) {
      // Every handler is optional. With none, the command is not failed: the
      // caller carries on and matter.js updates the state, as HAP accepts a
      // write to a characteristic that has no onSet. Said once per command,
      // at debug level, for the plugin author who forgot one.
      const key = `${endpointId}.${clusterName}.${commandName}`
      if (!this.reportedMissing.has(key)) {
        this.reportedMissing.add(key)
        log.debug(`No handler registered for ${key}: the state is updated without calling the plugin`)
      }
      return { handled: false }
    }

    try {
      const response = await runInHandlerScope(() => handler(args, context ?? this.contextOf(endpointId)))
      return { handled: true, response }
    } catch (error) {
      log.error(`Handler error for ${endpointId}.${clusterName}.${commandName}:`, error)
      // A Matter status a plugin threw on purpose (api.matter.status) goes to
      // the controller as it is. Anything else becomes a plain Failure that
      // names the handler. This is the one place that does it: every behavior
      // calls its handlers through here, so none needs a catch block of its own.
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }
      const message = error instanceof Error
        ? error.message
        : String(error)
      const failure = new HandlerFailure(`The ${clusterName}.${commandName} handler failed: ${message}`)
      failure.cause = error
      throw failure
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
   * Updates the cached cluster state of the accessory, or of the part the
   * endpoint belongs to, and tells the server (for UI updates)
   */
  syncStateToCache(
    endpointId: string,
    clusterName: string,
    attributes: Record<string, unknown>,
  ): void {
    const partInfo = this.partEndpoints.get(endpointId)
    const uuid = partInfo?.parentUuid ?? endpointId
    const accessory = this.accessoriesMap.get(uuid)
    const target = partInfo
      ? accessory?._parts?.find(part => part.id === partInfo.partId)
      : accessory
    if (!target?.clusters) {
      return
    }

    target.clusters[clusterName] = {
      ...target.clusters[clusterName],
      ...attributes,
    }

    if (partInfo) {
      log.debug(`Synced ${clusterName} state to cache for part ${partInfo.partId}:`, attributes)
      this.server?.notifyStateChange(uuid, clusterName, attributes, partInfo.partId)
    } else {
      log.debug(`Synced ${clusterName} state to cache for ${endpointId}:`, attributes)
      this.server?.notifyStateChange(uuid, clusterName, attributes)
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
    for (const key of this.reportedMissing) {
      if (key.startsWith(`${endpointId}.`) || key.startsWith(`${endpointId}-part-`)) {
        this.reportedMissing.delete(key)
      }
    }
    // Sweep any part endpoints whose parent matches the unregistering UUID,
    // and drop their handler tables too.
    for (const [partEndpointId, info] of this.partEndpoints) {
      if (info.parentUuid === endpointId || partEndpointId === endpointId) {
        this.partEndpoints.delete(partEndpointId)
        this.handlers.delete(partEndpointId)
        if (partEndpointId !== endpointId) {
          removed.push(partEndpointId)
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
    this.reportedMissing.clear()
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
