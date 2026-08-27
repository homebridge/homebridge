/**
 * Endpoint Context Utilities
 *
 * Provides a way to attach context (like RegistryManager) to Matter.js endpoints.
 * This allows multiple MatterServer instances to coexist independently.
 */

import type { Endpoint } from '@matter/main'

import type { RegistryManager } from './RegistryManager.js'

/**
 * Symbol for storing RegistryManager on endpoints
 * Using a Symbol prevents naming conflicts with Matter.js properties
 */
const REGISTRY_MANAGER_KEY = Symbol('homebridgeRegistryManager')

/**
 * Minimal endpoint surface used to store Homebridge context.
 */
export type EndpointWithContext = Pick<Endpoint, 'id'> & {
  [REGISTRY_MANAGER_KEY]?: RegistryManager
}

/**
 * Attach a RegistryManager to an endpoint.
 * Behaviors can then access their registry via this endpoint context.
 */
export function setRegistryManager(endpoint: EndpointWithContext, registryManager: RegistryManager): void {
  endpoint[REGISTRY_MANAGER_KEY] = registryManager
}

/**
 * Get the RegistryManager attached to an endpoint
 * Throws if no RegistryManager is attached (programming error)
 */
export function getRegistryManager(endpoint: EndpointWithContext): RegistryManager {
  const registryManager = endpoint[REGISTRY_MANAGER_KEY]
  if (!registryManager) {
    throw new Error(`No RegistryManager attached to endpoint ${endpoint.id}. This is a programming error.`)
  }
  return registryManager
}
