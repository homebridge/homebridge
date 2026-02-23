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
 * Extended Endpoint interface with Homebridge context
 */
export interface EndpointWithContext extends Endpoint {
  [REGISTRY_MANAGER_KEY]?: RegistryManager
}

/**
 * Attach a RegistryManager to an endpoint.
 * Behaviors can then access their registry via this endpoint context.
 */
export function setRegistryManager(endpoint: Endpoint, registryManager: RegistryManager): void {
  (endpoint as EndpointWithContext)[REGISTRY_MANAGER_KEY] = registryManager
}

/**
 * Get the RegistryManager attached to an endpoint
 * Throws if no RegistryManager is attached (programming error)
 */
export function getRegistryManager(endpoint: Endpoint): RegistryManager {
  const registryManager = (endpoint as EndpointWithContext)[REGISTRY_MANAGER_KEY]
  if (!registryManager) {
    throw new Error(`No RegistryManager attached to endpoint ${endpoint.id}. This is a programming error.`)
  }
  return registryManager
}
