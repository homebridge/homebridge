/**
 * ClosureControl Cluster Behavior
 *
 * Handles move/stop commands for closures - garage doors, gates and similar.
 */

import { ClosureControlServer } from '@matter/main/behaviors/closure-control'
import { ClosureControl } from '@matter/main/clusters/closure-control'
import { Status, StatusResponseError } from '@matter/main/types'

import { MatterStatus } from '../errors.js'
import { getRegistryManager } from './EndpointContext.js'

/**
 * Default ClosureControl Server.
 *
 * matter.js's base ClosureControlServer implements none of the commands -
 * invoking one throws NotImplementedError - so a closure without plugin
 * handlers would advertise moveTo/stop and then fail every one. This default
 * reflects the command in the cluster state instead, which is enough for the
 * endpoint to behave sanely on its own.
 *
 * The move is reported as complete immediately. A plugin that knows better
 * (a garage door takes ~15 seconds) should update `overallCurrentState` from
 * its own device reports; the point here is only that the target is recorded
 * and the closure never looks stuck.
 */
export class DefaultClosureControlServer extends ClosureControlServer {
  override async moveTo(request: ClosureControl.MoveToRequest): Promise<void> {
    const target = {
      ...(this.state.overallTargetState ?? {}),
      ...(request.position !== undefined ? { position: request.position } : {}),
      ...(request.latch !== undefined ? { latch: request.latch } : {}),
      ...(request.speed !== undefined ? { speed: request.speed } : {}),
    }

    this.state.overallTargetState = target as typeof this.state.overallTargetState
    this.state.overallCurrentState = target as typeof this.state.overallCurrentState
    this.state.mainState = ClosureControl.MainState.Stopped
  }

  override async stop(): Promise<void> {
    // Stopping leaves the closure wherever it is, so the target becomes the
    // current position rather than the other way round.
    this.state.overallTargetState = this.state.overallCurrentState as typeof this.state.overallTargetState
    this.state.mainState = ClosureControl.MainState.Stopped
  }
}

/**
 * Custom ClosureControl Server that calls plugin handlers.
 *
 * Extends the default server so `super.*()` records the state (the matter.js
 * base would throw NotImplementedError).
 */
export class HomebridgeClosureControlServer extends DefaultClosureControlServer {
  /**
   * Get the registry for this behavior's endpoint
   */
  private getRegistry() {
    return getRegistryManager(this.endpoint).getRegistry(this.endpoint.id)
  }

  /**
   * Handle 'moveTo' command
   */
  override async moveTo(request: ClosureControl.MoveToRequest): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'closureControl', 'moveTo', request)

      // Only reached if handler succeeded - update Matter state via super
      await super.moveTo(request)

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'closureControl', {
        overallTargetState: this.state.overallTargetState,
        overallCurrentState: this.state.overallCurrentState,
        mainState: this.state.mainState,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to move closure: ${message}`, Status.Failure)
    }
  }

  /**
   * Handle 'stop' command
   */
  override async stop(): Promise<void> {
    const endpointId = this.endpoint.id
    const registry = this.getRegistry()

    try {
      // Execute user handler
      await registry.executeHandler(endpointId, 'closureControl', 'stop')

      // Only reached if handler succeeded - update Matter state via super
      await super.stop()

      // Sync state to cache
      registry.syncStateToCache(endpointId, 'closureControl', {
        overallTargetState: this.state.overallTargetState,
        mainState: this.state.mainState,
      })
    } catch (error) {
      // If user handler already threw a StatusResponseError, propagate it as-is
      // This sends a proper Matter protocol error response to the controller
      if (MatterStatus.isMatterProtocolError(error)) {
        throw error
      }

      // For other errors, wrap in appropriate StatusResponseError
      // This prevents the endpoint from crashing and keeps the device online
      const message = error instanceof Error ? error.message : String(error)
      throw new StatusResponseError(`Failed to stop closure: ${message}`, Status.Failure)
    }
  }
}
