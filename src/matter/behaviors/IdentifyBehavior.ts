/**
 * Identify Cluster Behavior
 *
 * Handles identify commands (e.g., flash LED, beep sound)
 */

import type { Identify } from '@matter/main/clusters'

import { IdentifyServer } from '@matter/main/behaviors/identify'

import { getRegistryManager } from './EndpointContext.js'

/**
 * Custom Identify Server that calls plugin handlers
 */
export class HomebridgeIdentifyServer extends IdentifyServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override async identify(request: Identify.IdentifyRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    // Execute user handler
    await registry.executeHandler(endpointId, 'identify', 'identify', request)

    // Only reached if handler succeeded - call base implementation
    return await super.identify(request)
  }
}
