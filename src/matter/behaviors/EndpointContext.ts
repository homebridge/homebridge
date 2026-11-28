/**
 * Endpoint Context Utilities
 *
 * Provides a way to attach context (like RegistryManager) to Matter.js endpoints.
 * This allows multiple MatterServer instances to coexist independently.
 */

import type { Endpoint } from '@matter/main'

import type { BehaviorRegistry } from './BehaviorRegistry.js'
import type { RegistryManager } from './RegistryManager.js'

/**
 * Symbol for storing RegistryManager on endpoints
 * Using a Symbol prevents naming conflicts with Matter.js properties
 */
const REGISTRY_MANAGER_KEY = Symbol('homebridgeRegistryManager')

/**
 * Symbol for storing the cluster state an endpoint was registered with
 */
const DECLARED_CLUSTERS_KEY = Symbol('homebridgeDeclaredClusters')

type DeclaredClusters = Record<string, Record<string, unknown> | undefined>

/**
 * Minimal endpoint surface used to store Homebridge context.
 */
export type EndpointWithContext = Pick<Endpoint, 'id'> & {
  [REGISTRY_MANAGER_KEY]?: RegistryManager
  [DECLARED_CLUSTERS_KEY]?: DeclaredClusters
}

/**
 * Remember the cluster state an endpoint is registered with. matter.js puts
 * its saved state over these values when the endpoint starts, so a behavior
 * that has to tell the two apart (see modeRepair.ts) reads them from here.
 */
export function setDeclaredClusters(endpoint: EndpointWithContext, clusters: DeclaredClusters | undefined): void {
  endpoint[DECLARED_CLUSTERS_KEY] = clusters
}

/**
 * The cluster state an endpoint was registered with, if it was recorded.
 */
export function declaredClustersOf(endpoint: EndpointWithContext): DeclaredClusters | undefined {
  return endpoint[DECLARED_CLUSTERS_KEY]
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

/**
 * The handler registry of the server an endpoint belongs to. Every Homebridge
 * behavior reaches its plugin handlers through this, so the way the registry
 * is found lives in one place.
 */
export function registryOf(endpoint: EndpointWithContext): BehaviorRegistry {
  return getRegistryManager(endpoint).getRegistry(endpoint.id)
}
