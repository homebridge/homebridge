/**
 * Registry Manager
 *
 * Manages the mapping between endpoints and their behavior registries.
 * Each MatterServer instance creates its own RegistryManager, which is then
 * attached to endpoints via EndpointContext. This design allows multiple
 * MatterServer instances (main bridge + external accessories) to coexist
 * without registry conflicts.
 */

import type { BehaviorRegistry } from './BehaviorRegistry.js'

import { Logger } from '../../logger.js'

const log = Logger.withPrefix('Matter/RegistryManager')

/**
 * Registry manager for a specific MatterServer instance.
 * Each MatterServer creates its own RegistryManager instance.
 */
export class RegistryManager {
  private endpointToRegistry = new Map<string, BehaviorRegistry>()

  /**
   * Register a registry for a specific endpoint
   */
  registerEndpoint(endpointId: string, registry: BehaviorRegistry): void {
    this.endpointToRegistry.set(endpointId, registry)
    log.debug(`Registered registry for endpoint: ${endpointId}`)
  }

  /**
   * Get the registry for a specific endpoint
   */
  getRegistry(endpointId: string): BehaviorRegistry {
    const registry = this.endpointToRegistry.get(endpointId)
    if (!registry) {
      throw new Error(`No registry found for endpoint ${endpointId}. Available endpoints: ${[...this.endpointToRegistry.keys()].join(', ')}`)
    }
    return registry
  }

  /**
   * Unregister an endpoint (cleanup)
   */
  unregisterEndpoint(endpointId: string): void {
    this.endpointToRegistry.delete(endpointId)
    log.debug(`Unregistered endpoint: ${endpointId}`)
  }

  /**
   * Clear all registrations (for cleanup/testing)
   */
  clear(): void {
    this.endpointToRegistry.clear()
  }

  /**
   * Get statistics
   */
  getStats(): { endpointCount: number, endpoints: string[] } {
    return {
      endpointCount: this.endpointToRegistry.size,
      endpoints: [...this.endpointToRegistry.keys()],
    }
  }
}
