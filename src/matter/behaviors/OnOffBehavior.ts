/**
 * OnOff Cluster Behavior
 *
 * Handles on/off commands for lights, switches, and outlets
 */

import { OnOffServer } from '@matter/main/behaviors/on-off'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

export class HomebridgeOnOffServer extends OnOffServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  override initialize(): void {
    super.initialize()

    // Report every change to this cluster, not only the ones its own on/off
    // commands made. A brightness command can turn a light on or off through
    // the LevelControl cluster's coupling, and that change is made by
    // matter.js rather than by any handler here - so without this the cache
    // and the UI would still show the old on/off state.
    this.reactTo(this.events.onOff$Changed, this.syncOnOffToCache)
  }

  /**
   * Mirror the cluster's own state into the accessory cache, whatever changed
   * it. Reading the value from the event means the cache follows what matter
   * actually committed, rather than a value predicted before the fact.
   */
  private syncOnOffToCache(onOff: boolean): void {
    this.getRegistry().syncStateToCache(this.endpoint.id, 'onOff', { onOff })
  }

  /**
   * Handle 'on' command
   */
  override async on(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'onOff', 'on')

      // Only reached if handler succeeded - update Matter state
      await super.on()

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'onOff', { onOff: true })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to turn on: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle 'off' command
   */
  override async off(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'onOff', 'off')

      // Only reached if handler succeeded - update Matter state
      await super.off()

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'onOff', { onOff: false })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to turn off: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle 'toggle' command
   */
  override async toggle(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'onOff', 'toggle')

      // Only reached if handler succeeded - update Matter state
      await super.toggle()

      // Sync state to cache (super.toggle() already updated this.state.onOff)
      registry.syncStateToCache(endpointId, 'onOff', { onOff: this.state.onOff })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to toggle: ${message}`, Status.Failure)
    }
  }
}
